import { D1Database, D1Response, D1Result, KVNamespace } from '@cloudflare/workers-types';
import { InteractionResponseType, InteractionType, verifyKey } from 'discord-interactions';
import { Context, ExecutionContext, Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { cors } from 'hono/cors';
import { sign, verify } from 'hono/jwt';
import { logger } from 'hono/logger';
import { randomUUID } from 'node:crypto';
import { SiweMessage, generateNonce } from 'siwe-cloudflare';
import { getAddress } from 'viem';

import { doRoll } from './dnd-stuff';
import {
  MAX_WALLETS,
  abbreviateEthereumAddress,
  doSyncRoles,
  failedToRespond,
  getMembersFromDiscord,
  hashString,
  isAdminOverride,
  notAdminDiscord,
} from './handlers';
import {
  discordAddRole,
  discordGetRoles,
  discordLandingPage,
  discordRemoveRole,
  discordRoleHolders,
  discordSyncRoles,
  discordUnlink,
  discordVerify,
  discordViewRoles,
  discordViewWallet,
} from './interactions';

export type Bindings = {
  DB: D1Database;
  KV: KVNamespace;
  CLIENT_ID: string;
  CLIENT_SECRET: string;
  DISCORD_TOKEN: string;
  DISCORD_PUBLIC_KEY: string;
  AUTH_SECRET: string;
  IS_DEV: string;
};

const router = new Hono<{ Bindings: Bindings }>();
router.use(logger());
router.use('*', async (ctx, next) => {
  const corsMiddleware = cors({
    origin: ctx.env.IS_DEV ? 'http://localhost:4321' : 'https://rarity.bot',
    credentials: true,
  });
  return await corsMiddleware(ctx, next);
});

/**
 * Default route
 */
router.all('/', (ctx: Context) => {
  return ctx.text(`👋 ${new Date().toISOString()}`);
});

/**
 * Oauth2 interactions
 */
router.get('/oauth2/redirect/discord', async (ctx: Context) => {
  const [guildId, redirect] = ctx.req.query('state').split('--');
  const authReq = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    body: new URLSearchParams({
      code: ctx.req.query('code'),
      client_id: ctx.env.CLIENT_ID,
      client_secret: ctx.env.CLIENT_SECRET,
      grant_type: 'authorization_code',
      redirect_uri: ctx.env.IS_DEV
        ? 'http://localhost:8787/oauth2/redirect/discord'
        : 'https://api.rarity.bot/oauth2/redirect/discord',
    }),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
  if (!authReq.ok) return ctx.text('Failed', 424);
  const authData = await authReq.json();
  const { access_token, token_type, expires_in, refresh_token, scope, error } = authData;
  if (!access_token) return ctx.text('Failed', 422);

  const guildReq = await fetch(`https://discord.com/api/users/@me/guilds/${guildId}/member`, {
    headers: {
      Authorization: `${token_type} ${access_token}`,
    },
  });
  if (!guildReq.ok) return ctx.text('Failed', 424);
  const guildData = await guildReq.json();
  const { user, permissions } = guildData;
  if (!user) return ctx.text('Failed', 422);
  const userId = user.id;

  const expireAt = new Date(Date.now() + 86400000);
  const jwt = await sign({ userId, guildId, permissions }, ctx.env.AUTH_SECRET);
  setCookie(ctx, `auth`, jwt, {
    domain: ctx.env.IS_DEV ? `127.0.0.1` : `.rarity.bot`,
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
    expires: expireAt,
  });

  const url = new URL(ctx.env.IS_DEV ? `http://localhost:4321/${redirect}` : `https://rarity.bot/${redirect}`);
  if (redirect === 'roles') url.searchParams.append('guildId', guildId);
  if (ctx.env.IS_DEV) url.searchParams.append('state', jwt);
  return ctx.redirect(url.toString());
});

/**
 * SIWE interactions
 */
router.get('/siwe/nonce', async (ctx: Context) => {
  const nonce = generateNonce();
  return ctx.json({ nonce });
});

router.put('/siwe/verify', async (ctx: Context) => {
  const { message, signature } = await ctx.req.json();
  const siweMessage = new SiweMessage(message);
  const { success, data, error } = await siweMessage.verify({ signature });
  if (!success) return ctx.json({ success, error });
  const address = getAddress(data.address);
  const chain = data.chainId.toString();
  const hash = hashString(address, chain, ctx.env.AUTH_SECRET);
  const KV: KVNamespace = ctx.env.KV;
  const str = await KV.get(hash, { type: 'text' });
  if (!str) await KV.put(hash, `${address}--${chain}`, { expirationTtl: 86400000 });
  return ctx.json({ success, hash });
});

router.post('/siwe/session', async (ctx: Context) => {
  const { hash } = await ctx.req.json();
  if (!hash) return ctx.json({ hash });
  const KV: KVNamespace = ctx.env.KV;
  const str = await KV.get(hash, { type: 'text' });
  const [address, chainId] = str.split('--');
  return ctx.json({ address, chainId });
});

/**
 * DApp interactions
 */
router.get('/dapp/add/:hash', async (ctx: Context) => {
  const userData: any = await verifyJwtRequest(ctx);
  if (!userData) return ctx.text('Unauthorized', 401);
  const count: number = await ctx.env.DB.prepare('SELECT COUNT(id) AS total FROM Wallets WHERE userId = ?')
    .bind(userData.userId)
    .first('total');
  if (count >= MAX_WALLETS) return ctx.text(`User has ${count} wallet connections`, 400);
  const hash = ctx.req.param('hash');
  const KV: KVNamespace = ctx.env.KV;
  const str = await KV.get(hash, { type: 'text' });
  console.log('Storage', { hash, str });
  const [address, chainId] = str.split('--');
  console.log('Wallet', { address, chainId });
  const query: D1Response = await ctx.env.DB.prepare(
    'INSERT INTO Wallets (id,address,chain,guildId,userId) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING'
  )
    .bind(randomUUID(), getAddress(address), chainId, userData.guildId, userData.userId)
    .run();
  return ctx.json({ address, chainId });
});

router.get('/dapp/sync/:userId', async (ctx: Context) => {
  const userData: any = await verifyJwtRequest(ctx);
  if (!userData) return ctx.text('Unauthorized', 401);
  const isAllowed = Boolean(parseInt(userData.permissions) & 8) || isAdminOverride(userData.userId);
  if (!isAllowed) return ctx.text('You shall not pass', 403);
  const userId = ctx.req.param('userId');
  const wallets: D1Result = await ctx.env.DB.prepare(
    'SELECT address, chain FROM Wallets WHERE guildId = ? AND userId = ?'
  )
    .bind(userData.guildId, userId)
    .all();
  const commands: D1Result = await ctx.env.DB.prepare(
    'SELECT command, source, formula, roleId, chain FROM Commands WHERE guildId = ?'
  )
    .bind(userData.guildId)
    .all();
  const { passed, failed } = await doSyncRoles(
    ctx.env.DISCORD_TOKEN,
    userData.guildId,
    userId,
    wallets.results,
    commands.results
  );
  return ctx.json({ passed, failed });
});

router.get('/dapp/admin/discord', async (ctx: Context) => {
  const userData: any = await verifyJwtRequest(ctx);
  if (!userData) return ctx.text('Unauthorized', 401);
  const isAllowed = isAdminOverride(userData.userId);
  if (!isAllowed) return ctx.text('You are not a developer', 403);
  const { userId, guildId, address, chain } = ctx.req.query();
  return ctx.json({ userId, guildId, address, chain });
});

/**
 * Database models
 */
// router.post('/models/:model/find', async (ctx: Context) => {
//   const userData: any = await verifyJwtRequest(ctx);
//   if (!userData) return ctx.text('Unauthorized', 401);
//   const isAllowed = isAdminOverride(userData.userId);
//   if (!isAllowed) return ctx.text('You are not a developer', 403);
//   const database: D1Database = ctx.env.DB;
//   const model = ctx.req.param('model');
//   const { select = [], where = [], update = {}, orderBy = {}, limit = 0, offset = 0 } = await ctx.req.json();
//   const builder = new SQLQueryBuilder();
//   builder.select(select).from(model);
//   where.forEach((w) => builder.where(w));
//   Object.keys(orderBy).forEach((key) => builder.orderBy(key, orderBy[key]));
//   builder.page(limit, offset);
//   const str = builder.build();
//   console.log(str);
//   const query: D1Result = await database.prepare(str).all();
//   return ctx.json(query);
// });

// router.post('/models/:model/update', async (ctx: Context) => {
//   const userData: any = await verifyJwtRequest(ctx);
//   if (!userData) return ctx.text('Unauthorized', 401);
//   const isAllowed = isAdminOverride(userData.userId);
//   if (!isAllowed) return ctx.text('You are not a developer', 403);
//   const database: D1Database = ctx.env.DB;
//   const model = ctx.req.param('model');
//   const { select = [], where = [], update = {}, orderBy = {}, limit = 0, offset = 0 } = await ctx.req.json();
//   const builder = new SQLQueryBuilder();
//   builder.update(model);
//   Object.keys(update).forEach((key) => builder.set(key, update[key]));
//   where.forEach((w) => builder.where(w));
//   if (select) builder.returning(select);
//   const str = builder.build();
//   console.log(str);
//   const query: D1Response = await database.prepare(str).run();
//   return ctx.json(query);
// });

// router.post('/models/:model/delete', async (ctx: Context) => {
//   const userData: any = await verifyJwtRequest(ctx);
//   if (!userData) return ctx.text('Unauthorized', 401);
//   const isAllowed = isAdminOverride(userData.userId);
//   if (!isAllowed) return ctx.text('You are not a developer', 403);
//   const database: D1Database = ctx.env.DB;
//   const model = ctx.req.param('model');
//   const { select = [], where = [], update = {}, orderBy = {}, limit = 0, offset = 0 } = await ctx.req.json();
//   const builder = new SQLQueryBuilder();
//   throw new Error('Not implemented');
// });

/**
 * Discord interactions
 */
router.post('/discord/interactions', async (ctx: Context) => {
  const { isValid, interaction } = await server.verifyDiscordRequest(ctx);
  if (!isValid || !interaction) return ctx.text('Unauthorized', 401);

  switch (interaction['type']) {
    case InteractionType.PING:
      return ctx.json({ type: InteractionResponseType.PONG });

    case InteractionType.APPLICATION_COMMAND:
      try {
        return ctx.json(await doInteraction(ctx.executionCtx, ctx.env, interaction));
      } catch (e) {
        return ctx.json(failedToRespond());
      }

    case InteractionType.MESSAGE_COMPONENT:
      try {
        return ctx.json(await doInteraction(ctx.executionCtx, ctx.env, interaction));
      } catch (e) {
        return ctx.json(failedToRespond());
      }

    case InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE:
      try {
        return ctx.json(await fetchOptions(ctx.env, interaction));
      } catch (e) {
        return ctx.json(failedToRespond());
      }

    case InteractionType.MODAL_SUBMIT:
    default:
      return ctx.text('Bad Request', 400);
  }
});

router.get('/discord/linked-roles', async (ctx: Context) => {
  throw new Error('Not implemented');
});

router.get('/discord/guilds/:guildId/members', async (ctx: Context) => {
  const guildId = ctx.req.param('guildId');
  const after = ctx.req.query('after') || '0';
  const limit = ctx.req.query('limit') || '1';
  const full = Boolean(ctx.req.query('full'));
  const { members, snowflake } = await getMembersFromDiscord(ctx.env.DISCORD_TOKEN, guildId, after, limit, full);
  return ctx.json({ members, snowflake });
});

async function fetchOptions(env: Bindings, interaction: any) {
  // https://discord.com/developers/docs/interactions/application-commands#autocomplete
  const data = interaction.data;
  const guildId = interaction.guild_id;
  const userId = !interaction.member ? interaction.user.id : interaction.member.user.id;
  const options: any[] = data.options || [];
  const option: any = options.find((option) => option['focused']) || {};
  switch (option.name) {
    case 'wallet':
      const wallets: D1Result = await env.DB.prepare(
        'SELECT address FROM Wallets WHERE userId = ? AND address LIKE ? ORDER BY updatedAt DESC'
      )
        .bind(userId, `%${option.value}%`)
        .all();
      const addresses: string[] = Array.from(new Set(wallets.results.map((wallet: any) => wallet.address)));
      return {
        data: {
          choices: addresses.map((address: any) => ({
            name: abbreviateEthereumAddress(address),
            value: address,
          })),
        },
        type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
      };
    case 'interaction':
      const commands: D1Result = await env.DB.prepare(
        'SELECT id, command FROM Commands WHERE guildId = ? AND command LIKE ? ORDER BY command ASC'
      )
        .bind(guildId, `%${option.value}%`)
        .all();
      return {
        data: {
          choices: commands.results.map((command: any) => ({
            // name: `${abbreviateEthereumAddress(command.source)} -- balanceOf >= ${parseInt(command.formula.length > 18 ? command.formula.slice(0, -18) : command.formula)}`,
            name: command.command,
            value: command.id,
          })),
        },
        type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
      };
  }
  throw new Error('Unknown');
}

async function doInteraction(exc: ExecutionContext, env: Bindings, interaction: any) {
  // https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object
  const data = interaction.data;
  const token = interaction.token;
  const guildId = interaction.guild_id;
  const userId = !interaction.member ? interaction.user.id : interaction.member.user.id;
  // const username = !interaction.member ? interaction.user.username : interaction.member.user.username;
  // const avatar = !interaction.member ? interaction.user.avatar : interaction.member.user.avatar;
  const permissions = !interaction.member ? '0' : interaction.member.permissions;
  const isAdmin = Boolean(parseInt(permissions) & 8);
  const command = data.name || data.custom_id;
  const action = command.split('--')[0];
  console.info('Interaction', { action, guildId, userId, permissions, isAdmin });

  let messageType = InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE;
  if (action.includes('--')) messageType = InteractionResponseType.UPDATE_MESSAGE;

  switch (action) {
    case 'add-role':
    case 'remove-role':
    case 'sync-roles':
    case 'landing':
      if (!isAdmin)
        return {
          data: notAdminDiscord(),
          type: messageType,
        };
  }

  switch (action) {
    case 'roll':
      return {
        data: { content: doRoll(data.options[0].value, userId) },
        type: messageType,
      };
    case 'wallets':
      return {
        data: await discordVerify(env, guildId, userId),
        type: messageType,
      };
    case 'wallet':
      return {
        data: await discordViewWallet(env, guildId, userId, 1, command.split('--')[1]),
        type: messageType,
      };
    case 'unlink':
      return {
        data: await discordUnlink(exc, env, guildId, userId, 1, command.split('--')[1]),
        type: messageType,
      };
    case 'view-roles':
      return {
        data: await discordViewRoles(env, guildId),
        type: messageType,
      };
    case 'get-roles':
      return {
        data: await discordGetRoles(
          exc,
          env,
          token,
          data.options[0].value,
          data.options.length > 1 ? data.options[1].value : null, // handle optional input
          guildId,
          userId
        ),
        type: messageType,
      };
    case 'add-role':
      return {
        data: await discordAddRole(
          env,
          data.options[0].value,
          data.options[1].value,
          data.options[2].value,
          data.options[3].value,
          data.options[4].value,
          guildId
        ),
        type: messageType,
      };
    case 'remove-role':
      return {
        data: await discordRemoveRole(env, data.options[0].value, guildId),
        type: messageType,
      };
    case 'sync-roles':
      return {
        data: await discordSyncRoles(env, guildId, userId),
        type: messageType,
      };
    case 'landing':
      return {
        data: await discordLandingPage(env, guildId, userId),
        type: messageType,
      };
    case 'holders':
      return {
        data: await discordRoleHolders(exc, env, token, guildId, data.options[0].value),
        type: messageType,
      };
  }
  throw new Error('Unknown');
}

async function verifyDiscordRequest(ctx: Context) {
  const clientPublicKey = ctx.env.DISCORD_PUBLIC_KEY;
  const signature = ctx.req.header('x-signature-ed25519');
  const timestamp = ctx.req.header('x-signature-timestamp');
  const body = await ctx.req.text();
  const isValidRequest = await verifyKey(body, signature, timestamp, clientPublicKey);
  if (!isValidRequest) return { interaction: null, isValid: false };
  return { interaction: JSON.parse(body), isValid: true };
}

async function verifyJwtRequest(ctx: Context) {
  const cookie = getCookie(ctx, 'auth');
  if (cookie) return await verify(cookie, ctx.env.AUTH_SECRET);
  // const token = ctx.req.header('Authorization');
  // if (token) return await verify(token, ctx.env.AUTH_SECRET);
  // const state = ctx.req.query('state');
  // if (state) return await verify(state, ctx.env.AUTH_SECRET);
  // console.log('No token found', { cookie, token, state });
  throw new Error('Who are you?');
}

const server = {
  verifyJwtRequest: verifyJwtRequest,
  verifyDiscordRequest: verifyDiscordRequest,
  fetch: async (request, env, ctx) => {
    return await router.fetch(request, env, ctx);
  },
  scheduled: async function (event, env, ctx) {
    const { cron, type, scheduledTime } = event;
    console.log('Scheduled', cron, type, scheduledTime);
    // ctx.waitUntil(doSomeTaskOnASchedule());
  },
};

export default server;
