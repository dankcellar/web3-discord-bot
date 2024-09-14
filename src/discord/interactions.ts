import { D1Response, D1Result } from '@cloudflare/workers-types';
import { InteractionResponseFlags } from 'discord-interactions';
import { ExecutionContext } from 'hono';
import { getAddress } from 'viem';

import {
  MAX_COMMANDS,
  MAX_WALLETS,
  doExportRole,
  doGetRoles,
  doSyncRoles,
  getGuildPreview,
  idConvert,
  resolveColor,
} from './handlers';
import { Bindings } from './server';

const BUTTON_STYLE = {
  PRIMARY: 1,
  SECONDARY: 2,
  SUCCESS: 3,
  DESTRUCTIVE: 4,
  LINK: 5,
};

const COMPONENT_TYPE = {
  ACTION_ROW: 1,
  BUTTON: 2,
  STRING_SELECT: 3,
  TEXT_INPUT: 4,
  USER_SELECT: 5,
  ROLE_SELECT: 6,
  MENTIONABLE_SELECT: 7,
  CHANNEL_SELECT: 8,
};

const REDIRECT_URI =
  'https://discord.com/oauth2/authorize?client_id=330539844889477121&response_type=code&redirect_uri=https%3A%2F%2Fapi.rarity.bot%2Foauth2%2Fredirect%2Fdiscord&scope=guilds.members.read+identify';

const BLANK = '\u200B';

//https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-response-object-interaction-callback-data-structure
// Field	Type	Description
// tts?	boolean	is the response TTS
// content?	string	message content
// embeds?	array of embeds	supports up to 10 embeds
// allowed_mentions?	allowed mentions	allowed mentions object
// flags?	integer	message flags combined as a bitfield (only SUPPRESS_EMBEDS and EPHEMERAL can be set)
// components?	array of components	message components
// attachments? *	array of partial attachment objects	attachment objects with filename and description

export async function discordVerify(env: Bindings, guildId: string, userId: string) {
  const state = `${guildId}--wallets`;
  const wallets: D1Result = await env.DB.prepare('SELECT * FROM Wallets WHERE userId = ?').bind(userId).all();
  let str = `You have **${wallets.results.length}** active Web3 connections. (Maximum **${MAX_WALLETS}**)\n`;
  // TODO say what roles they have form this guild and what wallets are linked
  return {
    embeds: [
      {
        color: resolveColor('hacker'),
        title: 'Web3 Wallet Manager',
        description: str,
        timestamp: new Date().toISOString(),
      },
    ],
    components: [
      {
        type: COMPONENT_TYPE.ACTION_ROW,
        components: [
          {
            type: COMPONENT_TYPE.BUTTON,
            label: 'View Your Wallets',
            style: BUTTON_STYLE.PRIMARY,
            custom_id: wallets.results.length === 0 ? 'unlink' : 'wallet--0',
            // emoji: { id: null, name: '🤖' },
          },
          {
            type: COMPONENT_TYPE.BUTTON,
            label: 'Add New Wallet',
            style: BUTTON_STYLE.LINK,
            url: `${REDIRECT_URI}&state=${state}`,
            // emoji: { id: null, name: '🌐' },
          },
        ],
      },
    ],
    flags: InteractionResponseFlags.EPHEMERAL,
  };
}

export async function discordSyncRoles(env: Bindings, guildId: string, userId: string) {
  const state = `${guildId}--roles`;
  return {
    embeds: [
      {
        color: resolveColor('purple'),
        title: 'Discord Role Sync (Admin)',
        timestamp: new Date().toISOString(),
      },
    ],
    components: [
      {
        type: COMPONENT_TYPE.ACTION_ROW,
        components: [
          {
            type: COMPONENT_TYPE.BUTTON,
            label: 'Start Guild Sync',
            style: BUTTON_STYLE.LINK,
            url: `${REDIRECT_URI}&state=${state}`,
          },
        ],
      },
    ],
    flags: InteractionResponseFlags.EPHEMERAL,
  };
}

export async function discordLandingPage(env: Bindings, guildId: string, userId: string) {
  return {
    embeds: [
      {
        color: resolveColor('hacker'),
        title: 'Verify Your Assets',
        description:
          'This is a read-only connection. Do not share your private keys. We will never ask for your seed phrase. We will never DM you.',
        timestamp: new Date().toISOString(),
      },
    ],
    components: [
      {
        type: COMPONENT_TYPE.ACTION_ROW,
        components: [
          {
            type: COMPONENT_TYPE.BUTTON,
            label: "Let's go!",
            style: BUTTON_STYLE.PRIMARY,
            custom_id: 'wallets',
            emoji: { id: null, name: '🚀' },
          },
        ],
      },
    ],
  };
}

