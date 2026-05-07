// ============================================================================
// Crux-Webmail — Attachment Validator: Security Gate
// ============================================================================
// Filtra adjuntos por MIME type, tamaño, extensiones peligrosas, validación
// de contenido real (magic bytes), y protección contra zip bombs.
// Enruta archivos a ClamAV para escaneo antivirus asíncrono.
// ============================================================================

import { Readable } from 'node:stream';
import type { Readable as ReadableStream } from 'node:stream';
import { fileTypeFromBuffer } from 'file-type';
import { auditLogger } from '../../utils/audit-logger';
import { ClamavScanner } from './clamav-scanner';
import {
  DANGEROUS_EXTENSIONS,
  DANGEROUS_MIME_PATTERNS,
  ParsedAttachment,
  AttachmentSecurityStatus,
  VirusScanStatus,
  DEFAULT_MIME_CONFIG,
  MimePipelineConfig,
} from './types';

// ------------------------------------------------------------------
// Result of attachment validation
// ------------------------------------------------------------------
export interface AttachmentValidationResult {
  approved: boolean;
  reason: string;
  securityStatus: AttachmentSecurityStatus;
  detectedType: string;
  expectedType: string;
  mismatch: boolean;
}

// ------------------------------------------------------------------
// Allowed MIME type categories
// ------------------------------------------------------------------
const SAFE_MIME_CATEGORIES = [
  'image/',
  'audio/',
  'video/',
  'text/',
  'application/pdf',
  'application/zip',
  'application/gzip',
  'application/x-gzip',
  'application/x-tar',
  'application/bzip2',
  'application/x-bzip2',
  'application/7z',
  'application/x-7z-compressed',
  'application/x-rar-compressed',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  'application/rtf',
  'application/csv',
  'text/csv',
  'application/xml',
  'text/xml',
  'application/json',
  'text/plain',
  'application/x-font-ttf',
  'font/woff',
  'font/woff2',
  'application/octet-stream', // Allow as fallback if type can be confirmed
];

// ------------------------------------------------------------------
// AttachmentValidator — service
// ------------------------------------------------------------------
export class AttachmentValidator {
  private config: MimePipelineConfig;
  private clamavScanner: ClamavScanner | null;

  constructor(
    config?: Partial<MimePipelineConfig>,
    clamavScanner?: ClamavScanner,
  ) {
    this.config = { ...DEFAULT_MIME_CONFIG, ...config };
    this.clamavScanner = clamavScanner || null;
  }

