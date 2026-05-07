// ============================================================================
// Crux-Webmail — MIME Module: Normalized Types
// ============================================================================
// Definiciones compartidas entre parser, sanitizer, validator y pipeline.
// Desacoplan cada componente para máxima testabilidad e inyección de dependencias.
// ============================================================================

// ------------------------------------------------------------------
// Attachment metadata post-processing
// ------------------------------------------------------------------
export interface ParsedAttachment {
  filename: string;
  mimeType: string;
  size: number;
  content: Buffer;
  contentId?: string;
  disposition: 'attachment' | 'inline';
  // Security metadata
  securityStatus: AttachmentSecurityStatus;
  virusScanStatus: VirusScanStatus;
  validatedAt: string;
}

export type AttachmentSecurityStatus =
  | 'pending'       // aún no fue procesado
  | 'validating'    // en proceso de validación
  | 'clean'         // validado y sin amenazas
  | 'quarantined'   // falló validación o escaneo
  | 'error';        // fallo interno

export type VirusScanStatus =
  | 'pending'
  | 'scanning'
  | 'clean'
  | 'infected'
  | 'skipped';     // omitido por tamaño o policy

// ------------------------------------------------------------------
// Body part extracted from MIME
// ------------------------------------------------------------------
export interface MimeBodyPart {
  type: 'text' | 'html';
  contentType: string;
  content: string;           // contenido decodificado crudo
  sanitizedContent: string;  // contenido post-sanitización
  charset: string;
}

// ------------------------------------------------------------------
// MimeHeaders — estructura normalizada de cabeceras
// ------------------------------------------------------------------
export interface MimeHeaders {
  from: MimeAddress[];
  to: MimeAddress[];
  cc: MimeAddress[];
  bcc: MimeAddress[];
  subject: string;
  date: string;
  messageId: string;
  inReplyTo?: string;
  references?: string[];
  replyTo?: MimeAddress[];
  headers: Record<string, string[]>;
  rawHeaders: string;       // cabecera RFC822 completa (para debugging)
}

// ------------------------------------------------------------------
// Address
// ------------------------------------------------------------------
export interface MimeAddress {
  name: string;
  address: string;
}

// ------------------------------------------------------------------
// Resultado completo del pipeline MIME
// ------------------------------------------------------------------
export interface ParsedEmail {
  // Identificación
  uid: string;
  messageId: string;

  // Cabeceras normalizadas
  headers: MimeHeaders;

  // Cuerpo procesado
  bodyText: string;
  bodyHtml: string;          // HTML sanitizado
  bodyPreview: string;      // extracto sin formato

  // Adjuntos procesados
  attachments: ParsedAttachment[];

  // Metadata de seguridad
  security: {
    xssThreatsFound: number;
    sanitizedElements: string[];  // tipos de elementos removidos
    clamavScanComplete: boolean;
    attachmentsQuarantined: number;
    overallRisk: 'low' | 'medium' | 'high' | 'critical';
  };

  // Timestamps
  parsedAt: string;
  processingDurationMs: number;
}

// ------------------------------------------------------------------
// Configuración del pipeline MIME
// ------------------------------------------------------------------
export interface MimePipelineConfig {
  // Parsing
  maxMessageSize: number;        // bytes — default 50MB
  maxAttachmentSize: number;     // bytes — default 25MB
  maxAttachments: number;        // count — default 50
  supportedCharsets: string[];

  // Sanitización HTML
  sanitizeHtml: boolean;
  allowImages: boolean;
  allowCss: boolean;
  allowLinks: boolean;
  allowedDomains: string[];      // [] = allow all
  allowedProtocols: string[];    // default: ['http:', 'https:', 'mailto:']

  // Validación de adjuntos
  blockExecutables: boolean;
  allowedMimeTypes: string[];    // [] = allow all
  blockDangerous: boolean;      // .exe, .bat, .js, etc.
  unzipNestedLimit: number;     // max depth for zip extraction — default 3
  maxUnzipTotalSize: number;    // protection against zip bombs

  // ClamAV / Antivirus
  clamavEnabled: boolean;
  clamavHost: string;
  clamavPort: number;
  clamavTimeout: number;
  scanSmallFiles: boolean;      // escanear archivos < X bytes
  minScanSize: number;
}

// ------------------------------------------------------------------
// Default config
// ------------------------------------------------------------------
export const DEFAULT_MIME_CONFIG: MimePipelineConfig = {
  maxMessageSize: 50 * 1024 * 1024,
  maxAttachmentSize: 25 * 1024 * 1024,
  maxAttachments: 50,
  supportedCharsets: ['utf-8', 'iso-8859-1', 'windows-1252', 'us-ascii'],

  sanitizeHtml: true,
  allowImages: true,
  allowCss: true,
  allowLinks: true,
  allowedDomains: [],
  allowedProtocols: ['http:', 'https:', 'mailto:', 'data:'],

  blockExecutables: true,
  allowedMimeTypes: [],
  blockDangerous: true,
  unzipNestedLimit: 3,
  maxUnzipTotalSize: 200 * 1024 * 1024,

  clamavEnabled: false,
  clamavHost: 'localhost',
  clamavPort: 3310,
  clamavTimeout: 15000,
  scanSmallFiles: false,
  minScanSize: 10240,
};

// ------------------------------------------------------------------
// Extensiones de archivo bloqueadas por defecto
// ------------------------------------------------------------------
export const DANGEROUS_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.vbe',
  '.js', '.jse', '.wsf', '.wsh', '.msi', '.dll', '.cpl', '.inf',
  '.reg', '.hta', '.lnk', '.scf', '.shb', '.shbt', '.isp', '.cab',
  '.msc', '.eml', '.msg',
]);

// ------------------------------------------------------------------
// Tipos peligrosos de MIME por defecto
// ------------------------------------------------------------------
export const DANGEROUS_MIME_PATTERNS = [
  'application/x-msdownload',
  'application/x-bat',
  'application/x-executable',
  'application/javascript',
  'application/x-javascript',
  'application/vnd.ms-htmlhelp',
];

// ------------------------------------------------------------------
// Events for streaming results
// ------------------------------------------------------------------
export interface MimePipelineEvents {
  parsing: { uid: string };
  sanitizing: { uid: string };
  validating: { uid: string; attachmentCount: number };
  scanning: { uid: string; attachmentId: string };
  scanned: { uid: string; attachmentId: string; status: VirusScanStatus };
  complete: { uid: string; parsed: ParsedEmail };
  error: { uid: string; error: Error };
}