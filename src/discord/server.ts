import { D1Result } from '@cloudflare/workers-types';
import { InteractionResponseType, InteractionType, verifyKey } from 'discord-interactions';
import { Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import { decode, sign, verify } from 'hono/jwt';
import * as crypto from 'node:crypto';
import { getAddress } from 'viem';

import { SiweMessage, generateNonce } from '../siwe/index';
import { doRoll } from './dnd-stuff';

import {
  Binder,
  MAX_WALLETS,
  abbreviateEthereumAddress,
  addUsersDiscordRole,
  getMemberFromDiscord,
  getMembersFromDiscord,
  removeUsersDiscordRole,
  web3BalanceOfDiscordRoles,
} from './handlers';
import {
  discordAddRole,
  discordGetRoles,
  discordRemoveRole,
  discordSyncRoles,
  discordVerify,
  discordViewRoles,
} from './interactions';

const router = new Hono();
router.use('/siwe/*', cors());
router.use('/discord/*', cors());

router.all('/', (ctx: Context) => {
  return ctx.text(`👋 ${new Date().toISOString()}`);
});

router.get('/siwe/nonce', async (ctx: Context) => {
  const nonce = generateNonce();
  return ctx.json({ nonce });
});

router.put('/siwe/verify', async (ctx: Context) => {
  const { message, signature, nonce } = await ctx.req.json();
  const siweMessage = new SiweMessage(message);
  const siweResponse = await siweMessage.verify({
    signature: signature,
    nonce: nonce,
  });
  if (!siweResponse.success) return ctx.text('Failed SIWE verify', 422);
  const siwe = await sign(siweResponse.data.toMessage(), ctx.env.AUTH_SECRET);
  return ctx.json({ siwe });
});

router.post('/siwe/session', async (ctx: Context) => {
  const { siwe } = await ctx.req.json();
  const data = decode(siwe);
  if (!data) return ctx.text('Faield SIWE session', 422);
  const siweMessage = new SiweMessage(data.payload);
  return ctx.json({ address: siweMessage.address, chain: siweMessage.chainId });
});

// TODO find a better way to handle OAuth2
// router.post('/discord/login', async (ctx: Context) => {
//   const { access_token, token_type, state } = ctx.req.query();
//   const res = await fetch('https://discord.com/api/users/@me', {
//     headers: { authorization: `${token_type} ${access_token}` },
//   });
//   const user = await res.json();
//   const jwt = await sign({ id: user.id }, ctx.env.AUTH_SECRET); // guildId, username, permissions, avatar
//   return ctx.redirect(`https://raritynfts.xyz/${state}?token=${jwt}`);
// });

router.post('/discord/siwe', async (ctx: Context) => {
  const userData = await verifyJwtRequest(ctx);
  if (!userData) return ctx.text('Unauthorized', 401);
  const count: number = await ctx.env.DB.prepare('SELECT COUNT(id) AS total FROM Wallets WHERE userId = ?')
    .bind(userData.userId)
    .first('total');
  if (count >= MAX_WALLETS) return ctx.text('Too many wallets', 422);
  const { siwe = '' } = await ctx.req.json();
  const siweData = await verify(siwe, ctx.env.AUTH_SECRET);
  const siweMessage = new SiweMessage(siweData);
  const query: D1Result = await ctx.env.DB.prepare(
    'INSERT INTO Wallets (id,address,chain,guildId,userId) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING'
  )
    .bind(crypto.randomUUID(), getAddress(siweMessage.address), siweMessage.chainId, userData.guildId, userData.userId)
    .run();
  return query.success ? ctx.json({}) : ctx.text('Internal Server Error', 500);
});

router.post('/discord/interactions', async (ctx: Context) => {
  const { isValid, interaction } = await server.verifyDiscordRequest(ctx);
  if (!isValid || !interaction) return ctx.text('Unauthorized', 401);

  switch (interaction['type']) {
    case InteractionType.PING:
      return ctx.json({ type: InteractionResponseType.PONG });

    case InteractionType.APPLICATION_COMMAND:
      return ctx.json(await doInteraction(ctx.env, interaction));

    case InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE:
      return ctx.json(await fetchOptions(ctx.env, interaction));

    case InteractionType.MESSAGE_COMPONENT:
    case InteractionType.MODAL_SUBMIT:
    default:
      return ctx.text('Bad Request', 400);
  }
});

router.get('/discord/sync/:userId', async (ctx: Context) => {
  const userData = await verifyJwtRequest(ctx);
  if (!userData) return ctx.text('Unauthorized', 401);
  const isAdmin =
    Boolean(parseInt(userData.permissions) & 8) ||
    ['234657292610568193', '217775277349011456'].includes(userData.userId);
  // if (!isAdmin) return ctx.json('User is not an admin', 422);
  // TODO to lazy for real handling
  if (!isAdmin) return ctx.redirect('https://www.sesamestreet.org/');

  const userId = ctx.req.param('userId');
  const member = await getMemberFromDiscord(ctx.env.DISCORD_TOKEN, userData.guildId, userId);
  if (!member) return ctx.text('Discord API request failed', 424);

  const wallets: D1Result = await ctx.env.DB.prepare('SELECT address, chain FROM Wallets WHERE userId = ?')
    .bind(userId)
    .all();
  const commands: D1Result = await ctx.env.DB.prepare(
    'SELECT source, formula, roleId, chain FROM Commands WHERE guildId = ?'
  )
    .bind(userData.guildId)
    .all();

  const mappedByChain = { 1: { wallets: [], commands: [] } };
  wallets.results.forEach((wallet: any) => {
    if (!mappedByChain[wallet.chain]) mappedByChain[wallet.chain] = { commands: [], wallets: [] };
    mappedByChain[wallet.chain].wallets.push(wallet);
  });
  commands.results.forEach((command: any) => {
    if (!mappedByChain[command.chain]) mappedByChain[command.chain] = { commands: [], wallets: [] };
    mappedByChain[command.chain].commands.push(command);
  });

  const passedRoleIds: Set<string> = new Set();
  const failedRoleIds: Set<string> = new Set();
  for (const chain in mappedByChain) {
    const wallets = mappedByChain[chain].wallets;
    const commands = mappedByChain[chain].commands;
    const { passed, failed } = await web3BalanceOfDiscordRoles(parseInt(chain), wallets, commands);
    passed.forEach((roleId: string) => passedRoleIds.add(roleId));
    failed.forEach((roleId: string) => failedRoleIds.add(roleId));
  }

  const memberRoles = member.roles.map((role: any) => role.id);
  const passedRoles = Array.from(passedRoleIds);
  const failedRoles = Array.from(failedRoleIds);
  for (const roleId of passedRoles) {
    if (!memberRoles.includes(roleId)) continue;
    await addUsersDiscordRole(ctx.env.DISCORD_TOKEN, userData.guildId, userId, roleId);
  }
  for (const roleId of failedRoles) {
    if (memberRoles.includes(roleId)) continue;
    await removeUsersDiscordRole(ctx.env.DISCORD_TOKEN, userData.guildId, userId, roleId);
  }
  return ctx.json({ memberRoles, passedRoles, failedRoles });
});

router.get('/discord/guilds/:guildId/members', async (ctx: Context) => {
  const userData = await verifyJwtRequest(ctx);
  if (!userData) return ctx.text('Unauthorized', 401);
  const after = ctx.req.param('after');
  const { members, snowflake } = await getMembersFromDiscord(ctx.env.DISCORD_TOKEN, userData.guildId, after);
  return ctx.json({ members, snowflake });
});

async function fetchOptions(env: Binder, interaction: any) {
  // https://discord.com/developers/docs/interactions/application-commands#autocomplete
  const data = interaction.data;
  const guildId = interaction.guild_id;
  const userId = !interaction.member ? interaction.user.id : interaction.member.user.id;
  const options: any[] = data.options || [];
  const option: any = options.find((option) => option['focused']) || {};
  switch (option.name) {
    case 'wallet':
      const wallets: D1Result = await env.DB.prepare(
        'SELECT DISTINCT address FROM Wallets WHERE userId = ? AND address LIKE ?'
      )
        .bind(userId, `%${option.value}%`)
        .all();
      return {
        data: {
          choices: wallets.results.map((wallet: any) => ({
            name: abbreviateEthereumAddress(wallet.address),
            value: wallet.address,
          })),
        },
        type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
      };
    case 'interaction':
      const commands: D1Result = await env.DB.prepare(
        'SELECT id, source, formula FROM Commands WHERE guildId = ? AND source LIKE ?'
      )
        .bind(guildId, `%${option.value}%`)
        .all();
      return {
        data: {
          choices: commands.results.map((command: any) => ({
            name: `${abbreviateEthereumAddress(command.source)} -- balanceOf >= ${parseInt(command.formula.length > 18 ? command.formula.slice(0, -18) : command.formula)}`,
            value: command.id,
          })),
        },
        type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
      };
    default:
      throw new Error('Unknown option');
  }
}

async function doInteraction(env: Binder, interaction: any) {
  // https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object
  const data = interaction.data;
  const guildId = interaction.guild_id;
  const userId = !interaction.member ? interaction.user.id : interaction.member.user.id;
  const username = !interaction.member ? interaction.user.username : interaction.member.user.username;
  const avatar = !interaction.member ? interaction.user.avatar : interaction.member.user.avatar;
  const permissions = !interaction['member'] ? '0' : interaction['member']['permissions'];
  const isAdmin = Boolean(parseInt(permissions) & 8) || ['234657292610568193', '217775277349011456'].includes(userId);

  // TODO enforce the below logic after more new discord interactions testing
  // switch (data.name) {
  //   case 'add-role':
  //   case 'remove-role':
  //   case 'sync-roles':
  //     const notAdminEmbed = isAdmin ? null : notAdminDiscord();
  //     if (notAdminEmbed)
  //       return {
  //         data: notAdminEmbed,
  //         type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
  //       };
  //   case 'get-roles':
  //     const rateLimitEmbed = await rateLimitDiscord(env.KV, userId, `${data.name}|${userId}`, 300);
  //     if (rateLimitEmbed)
  //       return {
  //         data: rateLimitEmbed,
  //         type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
  //       };
  //   default:
  //     console.info('Interaction', data.name, userId, username, permissions, avatar);
  // }

  switch (data.name) {
    case 'roll':
      return {
        data: { content: doRoll(data.options[0].value, userId) },
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      };
    case 'wallets':
      return {
        data: discordVerify(await sign({ userId, guildId, username, permissions, avatar }, env.AUTH_SECRET)),
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      };
    case 'view-roles':
      return {
        data: await discordViewRoles(env, guildId),
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      };
    case 'get-roles':
      return {
        data: await discordGetRoles(
          env,
          data.options[0].value,
          data.options.length > 1 ? data.options[1].value : null, // handle optional input
          guildId,
          userId
        ),
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      };
    case 'add-role':
      return {
        data: await discordAddRole(
          env,
          data.options[0].value,
          data.options[1].value,
          data.options[2].value,
          data.options[3].value,
          guildId
        ),
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      };
    case 'remove-role':
      return {
        data: await discordRemoveRole(env, data.options[0].value, guildId),
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      };
    case 'sync-roles':
      return {
        data: discordSyncRoles(await sign({ userId, guildId, username, permissions, avatar }, env.AUTH_SECRET)),
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      };
    default:
      throw new Error('Unknown command');
  }
}

async function verifyDiscordRequest(ctx: Context) {
  const clientPublicKey =
    ctx.env.DISCORD_PUBLIC_KEY || '9652fc8fbe7431136c57d52acc24eef3af84e6c7193f8db3e0585d1362d89466';
  const signature = ctx.req.header('x-signature-ed25519');
  const timestamp = ctx.req.header('x-signature-timestamp');
  const body = await ctx.req.text();
  const isValidRequest = signature && timestamp && verifyKey(body, signature, timestamp, clientPublicKey);
  if (!isValidRequest) return { interaction: null, isValid: false };
  return { interaction: JSON.parse(body), isValid: true };
}

async function verifyJwtRequest(ctx: Context) {
  const token = ctx.req.header('Authorization');
  if (!token) return null;
  const secret = ctx.env.AUTH_SECRET;
  return await verify(token.slice(7), secret);
}

const server = {
  verifyDiscordRequest: verifyDiscordRequest,
  verifyJwtRequest: verifyJwtRequest,
  fetch: async function (request, env, ctx) {
    return router.fetch(request, env, ctx);
  },
  scheduled: async function (event, env, ctx) {
    const { cron, type, scheduledTime } = event;
    console.log('Scheduled', cron, type, scheduledTime);
    // ctx.waitUntil(doSomeTaskOnASchedule());
  },
};

export default server;
