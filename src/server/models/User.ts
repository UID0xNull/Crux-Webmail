// ============================================================================
// Crux-Webmail — Sequelize Model: User
// ============================================================================
// Almacena identidad, credenciales hash (bcrypt), roles, estado MFA,
// timestamps de auditoría. Sin datos sensibles en texto plano.
// ============================================================================

import { DataTypes, Model, Optional } from 'sequelize';
import bcrypt from 'bcryptjs';
import { generateSalt } from '../../utils/crypto';
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
  passwordHash: string;
  display_name?: string;
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

interface UserCreationAttributes extends Optional<UserAttributes, 'id' | 'passwordHash' | 'display_name' | 'roles' | 'is_active' | 'mfa_enabled' | 'failed_attempts'> {
  password: string; // Plain password for creation only
}

// ------------------------------------------------------------------
// Bcrypt Config
// ------------------------------------------------------------------
const BCRYPT_ROUNDS = 12; // ~256ms per hash on modern hardware

async function hashPassword(plainPassword: string): Promise<string> {
  const salt = await generateSalt(); // randomBytes(16) hex = 32 bytes
  return bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
}

export async function comparePassword(plain: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(plain, hashed);
}

// ------------------------------------------------------------------
// Model Definition
// ------------------------------------------------------------------
export class UserModel extends Model<UserAttributes> implements UserAttributes {
  public id!: string;
  public username!: string;
  public passwordHash!: string;
  public display_name?: string;
  public roles!: string[];
  public is_active!: boolean;
  public mfa_enabled!: boolean;
  public mfa_secret?: string;
  public failed_attempts!: number;
  public locked_until?: number;
  public last_login?: string;
  public created_at!: string;
  public updated_at!: string;
  public deleted_at?: string;

  // Hooks
  public readonly password?: string;
}

export function initUserModel(sequelize: any): typeof UserModel {
  UserModel.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    username: {
      type: DataTypes.STRING(256),
      allowNull: false,
      unique: true,
      validate: {isEmail: { msg: 'Username must be a valid email' }},
    },
    passwordHash: {
      type: DataTypes.STRING(60),
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
        if (user.dataValues.password) {
          user.passwordHash = await hashPassword(user.dataValues.password);
        }
      },
      beforeUpdate: async (user: UserModel) => {
        if (user.dataValues.password) {
          user.passwordHash = await hashPassword(user.dataValues.password);
        }
      },
    },
  });

  return UserModel;
}