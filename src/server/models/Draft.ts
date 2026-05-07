// ============================================================================
// Crux-Webmail — Sequelize Model: Draft
// ============================================================================
// Almacena borradores de composición con soporte para auto-save incremental,
// adjuntos vinculados, estado de escaneo y metadatos de cifrado.
// ============================================================================

import { DataTypes, Model, Optional } from 'sequelize';

export type DraftStatus = 'draft' | 'queued' | 'scanning' | 'ready' | 'error';

// ------------------------------------------------------------------
// Interface
// ------------------------------------------------------------------
interface DraftAttributes {
  id: string;
  userId: string;
  to: Array<{ name: string; email: string }>;
  cc?: Array<{ name: string; email: string }>;
  bcc?: Array<{ name: string; email: string }>;
  subject: string;
  body_html: string;
  body_text: string;
  status: DraftStatus;
  encrypt: boolean;
  sign: boolean;
  attachment_count: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

interface DraftCreationAttributes
  extends Optional<DraftAttributes, 'id' | 'status' | 'encrypt' | 'sign' | 'attachment_count' | 'cc' | 'bcc'> {}

// ------------------------------------------------------------------
// Model Definition
// ------------------------------------------------------------------
export class DraftModel extends Model<DraftAttributes> implements DraftAttributes {
  public id!: string;
  public userId!: string;
  public to!: Array<{ name: string; email: string }>;
  public cc?: Array<{ name: string; email: string }>;
  public bcc?: Array<{ name: string; email: string }>;
  public subject!: string;
  public body_html!: string;
  public body_text!: string;
  public status!: DraftStatus;
  public encrypt!: boolean;
  public sign!: boolean;
  public attachment_count!: number;
  public created_at!: string;
  public updated_at!: string;
  public deleted_at?: string;
}

export function initDraftModel(sequelize: any): typeof DraftModel {
  DraftModel.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
    },
    to: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    cc: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    bcc: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    subject: {
      type: DataTypes.STRING(998),
      allowNull: false,
      defaultValue: '',
    },
    body_html: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    body_text: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    status: {
      type: DataTypes.ENUM('draft', 'queued', 'scanning', 'ready', 'error'),
      allowNull: false,
      defaultValue: 'draft',
    },
    encrypt: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    sign: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    attachment_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
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
    tableName: 'drafts',
    timestamps: true,
    paranoid: true,
    hooks: {
      beforeUpdate: (draft: DraftModel) => {
        draft.updated_at = new Date().toISOString();
      },
    },
  });

  return DraftModel;
}