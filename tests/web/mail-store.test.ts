// ============================================================================
// Crux-Webmail — Unit Tests: Mail Store (Zustand)
// ============================================================================

import { act } from 'react';
import { useMailStore } from 'src/web/lib/store/mail';

// ------------------------------------------------------------------
// Mock API client
// ------------------------------------------------------------------
jest.mock('src/web/lib/api/client', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

import { api } from 'src/web/lib/api/client';

const mockApi = api as jest.Mocked<typeof api>;

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function createTestMessage(overrides = {}) {
  return {
    id: 'msg-001',
    listIds: ['$inbox'],
    mailboxId: '$inbox',
    subject: 'Test Message',
    from: [{ name: 'Sender', email: 'sender@example.com' }],
    to: [{ name: 'Recipient', email: 'recipient@example.com' }],
    date: '2024-01-01T12:00:00Z',
    previewText: 'Hello world',
    size: 1024,
    isSeen: false,
    isFlagged: false,
    isDraft: false,
    hasAttachments: false,
    isEncrypted: false,
    isSigned: false,
    ...overrides,
  };
}

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------
describe('Mail Store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useMailStore.setState(useMailStore.getState()); // reset to defaults
  });

  describe('loadInbox', () => {
    it('should load messages from the inbox', async () => {
      const messages = [createTestMessage()];
      mockApi.get.mockResolvedValueOnce({
        data: {
          items: messages,
          queryId: 'q1',
          newPosition: 'cursor-1',
          total: 1,
        },
        status: 200,
        correlation_id: 'cor-1',
        timestamp: new Date().toISOString(),
      });

      await act(async () => {
        await useMailStore.getState().loadInbox();
      });

      const state = useMailStore.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].id).toBe('msg-001');
      expect(state.isLoading).toBe(false);
      expect(state.cursor).toBe('cursor-1');
    });

    it('should handle load failure gracefully', async () => {
      mockApi.get.mockRejectedValueOnce(new Error('Network error'));

      await act(async () => {
        await useMailStore.getState().loadInbox();
      });

      expect(useMailStore.getState().isLoading).toBe(false);
      expect(useMailStore.getState().messages).toEqual([]);
    });

    it('should load a specific mailbox', async () => {
      mockApi.get.mockResolvedValueOnce({
        data: {
          items: [],
          queryId: 'q2',
          newPosition: null,
        },
        status: 200,
        correlation_id: 'cor-2',
        timestamp: new Date().toISOString(),
      });

      await act(async () => {
        await useMailStore.getState().loadInbox('$sent');
      });

      expect(useMailStore.getState().selectedMailbox).toBe('$sent');
      expect(mockApi.get).toHaveBeenCalledWith(
        '/api/mail/list/$sent?count=50&sort=date-desc'
      );
    });
  });

  describe('loadMessage', () => {
    it('should load and mark as read', async () => {
      const msg = createTestMessage({ isSeen: false });
      mockApi.get.mockResolvedValueOnce({
        data: msg,
        status: 200,
        correlation_id: 'cor-3',
        timestamp: new Date().toISOString(),
      });
      mockApi.patch.mockResolvedValueOnce({
        data: {},
        status: 200,
        correlation_id: 'cor-4',
        timestamp: new Date().toISOString(),
      });

      await act(async () => {
        await useMailStore.getState().loadMessage('msg-001');
      });

      expect(useMailStore.getState().selectedMessage?.id).toBe('msg-001');
      expect(mockApi.patch).toHaveBeenCalled();
    });

    it('should not mark as read if already seen', async () => {
      const msg = createTestMessage({ isSeen: true });
      mockApi.get.mockResolvedValueOnce({
        data: msg,
        status: 200,
        correlation_id: 'cor-5',
        timestamp: new Date().toISOString(),
      });

      await act(async () => {
        await useMailStore.getState().loadMessage('msg-001');
      });

      expect(mockApi.patch).not.toHaveBeenCalled();
    });
  });

  describe('markAsRead', () => {
    it('should optimistically update message state', async () => {
      const msg = createTestMessage();
      useMailStore.setState({ messages: [msg] });

      mockApi.patch.mockResolvedValueOnce({
        data: {},
        status: 200,
        correlation_id: 'cor-6',
        timestamp: new Date().toISOString(),
      });

      await act(async () => {
        await useMailStore.getState().markAsRead('msg-001', true);
      });

      const updated = useMailStore.getState().messages[0];
      expect(updated.isSeen).toBe(true);
    });
  });

  describe('deleteMessage', () => {
    it('should remove message from list', async () => {
      const msg = createTestMessage();
      useMailStore.setState({
        messages: [msg],
        selectedMessage: msg,
      });

      mockApi.delete.mockResolvedValueOnce({
        data: {},
        status: 200,
        correlation_id: 'cor-7',
        timestamp: new Date().toISOString(),
      });

      await act(async () => {
        await useMailStore.getState().deleteMessage('msg-001');
      });

      expect(useMailStore.getState().messages).toHaveLength(0);
      expect(useMailStore.getState().selectedMessage).toBeNull();
    });

    it('should not clear selectedMessage if different message', async () => {
      const msg1 = createTestMessage();
      const msg2 = createTestMessage({ id: 'msg-002' });
      useMailStore.setState({
        messages: [msg1, msg2],
        selectedMessage: msg2,
      });

      mockApi.delete.mockResolvedValueOnce({
        data: {},
        status: 200,
        correlation_id: 'cor-8',
        timestamp: new Date().toISOString(),
      });

      await act(async () => {
        await useMailStore.getState().deleteMessage('msg-001');
      });

      expect(useMailStore.getState().selectedMessage?.id).toBe('msg-002');
    });
  });

  describe('composeMessage', () => {
    it('should update compose draft', () => {
      act(() => {
        useMailStore.getState().composeMessage({
          subject: 'Test',
          to: [{ name: 'User', email: 'user@test.com' }],
        });
      });

      expect(useMailStore.getState().composeDraft.subject).toBe('Test');
      expect(useMailStore.getState().composeDraft.to).toHaveLength(1);
    });
  });

  describe('setMailbox', () => {
    it('should switch mailbox and reload', async () => {
      mockApi.get.mockResolvedValueOnce({
        data: {
          items: [],
          queryId: 'q3',
          newPosition: null,
        },
        status: 200,
        correlation_id: 'cor-9',
        timestamp: new Date().toISOString(),
      });

      await act(async () => {
        useMailStore.getState().setMailbox('$trash');
      });

      expect(useMailStore.getState().selectedMailbox).toBe('$trash');
    });
  });

  describe('searchMessages', () => {
    it('should search and update messages', async () => {
      const results = [createTestMessage({ subject: 'Search result' })];
      mockApi.get.mockResolvedValueOnce({
        data: {
          items: results,
          queryId: 'q4',
          newPosition: 'cursor-2',
        },
        status: 200,
        correlation_id: 'cor-10',
        timestamp: new Date().toISOString(),
      });

      await act(async () => {
        await useMailStore.getState().searchMessages('test query');
      });

      expect(useMailStore.getState().messages).toHaveLength(1);
      expect(useMailStore.getState().searchQuery).toBe('test query');
    });
  });

  describe('refreshInbox', () => {
    it('should reload current mailbox', async () => {
      mockApi.get.mockResolvedValueOnce({
        data: {
          items: [createTestMessage()],
          queryId: 'q5',
          newPosition: null,
        },
        status: 200,
        correlation_id: 'cor-11',
        timestamp: new Date().toISOString(),
      });

      useMailStore.setState({ selectedMailbox: '$inbox' });

      await act(async () => {
        await useMailStore.getState().refreshInbox();
      });

      expect(useMailStore.getState().messages).toHaveLength(1);
    });
  });

  describe('loadMore', () => {
    it('should append messages to existing list', async () => {
      const existing = [createTestMessage()];
      const newMsgs = [createTestMessage({ id: 'msg-002' })];

      useMailStore.setState({
        messages: existing,
        cursor: 'cursor-1',
        hasMore: true,
        selectedMailbox: '$inbox',
      });

      mockApi.get.mockResolvedValueOnce({
        data: {
          items: newMsgs,
          queryId: 'q6',
          newPosition: 'cursor-2',
        },
        status: 200,
        correlation_id: 'cor-12',
        timestamp: new Date().toISOString(),
      });

      await act(async () => {
        await useMailStore.getState().loadMore();
      });

      expect(useMailStore.getState().messages).toHaveLength(2);
    });

    it('should not load more when loading or no more', async () => {
      useMailStore.setState({
        isLoading: true,
        hasMore: false,
        cursor: null,
      });

      await act(async () => {
        await useMailStore.getState().loadMore();
      });

      expect(mockApi.get).not.toHaveBeenCalled();
    });
  });
});