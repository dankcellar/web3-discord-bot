import { KVNamespace } from '@cloudflare/workers-types';
import { Routes } from 'discord-api-types/v10';
import { InteractionResponseFlags } from 'discord-interactions';
import { createHash } from 'node:crypto';
import { getContract } from 'viem';

import { MINI_ABI, createProvider } from './mini-web3';

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

export async function doGetRoles(
  token: string,
  clientId: string,
  webhookToken: string,
  guildId: string,
  userId: string,
  wallet: any,
  commands: any[]
) {
  const roleIdResults = await web3BalanceOfDiscordRoles(wallet.chain, [wallet], commands);
  for (const roleId of roleIdResults.passed) {
    const data = await addUsersDiscordRole(token, guildId, userId, roleId);
  }
  const data = await editWebhookMessage(clientId, webhookToken, {
    embeds: [
      {
        color: resolveColor('hacker'),
        title: 'Successfully Synced Roles to Wallet',
        description: `${idConvert(userId)} has synced **${roleIdResults.passed.length}** guild role(s) to their wallet!`,
        timestamp: new Date().toISOString(),
      },
    ],
  });
  return { success: true };
}

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

export async function web3BalanceOfDiscordRolesFaster(chain: number, wallets: any[], commands: any[]) {
  // Run this on a per chain basis
  const publicClient = createProvider(chain);
  const passedIds: Set<string> = new Set();
  const failedIds: Set<string> = new Set();
  const promises: Promise<bigint>[] = [];
  for (const command of commands) {
    for (const wallet of wallets) {
      const contract = getContract({
        address: command.source,
        abi: MINI_ABI,
        //@ts-ignore
        client: publicClient,
      });
      //@ts-ignore
      promises.push(contract.read.balanceOf([wallet.address]));
    }
  }
  const balanceOfArray: bigint[] = await Promise.all(promises);
  balanceOfArray.forEach((balanceOf, index) => {
    const command = commands[index];
    if (BigInt(balanceOf) >= BigInt(parseInt(command.formula))) passedIds.add(command.roleId);
    else failedIds.add(command.roleId);
  });
  const passed = Array.from(passedIds);
  const failed = Array.from(failedIds);
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

export async function getMembersFromDiscord(
  token: string,
  guildId: string,
  after: string,
  limit: string,
  full: boolean
) {
  const res = await fetch(
    'https://discord.com/api/v10' + Routes.guildMembers(guildId) + `?limit=${parseInt(limit)}&after=${after}`,
    { headers: { Authorization: `Bot ${token}` } }
  );
  const members = await res.json();
  if (!Array.isArray(members)) return { members: [], snowflake: '9999999999999999999' };
  let snowflake = members.length > 0 ? members[members.length - 1].user.id : '0';
  if (!full) {
    const miniMembers = [];
    for (const member of members) {
      if (snowflake < member.user.id) snowflake = member.user.id;
      miniMembers.push({
        id: member.user.id,
        username: member.user.username,
        bot: member.user.bot,
        avatar: member.user.avatar,
        roles: !member.roles ? [] : member.roles.map((role: any) => role.id),
        permissions: member.permissions,
      });
    }
    return { members: miniMembers, snowflake: snowflake };
  } else {
    return { members: members, snowflake: snowflake };
  }
}

export async function editWebhookMessage(clientId: string, webhookToken: string, body: any) {
  const res = await fetch(`https://discord.com/api/v10/webhooks/${clientId}/${webhookToken}/messages/@original`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return await res.json();
}

export async function rateLimitDiscord(client: KVNamespace, userId: string, key: string, limit: number) {
  // If the user is a dev, don't rate limit
  if (['234657292610568193', '217775277349011456'].includes(userId)) return null;
  // Rate limit this function
  const value = await client.get(key, 'text');
  if (!value) {
    const dateLimit = new Date(Date.now() + limit).toUTCString();
    await client.put(key, dateLimit, {
      // metadata: { someMetadataKey: 'someMetadataValue' },
      expirationTtl: limit,
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
        description: 'You should not be able to do that!',
        timestamp: new Date().toISOString(),
      },
    ],
    flags: InteractionResponseFlags.EPHEMERAL,
  };
}

export async function failedToRespond() {
  return {
    embeds: [
      {
        color: resolveColor('purple'),
        title: 'Something Went Wrong',
        description: 'Please try again or contact support!',
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

export function hashString(string1: string, string2: string) {
  const combinedString = string1 + string2;
  const hash = createHash('sha256').update(combinedString).digest('hex');
  return hash;
}
