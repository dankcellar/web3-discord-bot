import { D1Database, D1Response, D1Result, KVNamespace } from '@cloudflare/workers-types';
import { InteractionResponseType, InteractionType, verifyKey } from 'discord-interactions';
import { Context, ExecutionContext, Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { cors } from 'hono/cors';
import { decode, sign, verify } from 'hono/jwt';
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
  notAdminDiscord,
} from './handlers';
import {
  discordAddRole,
  discordGetRoles,
  discordLandingPage,
  discordRemoveRole,
  discordSyncRoles,
  discordUnlink,
  discordVerify,
  discordViewRoles,
  discordViewWallet,
} from './interactions';
import { SQLQueryBuilder } from './query';

export type Bindings = {
  DB: D1Database;
  KV: KVNamespace;
  CLIENT_ID: string;
  CLIENT_SECRET: string;
  DISCORD_TOKEN: string;
  AUTH_SECRET: string;
  DEV: string;
};

// https://discord.com/oauth2/authorize?client_id=330539844889477121&response_type=code&redirect_uri=https%3A%2F%2Fapi.raritynfts.xyz%2Foauth2%2Fdiscord%2Fwallets&scope=identify&state=2eed571fd0e919233c417c44c41b972015eed29e0b63cf92e069f1f206971597
// https://discord.com/oauth2/authorize?client_id=330539844889477121&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A8787%2Foauth2%2Fdiscord%2Froles&scope=identify&state=2eed571fd0e919233c417c44c41b972015eed29e0b63cf92e069f1f206971597

const router = new Hono<{ Bindings: Bindings }>();

