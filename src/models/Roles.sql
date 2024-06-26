-- Roles table
-- DROP TABLE IF EXISTS `Roles`;
CREATE TABLE IF NOT EXISTS `Roles` (
    `id` UUID PRIMARY KEY,
    `guildId` TEXT NOT NULL,
    `userId` TEXT NOT NULL,
    `roleId` TEXT NOT NULL,
    UNIQUE (`guildId`, `userId`, `roleId`)
);
CREATE INDEX `roles_user_id` ON `Roles` (`userId`);
CREATE INDEX `roles_guild_id` ON `Roles` (`guildId`);