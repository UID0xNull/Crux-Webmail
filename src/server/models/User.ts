// ============================================================================
// Crux-Webmail — Sequelize Model: User
// ============================================================================
// Almacena identidad, credenciales hash (bcrypt), roles, estado MFA,
// timestamps de auditoría. Sin datos sensibles en texto plano.
// ============================================================================

import { DataTypes, Model, Optional } from 'sequelize';
import bcrypt from 'bcryptjs';
import { z } from 'zod';


// ------------------------------------------------------------------
// Validation Schema
// ------------------------------------------------------------------
const UserValidation = z.object({
  username: z.string().email('Must be a valid email'),
  password: z.string().min(8).max(256),
  displayName: z.string().min(1).max(128).optional(),
  roles: z.array(z.enum(['user', 'admin', 'moderator'])).default(['user']),
  isActive: z.boolean().default(true),
  mfaEnabled: z.boolean().default(false),
});

// ------------------------------------------------------------------
// Interface
// ------------------------------------------------------------------
interface UserAttributes {
  id: string;
  username: string;
  password?: string; // transient for creation/update via hooks
  passwordHash: string;
  display_name?: string | null;
  roles: string[];
  is_active: boolean;
  mfa_enabled: boolean;
  mfa_secret?: string;
  failed_attempts: number;
  locked_until?: number;
  last_login?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

interface UserCreationAttributes extends Optional<UserAttributes, 'id' | 'passwordHash' | 'display_name' | 'roles' | 'is_active' | 'mfa_enabled' | 'failed_attempts' | 'created_at' | 'updated_at'> {
  password: string; // Plain password for creation only
}

// ------------------------------------------------------------------
// Bcrypt Config
// ------------------------------------------------------------------
const BCRYPT_ROUNDS = 12; // ~256ms per hash on modern hardware

async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
}

export async function comparePassword(plain: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(plain, hashed);
}

// ------------------------------------------------------------------
// Model Definition
// ------------------------------------------------------------------
export class UserModel extends Model<UserAttributes> implements UserAttributes {
  declare id: string;
  declare username: string;
  declare passwordHash: string;
  declare display_name: string | undefined;
  declare roles: string[];
  declare is_active: boolean;
  declare mfa_enabled: boolean;
  declare mfa_secret: string | undefined;
  declare failed_attempts: number;
  declare locked_until: number | undefined;
  declare last_login: string | undefined;
  declare created_at: string;
  declare updated_at: string;
  declare deleted_at: string | undefined;
}

export function initUserModel(sequelize: any): typeof UserModel {
  UserModel.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    password: {
      type: DataTypes.VIRTUAL, // transient — hashed in hook, never persisted
    },
    username: {
      type: DataTypes.STRING(256),
      allowNull: false,
      unique: true,
      validate: { isEmail: { msg: 'Username must be a valid email' } },
    },
    passwordHash: {
      type: DataTypes.STRING(256),
      allowNull: false,
      field: 'password_hash',
    },
    display_name: {
      type: DataTypes.STRING(128),
      allowNull: true,
    },
    roles: {
      type: DataTypes.ARRAY(DataTypes.STRING(50)),
      allowNull: false,
      defaultValue: ['user'],
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    mfa_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    mfa_secret: {
      type: DataTypes.STRING(256),
      allowNull: true,
    },
    failed_attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    locked_until: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    last_login: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    sequelize,
    tableName: 'users',
    timestamps: true,
    paranoid: true,
    hooks: {
      beforeCreate: async (user: UserModel) => {
        const plain = user.getDataValue('password' as any);
        if (plain) {
          user.setDataValue('passwordHash', await hashPassword(plain));
        }
      },
      beforeUpdate: async (user: UserModel) => {
        const plain = user.getDataValue('password' as any);
        if (plain) {
          user.setDataValue('passwordHash', await hashPassword(plain));
        }
      },
    },
  });

  return UserModel;
}