router.use('*', async (ctx, next) => {
  const corsMiddleware = cors({
    origin: ctx.env.DEV ? 'http://localhost:4321' : 'https://raritynfts.xyz',
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
router.get('/oauth2/discord/:redirect', async (ctx: Context) => {
  const { code, state } = ctx.req.query();
  if (!state) return ctx.text('Failed state missing', 422);
  const redirect = ctx.req.param('redirect');
  const authReq = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    body: new URLSearchParams({
      code,
      client_id: ctx.env.CLIENT_ID,
      client_secret: ctx.env.CLIENT_SECRET,
      grant_type: 'authorization_code',
      redirect_uri: ctx.env.DEV
        ? `http://localhost:8787/oauth2/discord/${redirect}`
        : `https://api.raritynfts.xyz/oauth2/discord/${redirect}`,
      scope: 'role_connections.write identify',
    }),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
  const authData = await authReq.json();
  if (authData.error) return ctx.text(authData.error_description, 424);
  const { access_token, token_type, expires_in, refresh_token, scope } = authData;
  const userReq = await fetch('https://discord.com/api/users/@me', {
    headers: {
      Authorization: `${token_type} ${access_token}`,
    },
  });
  const userData = await userReq.json();
  const hash = hashString(userData.id, ctx.env.AUTH_SECRET);
  if (state !== hash) return ctx.text('Failed state mismatch', 422);

  const env: Bindings = ctx.env;
  const json: string = await env.KV.get(`auth-${userData.id}`, 'text');
  if (!json) return ctx.text('Failed state expired', 422);
  const [userId, guildId, permissions] = json.split('-');
  const jwt = await sign({ userId, guildId, permissions }, ctx.env.AUTH_SECRET);

  setCookie(ctx, 'auth', jwt, {
    domain: ctx.env.DEV ? `127.0.0.1` : `.raritynfts.xyz`,
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
    expires: new Date(Date.now() + 31556952000), // 1 year in ms (31556952000)
  });

  const url = new URL(ctx.env.DEV ? `http://localhost:4321/${redirect}` : `https://raritynfts.xyz/${redirect}`);
  if (redirect === 'roles') url.searchParams.append('guildId', guildId);
  if (ctx.env.DEV) url.searchParams.append('state', jwt);
  return ctx.redirect(url.toString());
});

/**
 * Admin interactions
 */
router.get('/admin/discord', async (ctx: Context) => {
  const userId = ctx.req.query('userId');
  const guildId = ctx.req.query('guildId');
  const address = ctx.req.query('address');
  const chain = ctx.req.query('chain');
  // const data = await discordGetRoles(ctx.env.DB, ctx.env.DISCORD_TOKEN, address, parseInt(chain), guildId, userId);
  const data = null;
  return ctx.json(data);
});

/**
 * SIWE interactions
 */
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
  if (!data) return ctx.text('Failed SIWE session', 422);
  const siweMessage = new SiweMessage(data.payload);
  return ctx.json({ address: siweMessage.address, chain: siweMessage.chainId });
});

/**
 * DApp interactions
 */
router.get('/dapp/sync/:userId', async (ctx: Context) => {
  const userData = await verifyJwtRequest(ctx);
  if (!userData) return ctx.text('Unauthorized', 401);
  const userId = ctx.req.param('userId');
  const isAllowed =
    userData.userId === userId ||
    Boolean(parseInt(userData.permissions) & 8) ||
    ['234657292610568193', '217775277349011456'].includes(userData.userId);
  if (!isAllowed) return ctx.text('Forbidden', 403);
  // const member = await getMemberFromDiscord(ctx.env.DISCORD_TOKEN, userData.guildId, userId);
  // if (!member.id) return ctx.text('Discord API request failed', 424);
  const wallets: D1Result = await ctx.env.DB.prepare(
    'SELECT address, chain FROM Wallets WHERE guildId = ? AND userId = ?'
  )
    .bind(userData.guildId, userData.userId)
    .all();
  const commands: D1Result = await ctx.env.DB.prepare(
    'SELECT source, formula, roleId, chain FROM Commands WHERE guildId = ?'
  )
    .bind(userData.guildId)
    .all();
  const { passed, failed } = await doSyncRoles(
    ctx.env.DISCORD_TOKEN,
    userData.guildId,
    userData.userId,
    wallets.results,
    commands.results
  );
  return ctx.json({ success: true, meta: null, results: { passed, failed } });
});

router.put('/dapp/wallets/:address', async (ctx: Context) => {
  const userData = await verifyJwtRequest(ctx);
  if (!userData) return ctx.text('Unauthorized', 401);
  const count: number = await ctx.env.DB.prepare('SELECT COUNT(id) AS total FROM Wallets WHERE userId = ?')
    .bind(userData.userId)
    .first('total');
  if (count >= MAX_WALLETS) return ctx.text('User has too many wallet connections', 403);
  const { siwe = '' } = await ctx.req.json();
  const siweData = await verify(siwe, ctx.env.AUTH_SECRET);
  const siweMessage = new SiweMessage(siweData);
  const query: D1Response = await ctx.env.DB.prepare(
    'INSERT INTO Wallets (id,address,chain,guildId,userId) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING'
  )
    .bind(randomUUID(), getAddress(siweMessage.address), siweMessage.chainId, userData.guildId, userData.userId)
    .run();
  return ctx.json(query);
});

router.post('/dapp/models/:model/find', async (ctx: Context) => {
  const userData = await verifyJwtRequest(ctx);
  if (!userData) return ctx.text('Unauthorized', 401);
  const isAllowed = ['234657292610568193', '217775277349011456'].includes(userData.userId);
  if (!isAllowed) return ctx.text('You are not a developer', 403);
  const database: D1Database = ctx.env.DB;
  const model = ctx.req.param('model');
  const { select = [], where = [], update = {}, orderBy = {}, limit = 0, offset = 0 } = await ctx.req.json();
  const builder = new SQLQueryBuilder();
  builder.select(select).from(model);
  where.forEach((w) => builder.where(w));
  Object.keys(orderBy).forEach((key) => builder.orderBy(key, orderBy[key]));
  builder.page(limit, offset);
  const str = builder.build();
  console.log(str);
  const query: D1Result = await database.prepare(str).all();
  return ctx.json(query);
});

router.post('/dapp/models/:model/update', async (ctx: Context) => {
  const userData = await verifyJwtRequest(ctx);
  if (!userData) return ctx.text('Unauthorized', 401);
  const isAllowed = ['234657292610568193', '217775277349011456'].includes(userData.userId);
  if (!isAllowed) return ctx.text('You are not a developer', 403);
  const database: D1Database = ctx.env.DB;
  const model = ctx.req.param('model');
  const { select = [], where = [], update = {}, orderBy = {}, limit = 0, offset = 0 } = await ctx.req.json();
  const builder = new SQLQueryBuilder();
  builder.update(model);
  Object.keys(update).forEach((key) => builder.set(key, update[key]));
  where.forEach((w) => builder.where(w));
  if (select) builder.returning(select);
  const str = builder.build();
  console.log(str);
  const query: D1Response = await database.prepare(str).run();
  return ctx.json(query);
});

router.post('/dapp/models/:model/delete', async (ctx: Context) => {
  const userData = await verifyJwtRequest(ctx);
  if (!userData) return ctx.text('Unauthorized', 401);
  const isAllowed = ['234657292610568193', '217775277349011456'].includes(userData.userId);
  if (!isAllowed) return ctx.text('You are not a developer', 403);
  const database: D1Database = ctx.env.DB;
  const model = ctx.req.param('model');
  const { select = [], where = [], update = {}, orderBy = {}, limit = 0, offset = 0 } = await ctx.req.json();
  const builder = new SQLQueryBuilder();
  throw new Error('Not implemented');
});

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
  const userData = await verifyJwtRequest(ctx);
  if (!userData) return ctx.text('Unauthorized', 401);
  return ctx.json({ success: false });
  // const accessToken = getCookie(ctx, 'oauth2');
  // return ctx.json({ accessToken });
  // if (!accessToken) {
  //   const store: KVNamespace = ctx.env.KV;
  //   const refreshToken = await store.get(`refresh-${userData.userId}`, 'text');
  //   const response = await fetch('https://discord.com/api/v10/oauth2/token', {
  //     method: 'POST',
  //     body: new URLSearchParams({
  //       client_id: ctx.env.CLIENT_ID,
  //       client_secret: ctx.env.CLIENT_SECRET,
  //       grant_type: 'refresh_token',
  //       refresh_token: refreshToken,
  //     }),
  //     headers: {
  //       'Content-Type': 'application/x-www-form-urlencoded',
  //     },
  //   });
  //   if (response.ok) {
  //     const authData = await response.json();
  //     const { access_token, token_type, expires_in, refresh_token, scope } = authData;
  //     setCookie(ctx, 'oauth2', `${token_type} ${access_token}`, {
  //       domain: ctx.env.DEV ? `127.0.0.1` : `.raritynfts.xyz`,
  //       secure: true,
  //       httpOnly: true,
  //       sameSite: 'Lax',
  //       expires: new Date(Date.now() + expires_in * 1000), // expires_in is in seconds
  //     });
  //     return ctx.json({ scope });
  //   } else {
  //     throw new Error(`Error refreshing access token: [${response.status}] ${response.statusText}`);
  //   }
  // }
});

