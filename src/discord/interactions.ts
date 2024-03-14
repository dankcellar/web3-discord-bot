import { D1Response, D1Result } from '@cloudflare/workers-types';
import { InteractionResponseFlags } from 'discord-interactions';
import { getAddress } from 'viem';

import {
  Binder,
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

export function discordManager(isAdmin: boolean) {
  const url =
    'https://discord.com/oauth2/authorize?client_id=330539844889477121&response_type=code&redirect_uri=https%3A%2F%2Fapi.raritynfts.xyz%2Fdiscord%2Flogin&scope=identify';
  const interaction = {
    embeds: [
      {
        color: resolveColor('hacker'),
        title: '',
        description: 'Do **NOT** share the embedded link.',
        timestamp: new Date().toISOString(),
      },
    ],
    components: [
      {
        type: COMPONENT_TYPE.ACTION_ROW,
        components: [
          {
            type: COMPONENT_TYPE.BUTTON,
            label: 'Link Wallet',
            style: BUTTON_STYLE.LINK,
            url: `${url}&state=wallets`,
          },
        ],
      },
      {
        type: COMPONENT_TYPE.ACTION_ROW,
        components: [
          {
            type: COMPONENT_TYPE.BUTTON,
            label: 'Guild Roles',
            style: BUTTON_STYLE.LINK,
            url: `${url}&state=roles`,
          },
        ],
      },
    ],
  };
}

export function discordVerify(token: string) {
  const url =
    'https://discord.com/oauth2/authorize?client_id=330539844889477121&response_type=token&redirect_uri=https%3A%2F%2Fraritynfts.xyz%2Fwallets&scope=identify';
  return {
    embeds: [
      {
        color: resolveColor('hacker'),
        title: 'Add Web3 Wallet to Discord',
        description: 'Do **NOT** share the embedded link.',
        timestamp: new Date().toISOString(),
      },
    ],
    components: [
      {
        type: COMPONENT_TYPE.ACTION_ROW,
        components: [
          {
            type: COMPONENT_TYPE.BUTTON,
            label: 'Link Wallet',
            style: BUTTON_STYLE.LINK,
            url: `${url}&state=${token}`,
          },
        ],
      },
    ],
    flags: InteractionResponseFlags.EPHEMERAL,
  };
}

export function discordSyncRoles(token: string) {
  const url =
    'https://discord.com/oauth2/authorize?client_id=330539844889477121&response_type=token&redirect_uri=https%3A%2F%2Fraritynfts.xyz%2Froles&scope=identify';
  return {
    embeds: [
      {
        color: resolveColor('purple'),
        title: 'Discord Role Sync (Admin)',
        description: 'Do **NOT** share the embedded link.',
        timestamp: new Date().toISOString(),
      },
    ],
    components: [
      {
        type: COMPONENT_TYPE.ACTION_ROW,
        components: [
          {
            type: COMPONENT_TYPE.BUTTON,
            label: 'Start Sync',
            style: BUTTON_STYLE.LINK,
            url: `${url}&state=${token}`,
          },
        ],
      },
    ],
    flags: InteractionResponseFlags.EPHEMERAL,
  };
}

export async function discordWallets(env: Binder, userId: string) {
  // if a wallet is removed we need to remove all roles from that guild as well, unless there is at least one wallet left
  const wallets: D1Result = await env.DB.prepare('SELECT * FROM Wallets WHERE userId = ?').bind(userId).all();
  let str = '';
  return {
    embeds: [
      {
        color: resolveColor('bitcoin'),
        title: 'Wallet Manager',
        description: `You have **${wallets.results.length}** active connections:\n*Limit is ${MAX_WALLETS}.*${str}\n(Wallet management coming soon...)`,
        timestamp: new Date().toISOString(),
      },
    ],
    components: [],
    flags: InteractionResponseFlags.EPHEMERAL,
  };
}

export async function discordViewRoles(env: Binder, guildId: string) {
  const commands: D1Result = await env.DB.prepare('SELECT source, formula, roleId FROM Commands WHERE guildId = ?')
    .bind(guildId)
    .all();
  const roleFields = [];
  commands.results.forEach((command: any) => {
    // roleFields.push({
    //   name: 'Role',
    //   value: idConvert(command.roleId, true),
    //   inline: true,
    // });
    // roleFields.push({
    //   name: 'Contract',
    //   value: abbreviateEthereumAddress(command.source),
    //   inline: true,
    // });
    // roleFields.push({
    //   name: 'Amount',
    //   value: `balanceOf >= ${parseInt(command.formula.length > 18 ? command.formula.slice(0, -18) : command.formula)}`,
    //   inline: true,
    // });
  });
  return {
    // embeds: [
    //   {
    //     color: resolveColor('bitcoin'),
    //     title: 'Viewing Guild Roles',
    //     description: `This guild has **${commands.results.length}** role(s) added:`,
    //     timestamp: new Date().toISOString(),
    //     fields: roleFields.slice(0, 24),
    //   },
    // ],
    flags: InteractionResponseFlags.EPHEMERAL,
  };
}

export async function discordAddRole(
  env: Binder,
  roleId: string,
  source: string,
  chain: number,
  formula: string,
  guildId: string
) {
  const count: number = await env.DB.prepare('SELECT COUNT(id) AS total FROM Commands WHERE guildId = ?')
    .bind(guildId)
    .first('total');
  if (count >= MAX_COMMANDS) throw new Error('You have reached the maximum amount of roles for this guild.');
  const command = 'web3'; // TODO figure out other commands
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
        title: 'New Role Added',
        description: 'You can view all the guild roles by using /view-roles',
        timestamp: new Date().toISOString(),
      },
    ],
    flags: InteractionResponseFlags.EPHEMERAL,
  };
}

