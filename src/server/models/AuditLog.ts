// ============================================================================
// Crux-Webmail — Sequelize Model: AuditLog
// ============================================================================
// Registro inmutable de eventos de seguridad: auth, session changes, password
// changes, MFA events, lockouts. Append-only con checksum integrity.
// ============================================================================

import { DataTypes, Model, Optional } from 'sequelize';
import { createHmac } from '../../utils/crypto';

// ------------------------------------------------------------------
// Interface
// ------------------------------------------------------------------
export type AuditLevel = 'info' | 'warn' | 'error' | 'critical';
export type AuditCategory = 
  | 'auth' 
  | 'session' 
  | 'password' 
  | 'mfa' 
  | 'account' 
  | 'system'
  | 'security';

interface AuditLogAttributes {
  id: string;
  event_id: string;
  timestamp: string;
  source: string;
  level: AuditLevel;
  category: AuditCategory;
  message: string;
  actor_id?: string;
  session_id?: string;
  client_ip?: string;
  user_agent?: string;
  metadata?: Record<string, unknown>;
  integrity_hash: string;
}

interface AuditLogCreationAttributes 
  extends Optional<AuditLogAttributes, 'id' | 'integrity_hash'> {
}

// ------------------------------------------------------------------
// Integrity Hash
// ------------------------------------------------------------------
function computeIntegrityHash(attrs: Partial<AuditLogAttributes>): string {
  const hashInput = [
    attrs.event_id, 
    attrs.timestamp, 
    attrs.level, 
    attrs.message,
    attrs.actor_id,
    attrs.session_id,
    attrs.client_ip,
  ].join('|');
  return createHmac(hashInput, 'audit-integrity-salt');
}

// ------------------------------------------------------------------
// Model Definition
// ------------------------------------------------------------------
export class AuditLogModel extends Model<AuditLogAttributes> implements AuditLogAttributes {
  public id!: string;
  public event_id!: string;
  public timestamp!: string;
  public source!: string;
  public level!: AuditLevel;
  public category!: AuditCategory;
  public message!: string;
  public actor_id?: string;
  public session_id?: string;
  public client_ip?: string;
  public user_agent?: string;
  public metadata?: Record<string, unknown>;
  public integrity_hash!: string;
}

export function initAuditLogModel(sequelize: any): typeof AuditLogModel {
  AuditLogModel.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    event_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    source: {
      type: DataTypes.STRING(128),
      allowNull: false,
    },
    level: {
      type: DataTypes.ENUM('info', 'warn', 'error', 'critical'),
      allowNull: false,
    },
    category: {
      type: DataTypes.ENUM('auth', 'session', 'password', 'mfa', 'account', 'system', 'security'),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    actor_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    session_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    client_ip: {
      type: DataTypes.STRING(45), // IPv4 or IPv6
      allowNull: true,
    },
    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    integrity_hash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: 'integrity_hash',
    },
  }, {
    sequelize,
    tableName: 'audit_logs',
    timestamps: false,
    hooks: {
      beforeCreate: (log: AuditLogModel) => {
        log.integrity_hash = computeIntegrityHash(log.dataValues);
      },
    },
    indexes: [
      {
        fields: ['actor_id'],
      },
      {
        fields: ['session_id'],
      },
      {
        fields: ['timestamp'],
      },
      {
        fields: ['category'],
      },
      {
        fields: ['level'],
      },
      {
        fields: ['event_id'],
      },
    ],
  });

  return AuditLogModel;
}