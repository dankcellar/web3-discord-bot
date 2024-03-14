import { D1Database, KVNamespace } from '@cloudflare/workers-types';
import { Routes } from 'discord-api-types/v10';
import { InteractionResponseFlags } from 'discord-interactions';
import { getContract } from 'viem';

import { MINI_ABI, createProvider } from './mini-web3';

export interface Binder {
  DB: D1Database;
  KV: KVNamespace;
  DISCORD_TOKEN: string;
  DISCORD_OAUTH_VER: string;
  DISCORD_OAUTH_SYN: string;
  AUTH_SECRET: string;
}

export const MAX_WALLETS = 10;
export const MAX_COMMANDS = 100;

// https://colorswall.com/palette/157
// #ffffff 	RGB(255, 255, 255) 	— 	White
// #fff056 	RGB(255, 240, 86) 	— 	—
// #dfe2db 	RGB(223, 226, 219) 	— 	—
// #191919 	RGB(25, 25, 25) 	— 	—

// https://colorswall.com/palette/2190
// #149414 	RGB(20, 148, 20) 	— 	—
// #0e6b0e 	RGB(14, 107, 14) 	— 	—
// #649568 	RGB(100, 149, 104) 	— 	—
// #9ccc9c 	RGB(156, 204, 156) 	— 	—
// #2b5329 	RGB(43, 83, 41) 	— 	—

export async function web3BalanceOfDiscordRoles(chain: number, wallets: any[], commands: any[]) {
  // Run this on a per chain basis
  const publicClient = createProvider(chain);
  const roleIds: Set<string> = new Set();
  const allRoleIds: Set<string> = new Set();
  for (const command of commands) {
    if (roleIds.has(command.roleId)) continue;
    allRoleIds.add(command.roleId);
    for (const wallet of wallets) {
      if (roleIds.has(command.roleId)) break;
      const contract = getContract({
        address: command.source,
        abi: MINI_ABI,
        //@ts-ignore
        client: publicClient,
      });
      //@ts-ignore
      const balanceOf = await contract.read.balanceOf([wallet.address]);
      if (parseFloat(balanceOf) >= parseFloat(command.formula)) {
        roleIds.add(command.roleId);
      }
    }
  }
  const passed = Array.from(roleIds);
  const failed = Array.from(allRoleIds).filter((roleId) => !roleIds.has(roleId));
  return { passed, failed };
}

export async function addUsersDiscordRole(token: string, guildId: string, userId: string, roleId: string) {
  const res = await fetch('https://discord.com/api/v10' + Routes.guildMemberRole(guildId, userId, roleId), {
    method: 'PUT',
    headers: { Authorization: `Bot ${token}` },
  });
  return await res.text();
}

export async function removeUsersDiscordRole(token: string, guildId: string, userId: string, roleId: string) {
  const res = await fetch('https://discord.com/api/v10' + Routes.guildMemberRole(guildId, userId, roleId), {
    method: 'DELETE',
    headers: { Authorization: `Bot ${token}` },
  });
  return await res.text();
}

export async function getMemberFromDiscord(token: string, guildId: string, userId: string) {
  const res = await fetch('https://discord.com/api/v10' + Routes.guildMember(guildId, userId), {
    headers: { Authorization: `Bot ${token}` },
  });
  return await res.json();
}

export async function getMembersFromDiscord(token: string, guildId: string, after: string = null) {
  if (!!after) {
    const res = await fetch(
      'https://discord.com/api/v10' + Routes.guildMembers(guildId) + `?limit=1000&after=${after}`,
      { headers: { Authorization: `Bot ${token}` } }
    );
    const members = await res.json();
    return { members, snowflake: null };
  }
  const members = [];
  let snowflake = '0';
  let lastCount = 0;
  do {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const res = await fetch(
      'https://discord.com/api/v10' + Routes.guildMembers(guildId) + `?limit=1000&after=${snowflake}`,
      { headers: { Authorization: `Bot ${token}` } }
    );
    const guildMembers = await res.json();
    if (!Array.isArray(guildMembers)) break;
    lastCount = guildMembers.length;
    for (const member of guildMembers) {
      if (snowflake < member.user.id) snowflake = member.user.id;
      if (member.user.bot) continue;
      members.push({
        id: member.user.id,
        username: member.user.username,
        bot: member.user.bot,
        avatar: member.user.avatar,
        roles: !member.roles ? [] : member.roles.map((role: any) => role.id),
        permissions: member.permissions,
      });
    }
  } while (lastCount > 0);
  return { members, snowflake };
}

export async function rateLimitDiscord(client: KVNamespace, userId: string, key: string, limit: number) {
  // Rate limit this function
  const { get, put } = client;
  const value = await get(key, 'text');
  const ttl = ['234657292610568193', '217775277349011456'].includes(userId) ? 60 : limit;
  if (!value) {
    const dateLimit = new Date(Date.now() + limit).toUTCString();
    await put(key, dateLimit, {
      // metadata: { someMetadataKey: 'someMetadataValue' },
      // expiration: Date.now() + ttl,
      expirationTtl: ttl,
    });
    return null;
  }
  return {
    embeds: [
      {
        color: resolveColor('purple'),
        title: 'Too Many Requests',
        description: `Please wait until ${value} before sending that request again.`,
        timestamp: new Date().toISOString(),
      },
    ],
    flags: InteractionResponseFlags.EPHEMERAL,
  };
}

export async function notAdminDiscord() {
  return {
    embeds: [
      {
        color: resolveColor('purple'),
        title: 'Not An Admin',
        description: 'Only an admin can use this command.',
        timestamp: new Date().toISOString(),
      },
    ],
    flags: InteractionResponseFlags.EPHEMERAL,
  };
}

export async function buildFooter() {
  return {
    text: '',
    iconURL: '',
  };
}

export function idConvert(id: string, isRole: boolean = false) {
  if (isRole) return `<@&${id}>`;
  return `<@${id}>`;
}

export function resolveColor(color: string) {
  if (color === 'bitcoin') return parseInt('F7931A', 16);
  if (color === 'hacker') return parseInt('00cc00', 16);
  if (color === 'purple') return parseInt('8F00FF', 16);
  return parseInt(color.replace('#', color), 16);
}

export function abbreviateEthereumAddress(address: any, length: number = 6) {
  // Ensure the address is a string and valid
  if (typeof address !== 'string' || address.length < 2 * length) {
    throw new Error('Invalid Ethereum address');
  }
  // Take the first 'length' characters and the last 'length' characters
  return `${address.slice(0, length)}...${address.slice(-length)}`;
}

// TODO use durable objects to use Discords websocket gateway

// export async function discordInviteDelete(invite: any) {
//   return Invites.update(
//     { deleted: true },
//     {
//       where: {
//         guildId: invite.guild.id,
//         inviterId: invite.inviterId,
//         code: invite.code,
//       },
//     }
//   );
// }

// export async function discordInviteCreate(invite: any) {
//   const inviteModel = await Invites.create({
//     guildId: invite.guild.id,
//     inviterId: invite.inviterId,
//     code: invite.code,
//     uses: invite.uses,
//   });
//   await Totals.create({ inviteId: inviteModel.get('id'), normal: invite.uses });
// }