router.get('/discord/guilds/:guildId/members', async (ctx: Context) => {
  const guildId = ctx.req.param('guildId');
  const after = ctx.req.query('after') || '0';
  const limit = ctx.req.query('limit') || '1';
  const full = !!ctx.req.query('full');
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
  const isAdmin = Boolean(parseInt(permissions) & 8) || ['234657292610568193', '217775277349011456'].includes(userId);
  const action = data.name || data.custom_id.split('--')[0];
  console.info('Interaction', { action, guildId, userId, permissions, isAdmin });

  // Set key values for oauth2
  switch (action) {
    case 'wallets':
    case 'sync-roles':
      /**
       * TODO: Never check for guildId and just store userId
       * I hate this... but the flow needs to work like this
       * A web portal will get the userId JWT and let the user select a guild
       * Then get the users permissions in that guild and do actions
       */
      const auth = await env.KV.get(`auth-${userId}`, 'text');
      if (auth) if (auth.split('-')[1] === guildId) break;
      await env.KV.put(`auth-${userId}`, `${userId}-${guildId}-${permissions}`, {
        // metadata: { userId, guildId, permissions },
        expirationTtl: 86400000, // 1 day in ms (86400000)
      });
  }

  // Check if the user is an admin
  switch (action) {
    case 'add-role':
    case 'remove-role':
    case 'sync-roles':
    case 'landing':
      if (!isAdmin)
        return {
          data: notAdminDiscord(),
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        };
  }

  // Rate limit commands
  // switch (action) {
  //   case 'get-roles':
  //     const rateLimitEmbed = await rateLimitDiscord(env.KV, userId, `${action}|${userId}`, 300);
  //     if (rateLimitEmbed)
  //       return {
  //         data: rateLimitEmbed,
  //         type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
  //       };
  // }

  switch (action) {
    case 'roll':
      return {
        data: { content: doRoll(data.options[0].value, userId) },
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      };
    case 'wallets':
      return {
        data: await discordVerify(env, guildId, userId),
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      };
    case 'wallet':
      return {
        data: await discordViewWallet(env, guildId, userId, 1, data.custom_id.split('--')[1]),
        type: InteractionResponseType.UPDATE_MESSAGE,
      };
    case 'unlink':
      return {
        data: await discordUnlink(exc, env, guildId, userId, 1, data.custom_id.split('--')[1]),
        type: InteractionResponseType.UPDATE_MESSAGE,
      };
    case 'view-roles':
      return {
        data: await discordViewRoles(env, guildId),
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
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
          data.options[4].value,
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
        data: await discordSyncRoles(env, guildId, userId),
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      };
    case 'landing':
      return {
        data: await discordLandingPage(env, guildId, userId),
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      };
  }
  // Throw an error if the action is unknown
  throw new Error('Unknown');
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
  const cookie = getCookie(ctx, 'auth');
  if (cookie) return await verify(cookie, ctx.env.AUTH_SECRET);
  const token = ctx.req.header('Authorization');
  if (token) return await verify(token, ctx.env.AUTH_SECRET);
  const state = ctx.req.query('state');
  if (state) return await verify(state, ctx.env.AUTH_SECRET);
  console.log('No token found', { cookie, token, state });
  throw new Error('Who are you?');
}

const server = {
  verifyJwtRequest: verifyJwtRequest,
  verifyDiscordRequest: verifyDiscordRequest,
  fetch: async (request, env, ctx) => {
    return await router.fetch(request, env, ctx);
  },
  // scheduled: async function (event, env, ctx) {
  //   const { cron, type, scheduledTime } = event;
  //   console.log('Scheduled', cron, type, scheduledTime);
  //   ctx.waitUntil(doSomeTaskOnASchedule());
  // },
};

export default server;
