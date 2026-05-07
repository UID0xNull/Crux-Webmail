// ============================================================================
// Crux-Webmail — Mail Contracts: Interfaces SMTP
// ============================================================================
// Contrato para abstracción SMTP. Desacopla envío de email del transportador.
// ============================================================================

import type {
  ICreateMessageInput,
  ISendResult,
  IAccountConfig,
} from './types';

export interface ISmtpAdapter {
  // --- Lifecycle ---
  connect(config: IAccountConfig): Promise<void>;
  disconnect(): Promise<void>;
  isReady(): boolean;

  // --- Send ---
  send(config: IAccountConfig, message: ICreateMessageInput): Promise<ISendResult>;

  // --- Verify ---
  verify(config: IAccountConfig): Promise<boolean>;
}