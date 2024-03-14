-- Wallets table
-- DROP TABLE IF EXISTS `Wallets`;
CREATE TABLE IF NOT EXISTS `Wallets` (
    `id` UUID PRIMARY KEY,
    `address` TEXT NOT NULL,
    `chain` INTEGER NOT NULL,
    `guildId` TEXT NOT NULL,
    `userId` TEXT NOT NULL,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (`guildId`, `userId`, `address`, `chain`)
);
CREATE INDEX `wallets_user_id_address` ON `Wallets` (`userId`, `address`);
CREATE INDEX `wallets_guild_id_chain` ON `Wallets` (`guildId`, `chain`);