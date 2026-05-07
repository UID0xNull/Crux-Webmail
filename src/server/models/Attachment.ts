// ============================================================================
// Crux-Webmail — Sequelize Model: Attachment
// ============================================================================
// Almacena metadatos de adjuntos: hash de integridad, estado de escaneo
// ClamAV, referencia a almacenamiento (MinIO/local), y vínculo al draft.
// ============================================================================

import { DataTypes, Model, Optional } from 'sequelize';

export type AttachmentScanStatus = 'pending' | 'scanning' | 'clean' | 'infected' | 'error';

// ------------------------------------------------------------------
// Interface
// ------------------------------------------------------------------
interface AttachmentAttributes {
  id: string;
  draftId: string;
  userId: string;
  filename: string;
  originalName: string;
  contentType: string;
  size: number;
  contentId?: string;
  sha256: string;
  scanStatus: AttachmentScanStatus;
  scanMessage?: string;
  storagePath: string;
  storageKey: string;
  inline: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

interface AttachmentCreationAttributes
  extends Optional<AttachmentAttributes, 'id' | 'scanStatus' | 'storagePath' | 'storageKey' | 'inline' | 'contentId' | 'scanMessage'> {}

// ------------------------------------------------------------------
// Model Definition
// ------------------------------------------------------------------
export class AttachmentModel extends Model<AttachmentAttributes> implements AttachmentAttributes {
  public id!: string;
  public draftId!: string;
  public userId!: string;
  public filename!: string;
  public originalName!: string;
  public contentType!: string;
  public size!: number;
  public contentId?: string;
  public sha256!: string;
  public scanStatus!: AttachmentScanStatus;
  public scanMessage?: string;
  public storagePath!: string;
  public storageKey!: string;
  public inline!: boolean;
  public created_at!: string;
  public updated_at!: string;
  public deleted_at?: string;
}

export function initAttachmentModel(sequelize: any): typeof AttachmentModel {
  AttachmentModel.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    draftId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'draft_id',
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
    },
    filename: {
      type: DataTypes.STRING(512),
      allowNull: false,
    },
    originalName: {
      type: DataTypes.STRING(512),
      allowNull: false,
      field: 'original_name',
    },
    contentType: {
      type: DataTypes.STRING(256),
      allowNull: false,
      field: 'content_type',
    },
    size: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    contentId: {
      type: DataTypes.STRING(256),
      allowNull: true,
      field: 'content_id',
    },
    sha256: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    scanStatus: {
      type: DataTypes.ENUM('pending', 'scanning', 'clean', 'infected', 'error'),
      allowNull: false,
      defaultValue: 'pending',
      field: 'scan_status',
    },
    scanMessage: {
      type: DataTypes.STRING(512),
      allowNull: true,
      field: 'scan_message',
    },
    storagePath: {
      type: DataTypes.STRING(1024),
      allowNull: false,
      defaultValue: '',
      field: 'storage_path',
    },
    storageKey: {
      type: DataTypes.STRING(512),
      allowNull: false,
      field: 'storage_key',
    },
    inline: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
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
    tableName: 'attachments',
    timestamps: true,
    paranoid: true,
    indexes: [
      {
        name: 'idx_attachments_draft_id',
        fields: ['draft_id'],
      },
      {
        name: 'idx_attachments_user_id',
        fields: ['user_id'],
      },
      {
        name: 'idx_attachments_scan_status',
        fields: ['scan_status'],
      },
    ],
  });

  return AttachmentModel;
}