import { DataTypes, Sequelize } from 'sequelize';

const db = new Sequelize({
  dialect: 'sqlite',
  storage: ':memory:',
  logging: true,
});

export default db;

export const Totals = db.define(
  'Totals',
  {
    id: {
      primaryKey: true,
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
    },
    inviteId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Invites',
        key: 'id',
      },
    },
    normal: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    left: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    fake: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
  },
  {
    timestamps: true,
  }
);

export const Invites = db.define(
  'Invites',
  {
    id: {
      primaryKey: true,
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
    },
    guildId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    inviterId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    code: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    uses: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['guildId', 'inviterId', 'code'],
      },
    ],
  }
);

export const Joins = db.define(
  'Joins',
  {
    id: {
      primaryKey: true,
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
    },
    guildId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    inviterId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    joinerId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: 'joined',
    },
  },
  {
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['guildId', 'inviterId', 'joinerId'],
      },
      {
        fields: ['guildId', 'joinerId'],
      },
    ],
  }
);

export const Commands = db.define(
  'Commands',
  {
    id: {
      primaryKey: true,
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
    },
    command: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    chainId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    guildId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    role: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    source: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    formula: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['command', 'guildId', 'role', 'source'],
      },
      { fields: ['guildId'] },
    ],
  }
);

export const Wallets = db.define(
  'Wallets',
  {
    id: {
      primaryKey: true,
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
    },
    wallet: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    chainId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    guildId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['guildId', 'userId', 'wallet', 'chainId'],
      },
      {
        fields: ['userId'],
      },
    ],
  }
);

export const Auths = db.define(
  'Auths',
  {
    id: {
      primaryKey: true,
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
    },
    tokenType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    accessToken: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    refreshToken: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    expiresIn: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    timestamps: true,
  }
);

Invites.hasOne(Totals, { foreignKey: 'inviteId' });
Totals.belongsTo(Invites, { foreignKey: 'inviteId' });

// db.sync({ force: true });

Wallets.create({ wallet: '0x123', chainId: 1, guildId: '123', userId: '123' });
