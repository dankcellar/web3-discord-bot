-- Roles table
-- DROP TABLE IF EXISTS `Roles`;
CREATE TABLE IF NOT EXISTS `Roles` (
    `id` UUID PRIMARY KEY,
    `guildId` TEXT NOT NULL,
    `userId` TEXT NOT NULL,
    `roleId` TEXT NOT NULL,
    `walletId` TEXT NOT NULL,
    `commandId` TEXT NOT NULL,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`walletId`) REFERENCES `Wallets`(`id`),
    FOREIGN KEY (`Commands`) REFERENCES `Commands`(`id`),
    UNIQUE (`guildId`, `userId`, `roleId`)
);
CREATE INDEX `roles_user_id` ON `Roles` (`userId`);
CREATE INDEX `roles_guild_id` ON `Roles` (`guildId`);