export async function discordViewRoles(env: Bindings, guildId: string) {
  const commands: D1Result = await env.DB.prepare(
    'SELECT command, source, formula, roleId, chain FROM Commands WHERE guildId = ?'
  )
    .bind(guildId)
    .all();
  const embedsMap = {};
  commands.results.forEach(({ command, source, formula, roleId, chain }) => {
    // add to embedsMap by chain -> roleId -> formula -> roleId
    if (!embedsMap[chain]) embedsMap[chain] = {};
    if (!embedsMap[chain][roleId]) embedsMap[chain][roleId] = {};
    if (!embedsMap[chain][roleId][formula]) embedsMap[chain][roleId][formula] = [];
    embedsMap[chain][roleId][formula].push(command);
  });
  let str = '';
  for (const chain in embedsMap) {
    for (const roleId in embedsMap[chain]) {
      str += `**Guild Role: ${idConvert(roleId, true)}**\n`;
      for (const formula in embedsMap[chain][roleId]) {
        str += `*Get this role if balanceOf is ${parseInt(formula.length > 18 ? formula.slice(0, -18) : formula)} or more (Chain ID: ${chain})*\n`;
        str += '```\n';
        for (const command of embedsMap[chain][roleId][formula]) {
          str += `${command}\n`;
        }
        str += '```\n';
      }
    }
  }
  return {
    embeds: [
      {
        title: 'Web3 Guild Roles',
        description: str.slice(0, 4096),
        color: resolveColor('bitcoin'),
        timestamp: new Date().toISOString(),
      },
    ],
    flags: InteractionResponseFlags.EPHEMERAL,
  };
}

export async function discordAddRole(
  env: Bindings,
  command: string,
  source: string,
  roleId: string,
  chain: number,
  formula: string,
  guildId: string
) {
  const count: number = await env.DB.prepare('SELECT COUNT(id) AS total FROM Commands WHERE guildId = ?')
    .bind(guildId)
    .first('total');
  if (count >= MAX_COMMANDS) throw new Error('You have reached the maximum amount of roles for this guild.');
  const query: D1Response = await env.DB.prepare(
    'INSERT INTO Commands (id,command,chain,guildId,roleId,source,formula) VALUES (?,?,?,?,?,?,?)'
  )
    .bind(crypto.randomUUID(), command, chain, guildId, roleId, getAddress(source), formula)
    .run();
  if (!query.success) throw new Error(query.error);
  return {
    embeds: [
      {
        color: resolveColor('purple'),
        title: 'New Role Added (Admin)',
        description: 'You can view all the guild roles by using /view-roles',
        timestamp: new Date().toISOString(),
      },
    ],
    flags: InteractionResponseFlags.EPHEMERAL,
  };
}

export async function discordRemoveRole(env: Bindings, commandId: string, guildId: string) {
  const query: D1Response = await env.DB.prepare('DELETE FROM Commands WHERE id = ? AND guildId = ?')
    .bind(commandId, guildId)
    .run();
  if (!query.success) throw new Error(query.error);
  return {
    embeds: [
      {
        color: resolveColor('purple'),
        title: 'Deleted Sync Role (Admin)',
        description: 'You can view all the guild roles by using /view-roles',
        timestamp: new Date().toISOString(),
      },
    ],
    flags: InteractionResponseFlags.EPHEMERAL,
  };
}

