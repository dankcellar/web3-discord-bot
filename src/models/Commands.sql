-- Commands table
-- DROP TABLE IF EXISTS `Commands`;
CREATE TABLE IF NOT EXISTS `Commands` (
    `id` UUID PRIMARY KEY,
    `command` TEXT DEFAULT 'web3',
    `chain` INTEGER NOT NULL,
    `guildId` TEXT NOT NULL,
    `roleId` TEXT NOT NULL,
    `source` TEXT NOT NULL,
    `formula` TEXT NOT NULL,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (`guildId`, `roleId`, `source`, `chain`)
);
CREATE INDEX `commands_guild_id` ON `Commands` (`guildId`);