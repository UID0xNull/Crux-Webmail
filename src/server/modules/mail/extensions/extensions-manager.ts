// ============================================================================
// Crux-Webmail — IMAP Extensions Manager
// ============================================================================
// Detección de capabilities del servidor, registro de extensiones,
// y fallbacks seguros ante servidores que no soportan features opcionales.
// ============================================================================

import { auditLogger } from '../../utils/audit-logger';

// ------------------------------------------------------------------
// Capability constants
// ------------------------------------------------------------------
export const IMAP_CAPABILITIES = {
  IDLE: 'IDLE',
  UIDPLUS: 'UIDPLUS',
  CONDSTORE: 'CONDSTORE',
  QRESYNC: 'QRESYNC',
  SPECIAL_USE: 'SPECIAL-USE',
  XLIST: 'XLIST',
  UNSELECT: 'UNSELECT',
  BINARY: 'BINARY',
  MOVE: 'MOVE',
  COMPRESS: 'COMPRESS',
  SORT: 'SORT',
  THREAD: 'THREAD',
  ESEARCH: 'ESearch',
  CONTEXT: 'CONTEXT=SEARCH',
} as const;

export type ImapCapability = typeof IMAP_CAPABILITIES[keyof typeof IMAP_CAPABILITIES];

// ------------------------------------------------------------------
// Extension support levels
// ------------------------------------------------------------------
export enum ExtensionLevel {
  FULL = 'full',
  PARTIAL = 'partial',
  NONE = 'none',
}

// ------------------------------------------------------------------
// Extension info
// ------------------------------------------------------------------
export interface ExtensionInfo {
  name: ImapCapability;
  supported: boolean;
  level: ExtensionLevel;
  fallback?: string;
}

// ------------------------------------------------------------------
// Server capabilities profile
// ------------------------------------------------------------------
export interface ServerProfile {
  capabilities: string[];
  extensions: Record<string, ExtensionInfo>;
  supportsIdle: boolean;
  supportsCondStore: boolean;
  supportsUidPlus: boolean;
  supportsMove: boolean;
  supportsSpecialUse: boolean;
  serverType: DetectedServerType;
}

export type DetectedServerType =
  | 'dovecot'
  | 'cyrus'
  | 'microsoft_exchange'
  | 'outlook'
  | 'gmail'
  | 'apple'
  | 'courier'
  | 'unknown';

// ------------------------------------------------------------------
// Extensions Manager
// ------------------------------------------------------------------
export class ImapExtensionsManager {
  private profiles: Map<string, ServerProfile> = new Map();

  // ----------------------------------------------------------------
  // Detect server profile from capabilities
  // ----------------------------------------------------------------
  analyze(capabilities: string[], accountId: string): ServerProfile {
    const existing = this.profiles.get(accountId);
    if (existing) return existing;

    const upperCaps = capabilities.map((c: string) => c.toUpperCase());

    const supports = (cap: string): boolean =>
      upperCaps.some((c: string) => c.includes(cap.toUpperCase()));

    const serverType = this.detectServerType(capabilities, upperCaps);

    const profile: ServerProfile = {
      capabilities,
      extensions: {},
      supportsIdle: supports(IMAP_CAPABILITIES.IDLE),
      supportsCondStore: supports(IMAP_CAPABILITIES.CONDSTORE),
      supportsUidPlus: supports(IMAP_CAPABILITIES.UIDPLUS),
      supportsMove: supports(IMAP_CAPABILITIES.MOVE),
      supportsSpecialUse: supports(IMAP_CAPABILITIES.SPECIAL_USE) || supports(IMAP_CAPABILITIES.XLIST),
      serverType,
    };

    const allExtensions = Object.values(IMAP_CAPABILITIES);
    for (const cap of allExtensions) {
      const supported = supports(cap);
      profile.extensions[cap] = {
        name: cap,
        supported,
        level: supported ? ExtensionLevel.FULL : ExtensionLevel.NONE,
        fallback: this.getFallback(cap),
      };
    }

    this.profiles.set(accountId, profile);

    auditLogger.info('IMAP server profile analyzed', {
      actor_id: accountId,
      metadata: {
        serverType,
        capabilities: upperCaps.length,
        supportsIdle: profile.supportsIdle,
        supportsCondStore: profile.supportsCondStore,
        supportsUidPlus: profile.supportsUidPlus,
        supportsMove: profile.supportsMove,
      },
    });

    return profile;
  }

  // ----------------------------------------------------------------
  // Check specific extension
  // ----------------------------------------------------------------
  hasExtension(accountId: string, cap: ImapCapability): boolean {
    const profile = this.profiles.get(accountId);
    if (!profile) return false;
    return profile.extensions[cap]?.supported ?? false;
  }

  // ----------------------------------------------------------------
  // Get fallback strategy
  // ----------------------------------------------------------------
  getFallback(capability: ImapCapability): string {
    const fallbacks: Record<string, string> = {
      [IMAP_CAPABILITIES.IDLE]: 'POLLING',
      [IMAP_CAPABILITIES.CONDSTORE]: 'FULL_FETCH',
      [IMAP_CAPABILITIES.UIDPLUS]: 'UID_SEARCH',
      [IMAP_CAPABILITIES.MOVE]: 'COPY_DELETE',
      [IMAP_CAPABILITIES.SPECIAL_USE]: 'NAME_MATCH',
      [IMAP_CAPABILITIES.QRESYNC]: 'REFRESH',
      [IMAP_CAPABILITIES.BINARY]: 'BASE64',
      [IMAP_CAPABILITIES.SORT]: 'CLIENT_SORT',
      [IMAP_CAPABILITIES.THREAD]: 'CLIENT_THREAD',
    };
    return fallbacks[capability] || 'NATIVE_ERROR';
  }

  // ----------------------------------------------------------------
  // Detect server type
  // ----------------------------------------------------------------
  private detectServerType(caps: string[], upperCaps: string[]): DetectedServerType {
    const serverBanner = upperCaps.join(' ');

    if (serverBanner.includes('DOVECOT') || caps.some((x: string) => x.toLowerCase().includes('dovecot')))
      return 'dovecot';
    if (serverBanner.includes('CYRUS') || upperCaps.includes('SASL-IR'))
      return 'cyrus';
    if (upperCaps.some((c) => c.includes('MS-EXCHANGE') || c.includes('EXCHANGE')))
      return 'microsoft_exchange';
    if (upperCaps.some((c) => c.includes('OUTLOOK')))
      return 'outlook';
    if (upperCaps.some((c) => c.includes('GOOGLE')))
      return 'gmail';
    if (upperCaps.some((c) => c.includes('MACOS') || c.includes('SAVENOW')))
      return 'apple';
    if (upperCaps.some((c) => c.includes('COURIER')))
      return 'courier';

    return 'unknown';
  }

  // ----------------------------------------------------------------
  // Access / Lifecycle
  // ----------------------------------------------------------------
  getProfile(accountId: string): ServerProfile | undefined {
    return this.profiles.get(accountId);
  }

  clearCache(): void {
    this.profiles.clear();
  }

  clearAccount(accountId: string): void {
    this.profiles.delete(accountId);
  }
}

// ------------------------------------------------------------------
// Singleton
// ------------------------------------------------------------------
let _extensionsManager: ImapExtensionsManager | null = null;

export function getImapExtensionsManager(): ImapExtensionsManager {
  if (!_extensionsManager) {
    _extensionsManager = new ImapExtensionsManager();
  }
  return _extensionsManager;
}