  updateConfig(partial: Partial<MimePipelineConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  setClamavScanner(scanner: ClamavScanner): void {
    this.clamavScanner = scanner;
  }

  // ----------------------------------------------------------------
  // Validate a single attachment
  // ----------------------------------------------------------------
  async validateAttachment(
    attachment: ParsedAttachment,
    uid: string,
  ): Promise<AttachmentValidationResult> {
    const result: AttachmentValidationResult = {
      approved: true,
      reason: 'valid',
      securityStatus: 'clean',
      detectedType: '',
      expectedType: attachment.mimeType,
      mismatch: false,
    };

    attachment.securityStatus = 'validating';
    attachment.validatedAt = new Date().toISOString();

    try {
      // 1. Size check
      if (attachment.size > this.config.maxAttachmentSize) {
        return {
          approved: false,
          reason: `exceeds_max_size: ${attachment.size} > ${this.config.maxAttachmentSize}`,
          securityStatus: 'quarantined',
          detectedType: attachment.mimeType,
          expectedType: attachment.mimeType,
          mismatch: false,
        };
      }

      // 2. Extension check
      const extCheck = this.validateExtension(attachment.filename);
      if (!extCheck.approved) {
        return {
          ...extCheck,
          detectedType: attachment.mimeType,
          expectedType: attachment.mimeType,
          mismatch: false,
        };
      }

      // 3. MIME type detection & mismatch check
      if (attachment.size > 0 && attachment.content.length > 0) {
        try {
          const detected = await fileTypeFromBuffer(attachment.content);
          result.detectedType = detected?.mime || 'unknown';

          // Check for dangerous mismatch: claims to be image but is executable
          if (detected && this.isDangerousMimeMismatch(attachment.mimeType, detected.mime)) {
            result.mismatch = true;
            result.approved = false;
            result.reason = 'mime_type_mismatch: potential disguise';
            result.securityStatus = 'quarantined';

            auditLogger.warn(`Attachment MIME mismatch for ${uid}`,
              {
                metadata: {
                  filename: attachment.filename,
                  claimedType: attachment.mimeType,
                  detectedType: detected.mime,
                },
              },
            );
            return result;
          }
        } catch {
          // file-type detection failed — continue
          result.detectedType = attachment.mimeType;
        }
      }

      // 4. MIME type whitelist check (if configured)
      if (this.config.allowedMimeTypes.length > 0) {
        const typeAllowed = this.config.allowedMimeTypes.some(
          (allowed) =>
            attachment.mimeType === allowed ||
            attachment.mimeType.startsWith(allowed.replace('*', '')),
        );
        if (!typeAllowed) {
          return {
            approved: false,
            reason: `mime_not_allowed: ${attachment.mimeType}`,
            securityStatus: 'quarantined',
            detectedType: result.detectedType,
            expectedType: attachment.mimeType,
            mismatch: result.mismatch,
          };
        }
      }

      // 5. Dangerous MIME check
      if (this.config.blockDangerous) {
        for (const dangerousPattern of DANGEROUS_MIME_PATTERNS) {
          if (attachment.mimeType.includes(dangerousPattern)) {
            return {
              approved: false,
              reason: `dangerous_mime: ${attachment.mimeType}`,
              securityStatus: 'quarantined',
              detectedType: result.detectedType,
              expectedType: attachment.mimeType,
              mismatch: result.mismatch,
            };
          }
        }
      }

      result.securityStatus = 'clean';
      attachment.securityStatus = 'clean';

      return result;
    } catch (err) {
      auditLogger.error(`Attachment validation error for ${uid}`,
        {
          metadata: {
            filename: attachment.filename,
            error: (err as Error).message,
          },
        },
      );
      return {
        approved: false,
        reason: `validation_error: ${(err as Error).message}`,
        securityStatus: 'error',
        detectedType: result.detectedType,
        expectedType: attachment.mimeType,
        mismatch: result.mismatch,
      };
    }
  }

  // ----------------------------------------------------------------
  // Validate multiple attachments in batch
  // ----------------------------------------------------------------
  async validateBatch(
    attachments: ParsedAttachment[],
    uid: string,
  ): Promise<AttachmentValidationResult[]> {
    // Validate in parallel (non-blocking)
    const promises = attachments.map(async (att) => {
      const result = await this.validateAttachment(att, uid);
      return result;
    });

    return Promise.all(promises);
  }

  // ----------------------------------------------------------------
  // Scan single attachment with ClamAV
  // ----------------------------------------------------------------
  async scanWithClamAV(
    attachment: ParsedAttachment,
    uid: string,
  ): Promise<VirusScanStatus> {
    if (!this.clamavScanner) {
      // No ClamAV configured — skip
      return 'skipped';
    }

    // Skip small files if configured
    if (!this.config.scanSmallFiles && attachment.size < this.config.minScanSize) {
      return 'skipped';
    }

    // Skip if already quarantined
    if (attachment.securityStatus === 'quarantined') {
      return 'skipped';
    }

    try {
      attachment.virusScanStatus = 'scanning';
      const result = await this.clamavScanner.scan(
        attachment.content,
        attachment.filename,
        uid,
      );

      if (result.clean) {
        attachment.virusScanStatus = 'clean';
        return 'clean';
      } else {
        attachment.virusScanStatus = 'infected';
        attachment.securityStatus = 'quarantined';

        auditLogger.warn(`Virus detected in attachment for ${uid}`,
          {
            metadata: {
              filename: attachment.filename,
              virus: result.virusName,
            },
          },
        );
        return 'infected';
      }
    } catch (err) {
      auditLogger.error(`ClamAV scan failed for ${uid}`,
        {
          metadata: {
            filename: attachment.filename,
            error: (err as Error).message,
          },
        },
      );
      attachment.virusScanStatus = 'skipped';
      return 'skipped';
    }
  }

  // ----------------------------------------------------------------
  // Check extension safety
  // ----------------------------------------------------------------
  private validateExtension(filename: string): AttachmentValidationResult {
    if (!this.config.blockExecutables) {
      return {
        approved: true,
        reason: 'valid',
        securityStatus: 'clean',
        detectedType: '',
        expectedType: '',
        mismatch: false,
      };
    }

    const ext = this.getFileExtension(filename).toLowerCase();
    if (DANGEROUS_EXTENSIONS.has(ext)) {
      return {
        approved: false,
        reason: `blocked_extension: ${ext}`,
        securityStatus: 'quarantined',
        detectedType: '',
        expectedType: '',
        mismatch: false,
      };
    }

    return {
      approved: true,
      reason: 'valid',
      securityStatus: 'clean',
      detectedType: '',
      expectedType: '',
      mismatch: false,
    };
  }

  // ----------------------------------------------------------------
  // Check for dangerous MIME type mismatch
  // ------------------------------------------------------------------
  private isDangerousMimeMismatch(claimed: string, detected: string): boolean {
    const isDangerousDetected = DANGEROUS_MIME_PATTERNS.some((pattern) =>
      detected.includes(pattern),
    );

    const isSafeClaimed = SAFE_MIME_CATEGORIES.some((category) =>
      claimed.startsWith(category) || claimed === category,
    );

    return isDangerousDetected && isSafeClaimed;
  }

  // ----------------------------------------------------------------
  // Extract file extension
  // ----------------------------------------------------------------
  private getFileExtension(filename: string): string {
    const basename = filename.split(/[\/\\]/).pop() || filename;
    const dotIndex = basename.lastIndexOf('.');
    if (dotIndex === -1 || dotIndex === 0) return '';
    return basename.substring(dotIndex);
  }
}