// ============================================================================
// Crux-Webmail Frontend — Mail Store (Zustand)
// Manages messages, mailboxes, compose state, and E2E encryption.
//
// Habla con el backend REST real montado en /api/email/* (email.controller →
// MailService → ImapAdapter/SmtpAdapter). El backend identifica los correos
// por uid + folder, así que aquí codificamos `id = folder:uid` y traducimos
// los alias de bandeja ($inbox, $sent, …) a carpetas IMAP reales.
// ============================================================================

import { create } from 'zustand';
import type {
  EmailMessage,
  Mailbox,
  ComposePayload,
  EmailAddress,
} from '../types';
import { api } from '../api/client';

// ------------------------------------------------------------------
// Shapes del backend (/api/email) — responses envueltas en { data }
// ------------------------------------------------------------------
interface BackendAddress {
  address: string;
  name?: string;
}

interface BackendEnvelope {
  uid: number;
  subject: string;
  from: BackendAddress[];
  to: BackendAddress[];
  date: string;
  flags: string[];
  hasAttachments: boolean;
  snippet?: string;
  size?: number;
}

interface BackendDetail extends BackendEnvelope {
  text: string;
  html: string;
  cc: BackendAddress[];
}

interface BackendPaginated {
  items: BackendEnvelope[];
  total: number;
  nextCursor: string | null;
  prevCursor: string | null;
  hasNext: boolean;
  hasPrev: boolean;
}

interface BackendFolder {
  name: string;
  delimiter: string;
  flags: string[];
  specialUse?: string;
  messages?: number;
  unseen?: number;
}

// ------------------------------------------------------------------
// Helpers de traducción front ↔ backend
// ------------------------------------------------------------------
const FOLDER_BY_ALIAS: Record<string, string> = {
  $inbox: 'INBOX',
  $sent: 'Sent',
  $drafts: 'Drafts',
  $trash: 'Trash',
  $junk: 'Junk',
  $archive: 'Archive',
};

/** Traduce un alias de bandeja ($inbox) a su carpeta IMAP real (INBOX). */
function resolveFolder(mailbox: string): string {
  return FOLDER_BY_ALIAS[mailbox] ?? mailbox;
}

/** Comprueba un flag IMAP ignorando el backslash inicial y mayúsculas. */
function hasFlag(flags: string[] | undefined, name: string): boolean {
  return (flags ?? []).some(
    (f) => f.replace(/^\\/, '').toLowerCase() === name.toLowerCase()
  );
}

/** Codifica el identificador estable que usa la UI a partir de folder + uid. */
function encodeId(folder: string, uid: number): string {
  return `${folder}:${uid}`;
}

/** Decodifica `folder:uid`. El uid es siempre el segmento tras el último ':'. */
function decodeId(id: string): { folder: string; uid: number } {
  const idx = id.lastIndexOf(':');
  if (idx === -1) return { folder: 'INBOX', uid: Number(id) || 0 };
  return { folder: id.slice(0, idx), uid: Number(id.slice(idx + 1)) || 0 };
}

function mapAddresses(addrs: BackendAddress[] | undefined): EmailAddress[] {
  return (addrs ?? []).map((a) => ({ name: a.name || '', email: a.address }));
}

function envelopeToMessage(env: BackendEnvelope, folder: string): EmailMessage {
  return {
    id: encodeId(folder, env.uid),
    listIds: [],
    mailboxId: folder,
    subject: env.subject || '',
    from: mapAddresses(env.from),
    to: mapAddresses(env.to),
    date: env.date,
    previewText: env.snippet || '',
    size: env.size || 0,
    isSeen: hasFlag(env.flags, 'Seen'),
    isFlagged: hasFlag(env.flags, 'Flagged'),
    isDraft: hasFlag(env.flags, 'Draft'),
    hasAttachments: !!env.hasAttachments,
    isEncrypted: false,
    isSigned: false,
  };
}

function detailToMessage(d: BackendDetail, folder: string): EmailMessage {
  const base = envelopeToMessage(d, folder);
  return {
    ...base,
    cc: mapAddresses(d.cc),
    // La vista de mensaje renderiza el cuerpo (sanitizado) desde previewText.
    previewText: d.html || d.text || base.previewText,
  };
}

function mapFolderRole(specialUse?: string): string | undefined {
  if (!specialUse) return undefined;
  const map: Record<string, string> = {
    '\\Inbox': 'inbox',
    '\\Sent': 'sent',
    '\\Drafts': 'drafts',
    '\\Trash': 'trash',
    '\\Junk': 'spam',
    '\\Archive': 'archive',
  };
  return map[specialUse] ?? specialUse.replace(/^\\/, '').toLowerCase();
}

