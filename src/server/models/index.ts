// ============================================================================
// Crux-Webmail — Sequelize Models: Index & Relationships
// ============================================================================
// Inicializa todos los modelos, define relaciones FK, y exporta
// funciones de sincronización (sync) para migraciones automáticas.
// ============================================================================

import { Sequelize } from 'sequelize';
import { initUserModel, UserModel } from './User';
import { initRefreshTokenModel, RefreshTokenModel } from './RefreshToken';
import { initAuditLogModel, AuditLogModel } from './AuditLog';
import { initMFASessionModel, MFASessionModel } from './MFASession';
import { initDraftModel, DraftModel } from './Draft';
import { initAttachmentModel, AttachmentModel } from './Attachment';

export { UserModel, RefreshTokenModel, AuditLogModel, MFASessionModel, DraftModel, AttachmentModel };

// ------------------------------------------------------------------
// Initialize all models
// ------------------------------------------------------------------
let initialized = false;

export async function initModels(sequelize: Sequelize): Promise<void> {
  if (initialized) return;

  // Create models
  initUserModel(sequelize);
  initRefreshTokenModel(sequelize);
  initAuditLogModel(sequelize);
  initMFASessionModel(sequelize);
  initDraftModel(sequelize);
  initAttachmentModel(sequelize);

  // Define relationships
  UserModel.hasMany(RefreshTokenModel, { foreignKey: 'userId', as: 'refreshTokens' });
  UserModel.hasMany(MFASessionModel, { foreignKey: 'userId', as: 'mfaSessions' });
  UserModel.hasMany(AuditLogModel, { foreignKey: 'actor_id', as: 'auditLogs' });
  UserModel.hasMany(DraftModel, { foreignKey: 'userId', as: 'drafts' });
  UserModel.hasMany(AttachmentModel, { foreignKey: 'userId', as: 'attachments' });

  RefreshTokenModel.belongsTo(UserModel, { foreignKey: 'userId', as: 'user' });
  MFASessionModel.belongsTo(UserModel, { foreignKey: 'userId', as: 'user' });

  DraftModel.belongsTo(UserModel, { foreignKey: 'userId', as: 'user' });
  AttachmentModel.belongsTo(UserModel, { foreignKey: 'userId', as: 'user' });
  AttachmentModel.belongsTo(DraftModel, { foreignKey: 'draftId', as: 'draft' });
  DraftModel.hasMany(AttachmentModel, { foreignKey: 'draftId', as: 'attachmentList' });

  initialized = true;
}

// ------------------------------------------------------------------
// Sync models with database
// ------------------------------------------------------------------
export async function syncModels(sequelize: Sequelize, options?: { force?: boolean }): Promise<void> {
  await initModels(sequelize);
  
  const syncOptions: { force?: boolean; alter?: boolean } = {};
  
  if (options?.force) {
    syncOptions.force = true; // DROP + recreate — DANGEROUS
  } else {
    syncOptions.alter = false; // Production: use migration tools
  }

  await UserModel.sync(syncOptions);
  await RefreshTokenModel.sync(syncOptions);
  await AuditLogModel.sync(syncOptions);
  await MFASessionModel.sync(syncOptions);
  await DraftModel.sync(syncOptions);
  await AttachmentModel.sync(syncOptions);
}