-- Joins table
-- DROP TABLE IF EXISTS `Joins`;
CREATE TABLE IF NOT EXISTS `Joins` (
    `id` UUID PRIMARY KEY,
    `guildId` TEXT NOT NULL,
    `inviterId` TEXT NOT NULL,
    `joinerId` TEXT NOT NULL,
    `status` TEXT DEFAULT 'pending',
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (`guildId`, `inviterId`, `joinerId`)
);
CREATE INDEX `joins_guild_id_inviter_id` ON `Joins` (`guildId`, `inviterId`);