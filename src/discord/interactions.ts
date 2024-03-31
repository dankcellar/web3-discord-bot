import { D1Database, D1Response, D1Result } from '@cloudflare/workers-types';
import { InteractionResponseFlags } from 'discord-interactions';
import { getAddress } from 'viem';

import {
  MAX_COMMANDS,
  MAX_WALLETS,
  addUsersDiscordRole,
  idConvert,
  resolveColor,
  web3BalanceOfDiscordRoles,
} from './handlers';

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

export async function discordVerify(database: D1Database, userId: string, state: string) {
  const wallets: D1Result = await database.prepare('SELECT * FROM Wallets WHERE userId = ?').bind(userId).all();
  let str = `You have **${wallets.results.length}** active Web3 connections. (Maximum **${MAX_WALLETS}**)\n`;
  str += `*Do **NOT** share the embedded link!*\n`;
  str += '```\n';
  wallets.results.forEach((wallet: any) => {
    str += `Guild: ${wallet.guildId} - Chain: ${wallet.chain}\n`;
    str += `${wallet.address}\n\n`;
  });
  str += '```\n';
  const url =
    'https://discord.com/oauth2/authorize?client_id=330539844889477121&response_type=token&redirect_uri=https%3A%2F%2Fraritynfts.xyz%2Fwallets&scope=identify';
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
            label: 'Add New Wallet', // TODO change to Manage Wallets later
            style: BUTTON_STYLE.LINK,
            url: `${url}&state=${state}`,
          },
        ],
      },
    ],
    flags: InteractionResponseFlags.EPHEMERAL,
  };
}

export async function discordSyncRoles(database: D1Database, guildId: string, state: string) {
  await new Promise((resolve) => setTimeout(resolve, 0));
  const url =
    'https://discord.com/oauth2/authorize?client_id=330539844889477121&response_type=token&redirect_uri=https%3A%2F%2Fraritynfts.xyz%2Froles&scope=identify';
  return {
    embeds: [
      {
        color: resolveColor('purple'),
        title: 'Discord Role Sync (Admin)',
        description: 'Do **NOT** share the embedded link!',
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
            url: `${url}&state=${state}`,
          },
        ],
      },
    ],
    flags: InteractionResponseFlags.EPHEMERAL,
  };
}

export async function discordViewRoles(database: D1Database, guildId: string) {
  const commands: D1Result = await database
    .prepare('SELECT source, formula, roleId, chain FROM Commands WHERE guildId = ?')
    .bind(guildId)
    .all();
  const embedsMap = {};
  commands.results.forEach((command: any) => {
    const { source, formula, roleId, chain } = command;
    // add to embedsMap by chain -> roleId -> formula -> roleId
    if (!embedsMap[chain]) embedsMap[chain] = {};
    if (!embedsMap[chain][roleId]) embedsMap[chain][roleId] = {};
    if (!embedsMap[chain][roleId][formula]) embedsMap[chain][roleId][formula] = [];
    embedsMap[chain][roleId][formula].push(source);
  });
  let str = '';
  for (const chain in embedsMap) {
    for (const roleId in embedsMap[chain]) {
      str += `**Guild Role: ${idConvert(roleId, true)}**\n`;
      for (const formula in embedsMap[chain][roleId]) {
        str += `*Get this role if balanceOf is ${parseInt(formula.length > 18 ? formula.slice(0, -18) : formula)} or more (Chain ID: ${chain})*\n`;
        str += '```\n';
        for (const source of embedsMap[chain][roleId][formula]) {
          str += `${source}\n`;
        }
        str += '```\n';
      }
    }
  }
  return {
    embeds: [
      {
        title: 'Viewing Web3 Guild Roles',
        description: str.slice(0, 4096),
        color: resolveColor('bitcoin'),
        timestamp: new Date().toISOString(),
      },
    ],
    flags: InteractionResponseFlags.EPHEMERAL,
  };
}

