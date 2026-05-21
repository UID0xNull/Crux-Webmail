// ============================================================================
// Crux-Webmail — Sequelize Model: MFASession
// ============================================================================
// Gestiona el estado del flujo MFA (TOTP): setup, pending codes,
// attempt tracking con TTL estricto. Compatible con RFC 6238.
// ============================================================================

import { DataTypes, Model, Optional } from 'sequelize';

// ------------------------------------------------------------------
// Interface
// ------------------------------------------------------------------
export type MFASessionStatus = 'pending' | 'verified' | 'expired' | 'failed';
export type MFAMethod = 'totp' | 'backup_code';

interface MFASessionAttributes {
  id: string;
  userId: string;
  session_id: string;
  method: MFAMethod;
  status: MFASessionStatus;
  totp_secret?: string;
  backup_code_hash?: string;
  attempts: number;
  max_attempts: number;
  expires_at: number;
  verified_at?: number;
  created_at: string;
}

interface MFASessionCreationAttributes 
  extends Optional<MFASessionAttributes, 'id' | 'status' | 'attempts' | 'max_attempts' | 'created_at'> {
}

// ------------------------------------------------------------------
// Model Definition
// ------------------------------------------------------------------
export class MFASessionModel extends Model<MFASessionAttributes> implements MFASessionAttributes {
  declare id: string;
  declare userId: string;
  declare session_id: string;
  declare method: MFAMethod;
  declare status: MFASessionStatus;
  declare totp_secret: string | undefined;
  declare backup_code_hash: string | undefined;
  declare attempts: number;
  declare max_attempts: number;
  declare expires_at: number;
  declare verified_at: number | undefined;
  declare created_at: string;
}

export function initMFASessionModel(sequelize: any): typeof MFASessionModel {
  MFASessionModel.init({
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
    session_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    method: {
      type: DataTypes.ENUM('totp', 'backup_code'),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('pending', 'verified', 'expired', 'failed'),
      allowNull: false,
      defaultValue: 'pending',
    },
    totp_secret: {
      type: DataTypes.STRING(256),
      allowNull: true,
    },
    backup_code_hash: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    max_attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5,
    },
    expires_at: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    verified_at: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  }, {
    sequelize,
    tableName: 'mfa_sessions',
    timestamps: false,
    indexes: [
      {
        fields: ['userId'],
      },
      {
        fields: ['session_id'],
      },
      {
        fields: ['expires_at'],
      },
    ],
  });

  return MFASessionModel;
}