export async function discordRemoveRole(env: Binder, commandId: string, guildId: string) {
  const query: D1Response = await env.DB.prepare('DELETE FROM Commands WHERE id = ? AND guildId = ?')
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

export async function discordGetRoles(env: Binder, address: string, chain: number, guildId: string, userId: string) {
  // Register this wallet with a possible new chain to this Discord guild
  let wallet = null;
  let isInGuild = false;
  const correctAddress = getAddress(address);
  const wallets: D1Result = await env.DB.prepare(
    'SELECT id, address, chain, guildId FROM Wallets WHERE userId = ? ORDER BY updatedAt DESC'
  )
    .bind(userId)
    .all();
  wallets.results.forEach((w: any) => {
    if (w.address === correctAddress) {
      // if they own the wallet then pick the most recent chain
      if (!chain) {
        if (!wallet) wallet = w;
      } else {
        if (w.chain === chain) if (!wallet) wallet = w;
      }
      // check if this wallet is also apart of the guild
      if (w.guildId === guildId) isInGuild = true;
    }
  });
  if (!wallet) throw new Error('Wallet not found');
  if (!chain) chain = wallet.chain;

  // If this wallet is not apart of guild and user can add more wallets, do insert
  if (!isInGuild && wallets.results.length < MAX_WALLETS) {
    const query: D1Response = await env.DB.prepare(
      'INSERT INTO Wallets (id,address,chain,guildId,userId) VALUES (?,?,?,?,?) ON CONFLICT DO UPDATE SET updatedAt = CURRENT_TIMESTAMP'
    )
      .bind(crypto.randomUUID(), correctAddress, chain, guildId, userId)
      .run();
    if (!query.success) throw new Error(query.error);
  } else {
    const query: D1Response = await env.DB.prepare('UPDATE Wallets SET updatedAt = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(wallet.id)
      .run();
    if (!query.success) throw new Error(query.error);
  }

  const commands: D1Result = await env.DB.prepare(
    'SELECT source, formula, roleId FROM Commands WHERE guildId = ? AND chain = ?'
  )
    .bind(guildId, chain)
    .all();
  const roleIds = await web3BalanceOfDiscordRoles(chain, [wallet], commands.results);
  for (const roleId of roleIds.passed) {
    const data = await addUsersDiscordRole(env.DISCORD_TOKEN, guildId, userId, roleId);
    console.log('addUsersDiscordRole', data);
    // await env.DB.prepare('INSERT INTO Roles (id,guildId,userId,roleId) VALUES (?,?,?,?) ON CONFLICT DO NOTHING')
    //   .bind(crypto.randomUUID(), guildId, userId, roleId)
    //   .run();
  }

  return {
    embeds: [
      {
        color: resolveColor('hacker'),
        title: 'Successfully Synced Roles to Wallet',
        description: `${idConvert(userId)} has synced **${roleIds.passed.length}** guild role(s) to their wallet!`,
        timestamp: new Date().toISOString(),
      },
    ],
    flags: InteractionResponseFlags.EPHEMERAL,
  };
}

export async function discordRarity(env: Binder, tokenId, chainId, includeMetadata) {
  // TODO this whole thing
  const collection = [];
  const token = collection['Tokens'].length > 0 ? collection['Tokens'][0] : null;
  if (!token) throw new Error('Token not found');
  // TODO fetch from ipfs and get new data, faster then 3 seconds?
  // TODO Dont fail this and fetch using the chain Id

  // const footer = await buildFooter(collection['chainId']);
  const url = '';
  let image = token['image'] || '';
  // if (_.includes(image, 'ipfs://')) {
  //   image = `https://${_.sample(IPFS_URLS)}/ipfs/${_.replace(image, 'ipfs://', '')}`;
  // }
  // let metadata = token['ipfs'] || '';
  // if (_.includes(metadata, 'ipfs://')) {
  //   metadata = `https://${_.sample(IPFS_URLS)}/ipfs/${_.replace(metadata, 'ipfs://', '')}`;
  // }
  let paddingName = 0;
  let paddingValue = 0;
  const attrs = [];
  _.forEach(token['attributes'], (attribute) => {
    if (attribute['value'] !== 'None') attrs.push(attribute);
    if (paddingName < attribute['trait_type'].length) paddingName = attribute['trait_type'].length;
    if (paddingValue < attribute['value'].length) paddingValue = attribute['value'].length;
  });

  let description =
    `Rarity's Rank: **${token['rank'] || 'Pending'}**\n` +
    `Total Supply: **${collection['supply'] || 'Pending'}**\n` +
    `This token has **${attrs.length}** out of ` +
    `**${!token['attributes'] ? attrs.length : token['attributes'].length}** traits:`;

  description += '```\n';
  // if (attrs.length == 0) description += 'Processing this token, check again later';
  _.forEach(attrs, (attribute) => {
    description += `${attribute['trait_type'].padEnd(paddingName)}` + ': ' + `${attribute['value']}`;
    if (!attribute['_freq']) description += `\n`;
    else description += ` (${attribute['_freq']})\n`;
  });
  description += '```';

  // description +=
  //   `[Collection](${url})` +
  //   ' | ' +
  //   `[Contract](${scanAddress(collection['chainId'])}/${collection['contract']})` +
  //   ' | ' +
  //   `[Marketplace](${chainStoreUrl(collection['chainId'])}/${collection['contract']}/${token['edition']})`;

  // const viewEmbed = new EmbedBuilder()
  //   .setColor('#FF8800')
  //   .setTitle(!token['name'] ? `${collection['name']} #${token['edition']}` : token['name'])
  //   .setDescription(description)
  //   .setTimestamp(new Date())
  //   .setURL(metadata)
  //   .setImage(image)
  //   .setFooter(footer);
  return { embeds: [] };
}
