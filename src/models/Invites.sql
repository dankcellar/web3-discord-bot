-- Invites table
-- DROP TABLE IF EXISTS `Invites`;
CREATE TABLE IF NOT EXISTS `Invites` (
    `id` UUID PRIMARY KEY,
    `guildId` TEXT NOT NULL,
    `inviterId` TEXT NOT NULL,
    `code` TEXT NOT NULL,
    `join` INTEGER DEFAULT 0,
    `fake` INTEGER DEFAULT 0,
    `left` INTEGER DEFAULT 0,
    `active` INTEGER DEFAULT 1,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (`guildId`, `inviterId`, `code`)
);
CREATE INDEX `invites_guild_id_inviter_id` ON `Invites` (`guildId`, `inviterId`);