function folderToMailbox(f: BackendFolder): Mailbox {
  return {
    id: f.name,
    name: f.name,
    role: mapFolderRole(f.specialUse),
    subscriptionEnabled: true,
    totalMessages: f.messages,
    unseenMessages: f.unseen,
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

const EMPTY_DRAFT: ComposePayload = {
  to: [],
  cc: [],
  bcc: [],
  subject: '',
  body_html: '',
  body_text: '',
  encrypt: false,
  sign: true,
};

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
  composeDraft: { ...EMPTY_DRAFT },
  searchQuery: '',

  // ------------------------------------------------------------------
  // Load Inbox
  // ------------------------------------------------------------------
  loadInbox: async (mailboxId?: string) => {
    const mailbox = mailboxId ?? get().selectedMailbox ?? '$inbox';
    const folder = resolveFolder(mailbox);
    set({ isLoading: true, messages: [], selectedMailbox: mailbox });

    try {
      const qs = new URLSearchParams({ folder, limit: '50' });
      const response = await api.get<BackendPaginated>(`/api/email/search?${qs}`);
      const data = response.data;

      set({
        messages: (data?.items ?? []).map((e) => envelopeToMessage(e, folder)),
        cursor: data?.nextCursor ?? null,
        hasMore: !!data?.hasNext,
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
    const { cursor, selectedMailbox, isLoading, hasMore } = get();
    if (!cursor || isLoading || !hasMore) return;

    const folder = resolveFolder(selectedMailbox);
    set({ isLoading: true });

    try {
      const qs = new URLSearchParams({ folder, limit: '25', cursor });
      const response = await api.get<BackendPaginated>(`/api/email/search?${qs}`);
      const data = response.data;

      set({
        messages: [
          ...get().messages,
          ...(data?.items ?? []).map((e) => envelopeToMessage(e, folder)),
        ],
        cursor: data?.nextCursor ?? null,
        hasMore: !!data?.hasNext,
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
    const { folder, uid } = decodeId(messageId);
    set({ isLoading: true });

    try {
      const qs = new URLSearchParams({ folder });
      const response = await api.get<BackendDetail>(`/api/email/${uid}?${qs}`);
      const data = response.data;

      if (!data) {
        set({ isLoading: false });
        return;
      }

      const message = detailToMessage(data, folder);
      set({ selectedMessage: message, isLoading: false });

      // Auto-mark as read
      if (!message.isSeen) {
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
      const response = await api.get<BackendFolder[]>('/api/email/folders');
      set({ mailboxes: (response.data ?? []).map(folderToMailbox) });
    } catch (err) {
      console.error('[Mail] Failed to load mailboxes:', err);
    }
  },

  // ------------------------------------------------------------------
  // Mark as Read / Unread (SEEN flag)
  // ------------------------------------------------------------------
  markAsRead: async (messageId: string, seen: boolean) => {
    const { folder, uid } = decodeId(messageId);

    try {
      await api.post('/api/email/flag', {
        uid,
        folder,
        flag: seen ? 'SEEN' : 'UNSEEN',
      });

      // Optimistic update
      const current = get().selectedMessage;
      set({
        messages: get().messages.map((m) =>
          m.id === messageId ? { ...m, isSeen: seen } : m
        ),
        selectedMessage:
          current && current.id === messageId
            ? { ...current, isSeen: seen }
            : current,
      });
    } catch (err) {
      console.error('[Mail] Failed to mark as read:', err);
    }
  },

  // ------------------------------------------------------------------
  // Delete Message
  // ------------------------------------------------------------------
  deleteMessage: async (messageId: string) => {
    const { folder, uid } = decodeId(messageId);

    try {
      await api.delete(`/api/email/${uid}`, {
        body: JSON.stringify({ folder }),
      });

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
    const text = composeDraft.body_text || stripHtml(composeDraft.body_html || '');

    try {
      const response = await api.post<{ jobId: string; status: string }>(
        '/api/email/send',
        {
          to: composeDraft.to.map((a) => a.email),
          cc: composeDraft.cc?.length ? composeDraft.cc.map((a) => a.email) : undefined,
          bcc: composeDraft.bcc?.length
            ? composeDraft.bcc.map((a) => a.email)
            : undefined,
          subject: composeDraft.subject,
          text,
          html: composeDraft.body_html || undefined,
        }
      );

      // Clear draft
      set({ composeDraft: { ...EMPTY_DRAFT } });

      return response.data?.jobId ?? '';
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
    const folder = resolveFolder(get().selectedMailbox);
    set({ isLoading: true });

    try {
      const qs = new URLSearchParams({ folder, subject: query, limit: '50' });
      const response = await api.get<BackendPaginated>(`/api/email/search?${qs}`);
      const data = response.data;

      set({
        messages: (data?.items ?? []).map((e) => envelopeToMessage(e, folder)),
        cursor: data?.nextCursor ?? null,
        hasMore: !!data?.hasNext,
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
