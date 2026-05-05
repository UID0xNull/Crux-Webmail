import { useCallback, useState, useEffect } from 'react';
import { useApiFetch } from './useAuth';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------
export interface MailMessage {
  id: string;
  from: { name: string; email: string };
  to: { name: string; email: string };
  subject: string;
  date: string;
  flags: string[];
  preview: string;
  size: number;
}

export interface Mailbox {
  id: string;
  name: string;
  role?: string;
  messages: number;
  unseen: number;
}

export interface UseMailState {
  messages: MailMessage[];
  mailboxes: Mailbox[];
  selectedMailbox: string;
  selectedMessage: MailMessage | null;
  isLoading: boolean;
  error: string | null;
}

// ------------------------------------------------------------------
// Hook principal de gestión de correo
// ------------------------------------------------------------------
export function useMail(initialMailbox = 'INBOX'): {
  state: UseMailState;
  loadMessages: (query?: Record<string, string[]>) => Promise<void>;
  selectMessage: (id: string) => Promise<MailMessage | null>;
  selectMailbox: (mailboxId: string) => Promise<void>;
  sendMessage: (data: SendMailRequest) => Promise<void>;
  clearError: () => void;
} {
  const [state, setState] = useState<UseMailState>({
    messages: [],
    mailboxes: [],
    selectedMailbox: initialMailbox,
    selectedMessage: null,
    isLoading: false,
    error: null,
  });

  const apiFetch = useApiFetch();

  // ----------------------------------------------------------------
  // Cargar mailbox list
  // ----------------------------------------------------------------
  const loadMailboxes = useCallback(async () => {
    try {
      const res = await apiFetch('/mail/boxes');
      if (!res.ok) throw new Error('Failed to load mailboxes');
      const data = await res.json();
      setState(prev => ({ ...prev, mailboxes: data.list || [] }));
    } catch (err) {
      setState(prev => ({ ...prev, error: (err as Error).message }));
    }
  }, [apiFetch]);

  // ----------------------------------------------------------------
  // Cargar mensajes
  // ----------------------------------------------------------------
  const loadMessages = useCallback(async (query: Record<string, string[]> = {}) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const res = await apiFetch('/mail/query', {
        method: 'POST',
        body: JSON.stringify({ conditions: query, limit: 50, position: 0 }),
      });
      if (!res.ok) throw new Error('Failed to query messages');
      const data = await res.json();
      setState(prev => ({ ...prev, messages: data.list || [], isLoading: false }));
    } catch (err) {
      setState(prev => ({ ...prev, isLoading: false, error: (err as Error).message }));
    }
  }, [apiFetch]);

  // ----------------------------------------------------------------
  // Leer mensaje individual
  // ----------------------------------------------------------------
  const selectMessage = useCallback(async (id: string): Promise<MailMessage | null> => {
    try {
      const res = await apiFetch('/mail/get', {
        method: 'POST',
        body: JSON.stringify({ ids: [id] }),
      });
      if (!res.ok) throw new Error('Failed to get message');
      const data = await res.json();
      const message = data.list?.[0] ?? null;
      setState(prev => ({ ...prev, selectedMessage: message }));
      return message;
    } catch (err) {
      setState(prev => ({ ...prev, error: (err as Error).message }));
      return null;
    }
  }, [apiFetch]);

  // ----------------------------------------------------------------
  // Cambiar mailbox
  // ----------------------------------------------------------------
  const selectMailbox = useCallback(async (mailboxId: string) => {
    setState(prev => ({
      ...prev,
      selectedMailbox: mailboxId,
      selectedMessage: null,
      messages: [],
    }));
    await loadMessages({ mailbox: [mailboxId] });
  }, [loadMessages]);

  // ----------------------------------------------------------------
  // Enviar correo
  // ----------------------------------------------------------------
  const sendMessage = useCallback(async (data: SendMailRequest) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const res = await apiFetch('/mail/send', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to send message');
      }
      setState(prev => ({ ...prev, isLoading: false }));
    } catch (err) {
      setState(prev => ({ ...prev, isLoading: false, error: (err as Error).message }));
    }
  }, [apiFetch]);

  // ----------------------------------------------------------------
  // Inicialización
  // ----------------------------------------------------------------
  useEffect(() => {
    loadMailboxes();
  }, [loadMailboxes]);

  const clearError = useCallback(() => setState(prev => ({ ...prev, error: null })), []);

  return {
    state,
    loadMessages,
    selectMessage,
    selectMailbox,
    sendMessage,
    clearError,
  };
}

// ------------------------------------------------------------------
// Types para envío
// ------------------------------------------------------------------
export interface SendMailRequest {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html?: string;
}