export async function discordAddRole(
  database: D1Database,
  roleId: string,
  source: string,
  chain: number,
  formula: string,
  guildId: string
) {
  const count: number = await database
    .prepare('SELECT COUNT(id) AS total FROM Commands WHERE guildId = ?')
    .bind(guildId)
    .first('total');
  if (count >= MAX_COMMANDS) throw new Error('You have reached the maximum amount of roles for this guild.');
  const command = 'web3'; // TODO figure out other commands
  const query: D1Response = await database
    .prepare('INSERT INTO Commands (id,command,chain,guildId,roleId,source,formula) VALUES (?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), command, chain, guildId, roleId, getAddress(source), formula)
    .run();
  if (!query.success) throw new Error(query.error);
  return {
    embeds: [
      {
        color: resolveColor('purple'),
        title: 'New Role Added',
        description: 'You can view all the guild roles by using /view-roles',
        timestamp: new Date().toISOString(),
      },
    ],
    flags: InteractionResponseFlags.EPHEMERAL,
  };
}

export async function discordRemoveRole(database: D1Database, commandId: string, guildId: string) {
  const query: D1Response = await database
    .prepare('DELETE FROM Commands WHERE id = ? AND guildId = ?')
    .bind(commandId, guildId)
    .run();
  if (!query.success) throw new Error(query.error);
  return {
    embeds: [
      {
        color: resolveColor('purple'),
        title: 'Deleted Sync Role',
        description: 'You can view all the guild roles by using /view-roles',
        timestamp: new Date().toISOString(),
      },
    ],
    flags: InteractionResponseFlags.EPHEMERAL,
  };
}

export async function discordGetRoles(
  database: D1Database,
  token: string,
  address: string,
  chain: number,
  guildId: string,
  userId: string
) {
  // Register this wallet with a possible new chain to this Discord guild
  const wallets: D1Result = await database
    .prepare('SELECT id, address, chain, guildId FROM Wallets WHERE userId = ? ORDER BY updatedAt DESC')
    .bind(userId)
    .all();
  const wallet = { id: null, address: null, chain: null, guildId: guildId, userId: userId };
  wallets.results.forEach((w: any) => {
    // Best guess the first wallet from order by updatedAt
    if (!wallet.chain && w.address === address) {
      wallet.chain = !chain ? w.chain : chain;
      wallet.address = w.address;
    }
    // If wallet is already apart of guild, set id
    if (w.address === wallet.address && w.chain === wallet.chain && w.guildId === wallet.guildId) wallet.id = w.id;
  });
  if (!wallet.address) throw new Error('Wallet address not found');

  // If this wallet is not apart of guild and user can add more wallets, do insert
  if (!wallet.id && wallets.results.length < MAX_WALLETS) {
    const query: D1Response = await database
      .prepare('INSERT INTO Wallets (id,address,chain,guildId,userId) VALUES (?,?,?,?,?)')
      .bind(crypto.randomUUID(), getAddress(wallet.address), wallet.chain, wallet.guildId, wallet.userId)
      .run();
  } else {
    const query: D1Response = await database
      .prepare('UPDATE Wallets SET updatedAt = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(wallet.id)
      .run();
  }

  const commands: D1Result = await database
    .prepare('SELECT source, formula, roleId FROM Commands WHERE guildId = ? AND chain = ?')
    .bind(guildId, wallet.chain)
    .all();
  const roleIdResults = await web3BalanceOfDiscordRoles(wallet.chain, [wallet], commands.results);
  for (const roleId of roleIdResults.passed) {
    const data = await addUsersDiscordRole(token, guildId, userId, roleId);
    console.log('addUsersDiscordRole', data);
    // await database.prepare('INSERT INTO Roles (id,guildId,userId,roleId) VALUES (?,?,?,?) ON CONFLICT DO NOTHING')
    //   .bind(crypto.randomUUID(), guildId, userId, roleId)
    //   .run();
  }

  return {
    embeds: [
      {
        color: resolveColor('hacker'),
        title: 'Successfully Synced Roles to Wallet',
        description: `${idConvert(userId)} has synced **${roleIdResults.passed.length}** guild role(s) to their wallet!`,
        timestamp: new Date().toISOString(),
      },
    ],
    flags: InteractionResponseFlags.EPHEMERAL,
  };
}
