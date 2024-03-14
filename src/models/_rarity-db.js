import { DataTypes, Sequelize } from 'sequelize';

const db = new Sequelize({
  dialect: 'sqlite',
  storage: ':memory:',
  logging: true,
});

export default db;

export const Collections = db.define(
  'Collections',
  {
    id: {
      primaryKey: true,
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
    },
    chainId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    contract: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    supply: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: 'fetching',
    },
    file: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    website: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    symbol: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    tries: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    manual: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['chainId', 'contract'],
      },
      {
        fields: ['chainId'],
      },
    ],
  }
);

export const Tokens = db.define(
  'Tokens',
  {
    id: {
      primaryKey: true,
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
    },
    collectionId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: Collections,
        key: 'id',
      },
    },
    ipfs: {
      type: DataTypes.STRING(511),
      allowNull: true,
    },
    redo: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    cached: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    edition: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    rank: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    rarity: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    image: {
      type: DataTypes.STRING(511),
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    attributes: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['collectionId', 'edition'],
      },
      {
        fields: ['collectionId'],
      },
    ],
  }
);

export const Prices = db.define(
  'Prices',
  {
    id: {
      primaryKey: true,
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
    },
    tokenId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: Tokens,
        key: 'id',
      },
    },
    from: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    price: {
      type: DataTypes.DECIMAL,
      allowNull: true,
    },
    sale: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    timestamps: true,
    indexes: [
      {
        fields: ['tokenId'],
      },
    ],
  }
);

Collections.hasMany(Tokens, { foreignKey: 'collectionId' });
Tokens.belongsTo(Collections, { foreignKey: 'collectionId' });

Tokens.hasMany(Prices, { foreignKey: 'tokenId' });
Prices.belongsTo(Tokens, { foreignKey: 'tokenId' });

db.sync({ force: true });
