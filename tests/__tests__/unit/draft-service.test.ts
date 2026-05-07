// ============================================================================
// Crux-Webmail — Unit Tests: Draft Service
// ============================================================================

import { ModelMock } from '../../mocks/sequelize.mock';

// --- Mocks en orden correcto (Sequelize models primero) ---
jest.mock('../../../../src/server/models/User', () => ({
  UserModel: class extends ModelMock {
    static name = 'User';
  },
}));

jest.mock('../../../../src/server/models/Draft', () => ({
  DraftModel: class extends ModelMock {
    static name = 'Draft';
  },
}));

jest.mock('../../../../src/server/models/Attachment', () => ({
  AttachmentModel: class extends ModelMock {
    static name = 'Attachment';
  },
}));

jest.mock('../../../../src/server/utils/audit-logger', () => ({
  auditLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), critical: jest.fn() },
}));

jest.mock('../../../../src/server/errors/handler', () => ({
  CruxError: class extends Error {
    code: string;
    details?: any;
    constructor(code: string, message: string, details?: any) {
      super(message);
      this.code = code;
      this.details = details;
    }
  },
}));

describe('Draft Service', () => {
  let draftService: any;
  let UserModel: any;
  let DraftModel: any;

  beforeEach(async () => {
    ModelMock.resetAll();

    jest.resetModules();

    UserModel = (require('../../../../src/server/models/User') as any).UserModel;
    DraftModel = (require('../../../../src/server/models/Draft') as any).DraftModel;
    draftService = require('../../../../src/server/services/draft-service');

    await UserModel.create({
      id: 'user-1',
      username: 'test@test.com',
      password: 'hashed',
      is_active: true,
      roles: ['user'],
    });
  });

  describe('createDraft', () => {
    it('should create a draft successfully', async () => {
      const draft = await draftService.createDraft('user-1', {
        to: [{ name: 'Test', email: 'recipient@test.com' }],
        subject: 'Hello',
        body_text: 'Body text',
      });

      expect(draft).toBeDefined();
      expect(draft.id).toBeDefined();
      expect(draft.subject).toBe('Hello');
      expect(draft.status).toBe('draft');
      expect(draft.to).toHaveLength(1);
      expect(draft.to[0].email).toBe('recipient@test.com');
      expect(draft.attachmentCount).toBe(0);
    });

    it('should use defaults for optional fields', async () => {
      const draft = await draftService.createDraft('user-1', {});

      expect(draft.subject).toBe('');
      expect(draft.body_html).toBe('');
      expect(draft.encrypt).toBe(false);
      expect(draft.sign).toBe(true);
    });

    it('should throw when user does not exist', async () => {
      await expect(
        draftService.createDraft('non-existent-user', { subject: 'Test' })
      ).rejects.toThrow('USER_NOT_FOUND');
    });

    it('should throw when user is inactive', async () => {
      await UserModel.update({ is_active: false }, { where: { id: 'user-1' } });
      await expect(
        draftService.createDraft('user-1', { subject: 'Test' })
      ).rejects.toThrow('USER_NOT_FOUND');
    });
  });

  describe('updateDraft', () => {
    it('should update existing draft', async () => {
      const created = await draftService.createDraft('user-1', {
        subject: 'Original',
      });

      const updated = await draftService.updateDraft('user-1', created.id, {
        subject: 'Updated Subject',
        body_text: 'New body',
      });

      expect(updated.subject).toBe('Updated Subject');
      expect(updated.body_text).toBe('New body');
    });

    it('should throw when draft does not exist', async () => {
      await expect(
        draftService.updateDraft('user-1', 'fake-id', { subject: 'x' })
      ).rejects.toThrow('DRAFT_NOT_FOUND');
    });

    it('should throw when draft belongs to another user', async () => {
      await UserModel.create({
        id: 'user-2',
        username: 'other@test.com',
        password: 'hashed',
        is_active: true,
        roles: ['user'],
      });

      const draft = await draftService.createDraft('user-2', { subject: 'Secret' });

      await expect(
        draftService.updateDraft('user-1', draft.id, { subject: 'x' })
      ).rejects.toThrow('DRAFT_NOT_FOUND');
    });
  });

  describe('getDraft', () => {
    it('should return draft with attachments info', async () => {
      const created = await draftService.createDraft('user-1', {
        subject: 'Test Draft',
        body_text: 'Hello World',
      });

      const draft = await draftService.getDraft('user-1', created.id);

      expect(draft.id).toBe(created.id);
      expect(draft.subject).toBe('Test Draft');
      expect(draft.body_text).toBe('Hello World');
    });
  });

  describe('listDrafts', () => {
    it('should return all drafts for a user', async () => {
      await draftService.createDraft('user-1', { subject: 'Draft 1' });
      await draftService.createDraft('user-1', { subject: 'Draft 2' });
      await draftService.createDraft('user-1', { subject: 'Draft 3' });

      const drafts = await draftService.listDrafts('user-1', 50, 0);

      expect(drafts).toHaveLength(3);
    });

    it('should respect limit and offset', async () => {
      await draftService.createDraft('user-1', { subject: 'A' });
      await draftService.createDraft('user-1', { subject: 'B' });
      await draftService.createDraft('user-1', { subject: 'C' });

      const first = await draftService.listDrafts('user-1', 2, 0);
      const second = await draftService.listDrafts('user-1', 2, 2);

      expect(first).toHaveLength(2);
      expect(second).toHaveLength(1);
    });
  });

  describe('deleteDraft', () => {
    it('should delete a draft', async () => {
      const created = await draftService.createDraft('user-1', { subject: 'To delete' });

      await expect(
        draftService.deleteDraft('user-1', created.id)
      ).resolves.toBeUndefined();
    });

    it('should throw when draft not found', async () => {
      await expect(
        draftService.deleteDraft('user-1', 'nonexistent')
      ).rejects.toThrow('DRAFT_NOT_FOUND');
    });
  });

  describe('cleanupOldDrafts', () => {
    it('should return count of cleaned drafts', async () => {
      const count = await draftService.cleanupOldDrafts('user-1', 72);
      expect(typeof count).toBe('number');
    });
  });
});