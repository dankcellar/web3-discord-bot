import { DataTypes, Sequelize } from 'sequelize';

const db = new Sequelize({
  dialect: 'sqlite',
  storage: ':memory:',
  logging: true,
});

export default db;

export const Messages = db.define(
  'Messages',
  {
    id: {
      primaryKey: true,
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
    },
    account: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    message: {
      type: DataTypes.STRING(280),
      allowNull: false,
    },
    nickname: {
      type: DataTypes.STRING(24),
      allowNull: true,
    },
    origin: {
      type: DataTypes.STRING(16),
      allowNull: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Puzzles = db.define(
  'Puzzles',
  {
    id: {
      primaryKey: true,
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
    },
    account: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    hash: {
      type: DataTypes.STRING(256),
      allowNull: false,
    },
    submit: {
      type: DataTypes.STRING(256),
      allowNull: true,
    },
    correct: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    finished: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    wallet: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    edition: {
      type: DataTypes.SMALLINT,
      defaultValue: 0,
    },
    source: {
      type: DataTypes.STRING(16),
      allowNull: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Dungeons = db.define(
  'Dungeons',
  {
    id: {
      primaryKey: true,
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
    },
    name: {
      type: DataTypes.STRING(128),
      allowNull: false,
    },
    season: {
      type: DataTypes.SMALLINT,
      allowNull: false,
    },
    levels: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
  },
  {
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['name', 'season'],
      },
    ],
  }
);

export const Attempts = db.define(
  'Attempts',
  {
    id: {
      primaryKey: true,
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
    },
    dungeonId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: Dungeons,
        key: 'id',
      },
    },
    account: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(16),
      defaultValue: 'upgrade',
    },
    currency: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    checkpoint: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    upgrades: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    gameState: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
  },
  {
    timestamps: true,
    indexes: [
      {
        fields: ['account'],
      },
      {
        fields: ['dungeonId'],
      },
    ],
  }
);

Dungeons.hasMany(Attempts, { foreignKey: 'dungeonId' });
Attempts.belongsTo(Dungeons, { foreignKey: 'dungeonId' });

db.sync({ force: true });
