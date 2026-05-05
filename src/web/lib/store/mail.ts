// ============================================================================
// Crux-Webmail Frontend — Mail Store (Zustand)
// Manages messages, mailboxes, compose state, and E2E encryption
// ============================================================================

import { create } from 'zustand';
import type {
  EmailMessage,
  Mailbox,
  ComposePayload,
  PaginatedResponse,
} from '../types';
import { api } from '../api/client';

interface MailStore {
  // State
  messages: EmailMessage[];
  mailboxes: Mailbox[];
  selectedMessage: EmailMessage | null;
  selectedMailbox: string;
  isLoading: boolean;
  hasMore: boolean;
  cursor: string | null;
  composeDraft: ComposePayload;
  searchQuery: string;

  // Actions
  loadInbox: (mailboxId?: string) => Promise<void>;
  loadMore: () => Promise<void>;
  loadMessage: (messageId: string) => Promise<void>;
  loadMailboxes: () => Promise<void>;
  markAsRead: (messageId: string, seen: boolean) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  composeMessage: (draft: Partial<ComposePayload>) => void;
  sendMessage: () => Promise<string>;
  setMailbox: (mailboxId: string) => void;
  setSearch: (query: string) => void;
  searchMessages: (query: string) => Promise<void>;
  refreshInbox: () => Promise<void>;
}

export const useMailStore = create<MailStore>()((set, get) => ({
  // ------------------------------------------------------------------
  // Initial State
  // ------------------------------------------------------------------
  messages: [],
  mailboxes: [],
  selectedMessage: null,
  selectedMailbox: '$inbox',
  isLoading: false,
  hasMore: true,
  cursor: null,
  composeDraft: {
    to: [],
    cc: [],
    bcc: [],
    subject: '',
    body_html: '',
    body_text: '',
    encrypt: false,
    sign: true,
  },
  searchQuery: '',

  // ------------------------------------------------------------------
  // Load Inbox
  // ------------------------------------------------------------------
  loadInbox: async (mailboxId?: string) => {
    const targetMailbox = mailboxId ?? '$inbox';
    set({ isLoading: true, messages: [] });

    try {
      const response = await api.get<PaginatedResponse<EmailMessage>>(
        `/api/mail/list/${targetMailbox}?count=50&sort=date-desc`
      );

      set({
        messages: response.data.items || [],
        cursor: response.data.newPosition,
        hasMore: response.data.newPosition !== null,
        selectedMailbox: targetMailbox,
        isLoading: false,
      });
    } catch (err) {
      console.error('[Mail] Failed to load inbox:', err);
      set({ isLoading: false });
    }
  },

  // ------------------------------------------------------------------
  // Load More (pagination)
  // ------------------------------------------------------------------
  loadMore: async () => {
    const { cursor, selectedMailbox } = get();
    if (!cursor || !cursor || get().isLoading || !get().hasMore) return;

    set({ isLoading: true });

    try {
      const response = await api.get<PaginatedResponse<EmailMessage>>(
        `/api/mail/list/${selectedMailbox}?count=25&position=${encodeURIComponent(cursor)}`
      );

      set({
        messages: [...get().messages, ...(response.data.items || [])],
        cursor: response.data.newPosition,
        hasMore: response.data.newPosition !== null,
        isLoading: false,
      });
    } catch (err) {
      console.error('[Mail] Failed to load more:', err);
      set({ isLoading: false });
    }
  },

  // ------------------------------------------------------------------
  // Load Single Message (with bodies)
  // ------------------------------------------------------------------
  loadMessage: async (messageId: string) => {
    set({ isLoading: true });

    try {
      const response = await api.get<EmailMessage>(
        `/api/mail/message/${messageId}?include-bodies=true&include-attachments=true`
      );

      set({
        selectedMessage: response.data,
        isLoading: false,
      });

      // Auto-mark as read
      if (!response.data.isSeen) {
        get().markAsRead(messageId, true);
      }
    } catch (err) {
      console.error('[Mail] Failed to load message:', err);
      set({ isLoading: false });
    }
  },

  // ------------------------------------------------------------------
  // Load Mailboxes
  // ------------------------------------------------------------------
  loadMailboxes: async () => {
    try {
      const response = await api.get<Mailbox[]>('/api/mail/mailboxes');
      set({ mailboxes: response.data });
    } catch (err) {
      console.error('[Mail] Failed to load mailboxes:', err);
    }
  },

  // ------------------------------------------------------------------
  // Mark as Read
  // ------------------------------------------------------------------
  markAsRead: async (messageId: string, seen: boolean) => {
    try {
      await api.patch(`/api/mail/message/${messageId}`, {
        isSeen: seen,
      });

      // Optimistic update
      set({
        messages: get().messages.map((m) =>
          m.id === messageId ? { ...m, isSeen: seen } : m
        ),
      });
    } catch (err) {
      console.error('[Mail] Failed to mark as read:', err);
    }
  },

  // ------------------------------------------------------------------
  // Delete Message
  // ------------------------------------------------------------------
  deleteMessage: async (messageId: string) => {
    try {
      await api.delete(`/api/mail/message/${messageId}`);

      set({
        messages: get().messages.filter((m) => m.id !== messageId),
        selectedMessage:
          get().selectedMessage?.id === messageId ? null : get().selectedMessage,
      });
    } catch (err) {
      console.error('[Mail] Failed to delete message:', err);
    }
  },

  // ------------------------------------------------------------------
  // Compose
  // ------------------------------------------------------------------
  composeMessage: (draft: Partial<ComposePayload>) => {
    set({
      composeDraft: { ...get().composeDraft, ...draft },
    });
  },

  sendMessage: async (): Promise<string> => {
    const { composeDraft } = get();

    try {
      const response = await api.post<{ message_id: string }>('/api/mail/send', {
        ...composeDraft,
        body_text: composeDraft.body_html
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&/g, '&')
          .replace(/</g, '<')
          .replace(/>/g, '>'),
      });

      // Clear draft
      set({
        composeDraft: {
          to: [],
          cc: [],
          bcc: [],
          subject: '',
          body_html: '',
          body_text: '',
          encrypt: false,
          sign: true,
        },
      });

      return response.data.message_id;
    } catch (err) {
      console.error('[Mail] Failed to send message:', err);
      throw err;
    }
  },

  // ------------------------------------------------------------------
  // Set Mailbox
  // ------------------------------------------------------------------
  setMailbox: (mailboxId: string) => {
    set({ selectedMailbox: mailboxId });
    get().loadInbox(mailboxId);
  },

  // ------------------------------------------------------------------
  // Search
  // ------------------------------------------------------------------
  setSearch: (query: string) => {
    set({ searchQuery: query });
  },

  searchMessages: async (query: string) => {
    set({ isLoading: true });

    try {
      const response = await api.get<PaginatedResponse<EmailMessage>>(
        `/api/mail/search?q=${encodeURIComponent(query)}&count=50`
      );

      set({
        messages: response.data.items || [],
        cursor: response.data.newPosition,
        hasMore: response.data.newPosition !== null,
        isLoading: false,
        searchQuery: query,
      });
    } catch (err) {
      console.error('[Mail] Failed to search:', err);
      set({ isLoading: false });
    }
  },

  // ------------------------------------------------------------------
  // Refresh
  // ------------------------------------------------------------------
  refreshInbox: async () => {
    await get().loadInbox(get().selectedMailbox);
  },
}));
---CODE---