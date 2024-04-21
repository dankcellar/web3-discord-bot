import { ApplicationCommandType, ContextMenuCommandBuilder, SlashCommandBuilder } from 'discord.js';

/**
 * globalRoll
 */
export const globalRoll = new SlashCommandBuilder();
globalRoll.setName('roll');
globalRoll.setDescription('For gambling degenerates');
globalRoll.addStringOption((option) => {
  option.setName('input');
  option.setDescription('Enter a number something like "d20"');
  option.setRequired(true);
  return option;
});

/**
 * globalViewer
 */
export const globalViewer = new SlashCommandBuilder();
globalViewer.setName('search');
globalViewer.setDescription('View an NFT from the collection');
globalViewer.addStringOption((option) => {
  option.setName('contract');
  option.setDescription('Smart contract address (i.e. 0x...)');
  option.setRequired(true);
  return option;
});
globalViewer.addIntegerOption((option) => {
  option.setName('token');
  option.setDescription('Enter a tokenId (i.e. 1 — 10000)');
  option.setRequired(true);
  return option;
});
globalViewer.addBooleanOption((option) => {
  option.setName('metadata');
  option.setDescription('Do a search for available metadata?');
  option.setRequired(false);
  return option;
});

/**
 * guildVerify
 */
export const guildVerify = new SlashCommandBuilder();
guildVerify.setName('wallets');
guildVerify.setDescription('Verify your wallet for Discord guild roles');

/**
 * guildViewRoles
 */
export const guildViewRoles = new SlashCommandBuilder();
guildViewRoles.setName('view-roles');
guildViewRoles.setDescription("View this guild's wallet verification roles");

/**
 * guildSyncRoles
 */
export const guildSyncRoles = new SlashCommandBuilder();
guildSyncRoles.setName('sync-roles');
guildSyncRoles.setDescription('ADMIN ONLY | Sync all guild roles with all linked wallets');
guildSyncRoles.setDefaultMemberPermissions('0');

/**
 * guildGetRole
 */
export const guildGetRole = new SlashCommandBuilder();
guildGetRole.setName('get-roles');
guildGetRole.setDescription('Get a guild role with a linked wallet');
guildGetRole.addStringOption((option) => {
  option.setName('wallet');
  option.setDescription('Your connected Web3 wallet address');
  option.setAutocomplete(true);
  option.setRequired(true);
  return option;
});
guildGetRole.addIntegerOption((option) => {
  option.setName('chain');
  option.setDescription('Network chainId (i.e. ETH is 1)');
  option.setRequired(false);
  return option;
});

/**
 * guildAddRole
 */
export const guildAddRole = new SlashCommandBuilder();
guildAddRole.setName('add-role');
guildAddRole.setDescription('ADMIN ONLY | Add a guild role for wallet verifications');
guildAddRole.addStringOption((option) => {
  option.setName('name');
  option.setDescription('Give this smart contract role a name');
  option.setRequired(true);
  return option;
});
guildAddRole.addStringOption((option) => {
  option.setName('contract');
  option.setDescription('Smart contract address (i.e. 0x...)');
  option.setRequired(true);
  return option;
});
guildAddRole.addRoleOption((option) => {
  option.setName('role');
  option.setDescription('Select a role to give guild member');
  option.setRequired(true);
  return option;
});
guildAddRole.addIntegerOption((option) => {
  option.setName('chain');
  option.setDescription('Network chain ID (i.e. ETH is 1)');
  option.setRequired(true);
  return option;
});
guildAddRole.addIntegerOption((option) => {
  option.setName('amount');
  option.setDescription('Amount in Wei or number of NFTs');
  option.setRequired(true);
  return option;
});
guildAddRole.setDefaultMemberPermissions('0');

/**
 * guildRemoveRole
 */
export const guildRemoveRole = new SlashCommandBuilder();
guildRemoveRole.setName('remove-role');
guildRemoveRole.setDescription('ADMIN ONLY | Remove a guild role from wallet verifications');
guildRemoveRole.addStringOption((option) => {
  option.setName('interaction');
  option.setDescription('Select a guild interaction to delete');
  option.setAutocomplete(true);
  option.setRequired(true);
  return option;
});
guildRemoveRole.setDefaultMemberPermissions('0');

/**
 * guildLandingPage
 */
export const guildLandingPage = new SlashCommandBuilder();
guildLandingPage.setName('landing');
guildLandingPage.setDescription('ADMIN ONLY | Create a landing page for wallet verifications');
guildLandingPage.setDefaultMemberPermissions('0');

/**
 * guildContextThing
 */
export const guildContextThing = new ContextMenuCommandBuilder();
guildContextThing.setType(ApplicationCommandType.Message);
guildContextThing.setName('context-thing');

// Export all commands
const COMMANDS = {
  // Global commands
  ROLL: globalRoll,

  // Guild Commands
  VERIFY: guildVerify,
  GET_ROLES: guildGetRole,
  VIEW_ROLES: guildViewRoles,

  // Admin commands
  ADD_ROLE: guildAddRole,
  REMOVE_ROLE: guildRemoveRole,
  SYNC_ROLES: guildSyncRoles,
  LANDING: guildLandingPage,

  // Deprecated commands
  // VIEWER: globalViewer,
};

export default COMMANDS;