export async function discordGetRoles(
  exc: ExecutionContext,
  env: Bindings,
  webhookToken: string,
  address: string,
  chain: number,
  guildId: string,
  userId: string
) {
  // Register this wallet with a possible new chain to this Discord guild
  const wallets: D1Result = await env.DB.prepare(
    'SELECT id, address, chain, guildId FROM Wallets WHERE userId = ? ORDER BY updatedAt DESC'
  )
    .bind(userId)
    .all();

  const wallet = { id: null, address: null, chain: null, guildId: guildId, userId: userId };
  wallets.results.forEach(({ id, address, chain, guildId }) => {
    // Best guess the first wallet from order by updatedAt
    if (!wallet.chain && address === address) {
      wallet.chain = !chain ? chain : chain;
      wallet.address = address;
    }
    // If wallet is already apart of guild, set id
    if (address === wallet.address && chain === wallet.chain && guildId === wallet.guildId) wallet.id = id;
  });
  if (!wallet.address) throw new Error('Wallet address not found');

  // If this wallet is not apart of guild and user can add more wallets, do insert
  if (!wallet.id && wallets.results.length < MAX_WALLETS) {
    const query: D1Response = await env.DB.prepare(
      'INSERT INTO Wallets (id,address,chain,guildId,userId) VALUES (?,?,?,?,?)'
    )
      .bind(crypto.randomUUID(), getAddress(wallet.address), wallet.chain, wallet.guildId, wallet.userId)
      .run();
  } else {
    const query: D1Response = await env.DB.prepare('UPDATE Wallets SET updatedAt = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(wallet.id)
      .run();
  }

  // Get all the role commands that have been added to this guild
  const commands: D1Result = await env.DB.prepare(
    'SELECT source, formula, roleId FROM Commands WHERE guildId = ? AND chain = ?'
  )
    .bind(guildId, wallet.chain)
    .all();

  exc.waitUntil(
    doGetRoles(
      env.DISCORD_TOKEN,
      env.CLIENT_ID,
      webhookToken,
      guildId,
      userId,
      wallet.chain,
      [wallet],
      commands.results
    )
  );

  return {
    embeds: [
      {
        color: resolveColor('bitcoin'),
        title: 'Syncing Roles to Wallet',
        description: `${idConvert(userId)} is syncing guild role(s) to their wallet!`,
        timestamp: new Date().toISOString(),
      },
    ],
    flags: InteractionResponseFlags.EPHEMERAL,
  };
}

export async function discordViewWallet(env: Bindings, guildId: string, userId: string, limit: number, offset: number) {
  const wallets: D1Result = await env.DB.prepare('SELECT id, address, chain, guildId FROM Wallets WHERE userId = ?')
    .bind(userId)
    .all();
  const index = parseInt(offset.toString());
  const wallet: any = wallets.results.length > 0 ? wallets.results[index] : null;
  let str = 'No wallet found. Please add a wallet to this guild. ✌';
  if (wallet) {
    const data = await getGuildPreview(env.DISCORD_TOKEN, wallet.guildId);
    str = `*Wallet Connection ${index + 1}*\n`;
    str += `**Guild Name:** ${data['name'] || wallet.guildId}\n`;
    str += `**Wallet Address:** ${wallet.address}\n`;
    str += `**Chain ID:** ${wallet.chain}\n`;
  }
  const nextNum = index + 1 > wallets.results.length - 1 ? 0 : index + 1;
  const prevNum = index - 1 < 0 ? wallets.results.length - 1 : index - 1;
  return {
    embeds: [
      {
        color: resolveColor('bitcoin'),
        title: 'Web3 Wallet Manager',
        description: str,
        timestamp: new Date().toISOString(),
      },
    ],
    components: [
      {
        type: COMPONENT_TYPE.ACTION_ROW,
        components: [
          {
            type: COMPONENT_TYPE.BUTTON,
            label: 'Back',
            style: BUTTON_STYLE.SECONDARY,
            custom_id: `wallet--${prevNum}`,
            // emoji: { id: null, name: '⬅' },
          },
          {
            type: COMPONENT_TYPE.BUTTON,
            label: 'Next',
            style: BUTTON_STYLE.PRIMARY,
            custom_id: `wallet--${nextNum}`,
            // emoji: { id: null, name: '➡' },
          },
          {
            type: COMPONENT_TYPE.BUTTON,
            label: 'Home',
            style: BUTTON_STYLE.SUCCESS,
            custom_id: `wallets--0`,
            // emoji: { id: null, name: '🗺' },
          },
          {
            type: COMPONENT_TYPE.BUTTON,
            label: 'Remove',
            style: BUTTON_STYLE.DESTRUCTIVE,
            custom_id: `unlink--${offset}`,
            // emoji: { id: null, name: '🗑' },
          },
        ],
      },
    ],
    flags: InteractionResponseFlags.EPHEMERAL,
  };
}

export async function discordUnlink(
  exc: ExecutionContext,
  env: Bindings,
  guildId: string,
  userId: string,
  limit: number,
  offset: number
) {
  const wallet: any = await env.DB.prepare('SELECT id FROM Wallets WHERE userId = ? LIMIT 1 OFFSET ?')
    .bind(userId, offset)
    .first();
  await env.DB.prepare('DELETE FROM Wallets WHERE id = ?').bind(wallet.id).run();

  const wallets: D1Result = await env.DB.prepare('SELECT address, chain FROM Wallets WHERE guildId = ? AND userId = ?')
    .bind(guildId, userId)
    .all();
  const commands: D1Result = await env.DB.prepare(
    'SELECT command, source, formula, roleId, chain FROM Commands WHERE guildId = ?'
  )
    .bind(guildId)
    .all();

  exc.waitUntil(doSyncRoles(env.DISCORD_TOKEN, guildId, userId, wallets.results, commands.results));
  return discordVerify(env, guildId, userId);
}

export async function discordRoleHolders(
  exc: ExecutionContext,
  env: Bindings,
  webhookToken: string,
  guildId: string,
  roleId: string
) {
  const chain = '1';
  const wallets = await env.DB.prepare(
    'SELECT DISTINCT userId, guildId, address FROM Wallets WHERE guildId = ? AND chain = ?'
  )
    .bind(guildId, chain)
    .all();
  const commands = await env.DB.prepare(
    'SELECT DISTINCT source FROM Commands WHERE guildId = ? AND roleId = ? AND chain = ?'
  )
    .bind(guildId, roleId, chain)
    .all();

  exc.waitUntil(
    doExportRole(env.DISCORD_TOKEN, env.CLIENT_ID, webhookToken, roleId, chain, wallets.results, commands.results)
  );

  return {
    embeds: [
      {
        color: resolveColor('purple'),
        title: 'Exporting Role Holders',
        // description: `${idConvert(userId)} is syncing guild role(s) to their wallet!`,
        timestamp: new Date().toISOString(),
      },
    ],
    flags: InteractionResponseFlags.EPHEMERAL,
  };
}
