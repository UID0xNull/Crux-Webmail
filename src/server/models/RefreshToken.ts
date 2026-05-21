// ============================================================================
// Crux-Webmail — Sequelize Model: RefreshToken
// ============================================================================
// Almacena refresh tokens con rotación, revocación, binding de dispositivo.
// TTL configurable, limpieza automática por timestamp.
// ============================================================================

import { DataTypes, Model, Optional } from 'sequelize';

// ------------------------------------------------------------------
// Interface
// ------------------------------------------------------------------
interface RefreshTokenAttributes {
  id: string;
  userId: string;
  sessionId: string;
  tokenHash: string;
  fingerprint: string;
  ip_hash: string;
  expiresAt: number;
  revoked: boolean;
  revokedAt?: number;
  lastUsedAt?: number;
  created_at: string;
}

interface RefreshTokenCreationAttributes 
  extends Optional<RefreshTokenAttributes, 'id' | 'revoked' | 'created_at'> {
}

// ------------------------------------------------------------------
// Model Definition
// ------------------------------------------------------------------
export class RefreshTokenModel extends Model<RefreshTokenAttributes> implements RefreshTokenAttributes {
  declare id: string;
  declare userId: string;
  declare sessionId: string;
  declare tokenHash: string;
  declare fingerprint: string;
  declare ip_hash: string;
  declare expiresAt: number;
  declare revoked: boolean;
  declare revokedAt: number | undefined;
  declare lastUsedAt: number | undefined;
  declare created_at: string;
}

export function initRefreshTokenModel(sequelize: any): typeof RefreshTokenModel {
  RefreshTokenModel.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    sessionId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    tokenHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: 'token_hash',
    },
    fingerprint: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    ip_hash: {
      type: DataTypes.STRING(16),
      allowNull: false,
    },
    expiresAt: {
      type: DataTypes.BIGINT,
      allowNull: false,
      field: 'expires_at',
    },
    revoked: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    revokedAt: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: 'revoked_at',
    },
    lastUsedAt: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: 'last_used_at',
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  }, {
    sequelize,
    tableName: 'refresh_tokens',
    timestamps: false,
    indexes: [
      {
        fields: ['userId'],
      },
      {
        fields: ['sessionId'],
      },
      {
        fields: ['token_hash'],
        unique: true,
      },
      {
        fields: ['expires_at'],
      },
    ],
  });

  return RefreshTokenModel;
}