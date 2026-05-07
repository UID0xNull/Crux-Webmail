// ============================================================================
// Crux-Webmail — ClamAV Scanner: Antivirus Integration
// ============================================================================
// Comunicación con demonio ClamAV via protocolo de red (port 3310).
// Envía contenido de adjuntos para análisis, recibe resultados.
// Maneja timeouts, reintentos y degradación graceful sin ClamAV.
// ============================================================================

import { Socket } from 'node:net';
import { EventEmitter } from 'node:events';
import { auditLogger } from '../../utils/audit-logger';
import { DEFAULT_MIME_CONFIG, MimePipelineConfig } from './types';

export interface ClamavScanResult {
  clean: boolean;
  virusName?: string;
  scanDurationMs: number;
}

export interface ClamavConfig {
  enabled: boolean;
  host: string;
  port: number;
  timeout: number;
  maxRetries: number;
}

// ------------------------------------------------------------------
// Default ClamAV config
// ------------------------------------------------------------------
const DEFAULT_CLAMAV_CONFIG: ClamavConfig = {
  enabled: false,
  host: 'localhost',
  port: 3310,
  timeout: 15000,
  maxRetries: 2,
};

// ------------------------------------------------------------------
// ClamavScanner — service
// ------------------------------------------------------------------
export class ClamavScanner extends EventEmitter {
  private config: ClamavConfig;
  private pipelineConfig: MimePipelineConfig;
  private connected: boolean = false;
  private connectionAttempts: number = 0;
  private readonly MAX_CONN_ATTEMPTS = 5;

  constructor(
    clamavConfig?: Partial<ClamavConfig>,
    pipelineConfig?: Partial<MimePipelineConfig>,
  ) {
    super();
    this.config = { ...DEFAULT_CLAMAV_CONFIG, ...clamavConfig };
    this.pipelineConfig = { ...DEFAULT_MIME_CONFIG, ...pipelineConfig };
  }

  updateConfig(partial: Partial<ClamavConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  // ----------------------------------------------------------------
  // Scan a buffer
  // ----------------------------------------------------------------
  async scan(content: Buffer, filename: string, uid: string): Promise<ClamavScanResult> {
    if (!this.config.enabled) {
      return { clean: true, scanDurationMs: 0 };
    }

    const startTime = Date.now();

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await this.scanOnce(content, filename, uid);
        return { ...result, scanDurationMs: Date.now() - startTime };
      } catch (err) {
        this.connectionAttempts++;

        auditLogger.warn(`ClamAV scan attempt ${attempt} failed for ${uid}`,
          {
            metadata: {
              filename,
              attempt,
              maxRetries: this.config.maxRetries,
              error: (err as Error).message,
            },
          },
        );

        if (attempt === this.config.maxRetries) {
          // Give up — assume clean (fail-open for availability)
          auditLogger.error(`ClamAV scan failed after ${attempt} attempts, assuming clean for ${uid}`,
            {
              metadata: {
                filename,
                connectionAttempts: this.connectionAttempts,
              },
            },
          );
          return {
            clean: true,
            virusName: undefined,
            scanDurationMs: Date.now() - startTime,
          };
        }

        // Wait before retry
        await this.delay(1000 * attempt);
      }
    }

    return { clean: true, scanDurationMs: Date.now() - startTime };
  }

  // ----------------------------------------------------------------
  // Single scan attempt
  // ----------------------------------------------------------------
  private async scanOnce(content: Buffer, filename: string, uid: string): Promise<ClamavScanResult> {
    return new Promise<ClamavScanResult>((resolve, reject) => {
      const socket = new Socket();
      let resolved = false;

      const handleTimeout = () => {
        if (resolved) return;
        resolved = true;
        socket.destroy();
        reject(new Error(`ClamAV scan timeout after ${this.config.timeout}ms`));
      };

      const timer = setTimeout(handleTimeout, this.config.timeout);

      socket.on('connect', () => {
        this.connected = true;
        this.connectionAttempts = 0;
        // Send content to ClamAV for scanning
        socket.write(content);
        socket.write('\n');
      });

      socket.on('data', (data: Buffer) => {
        const response = data.toString('utf8').trim();

        if (resolved) return;
        resolved = true;
        clearTimeout(timer);

        this.parseScanResponse(response, uid, resolve);
      });

      socket.on('error', (err: Error) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        this.connected = false;
        reject(err);
      });

      socket.on('close', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
        }
        this.connected = false;
      });

      socket.connect(this.config.port, this.config.host);
    });
  }

  // ----------------------------------------------------------------
  // Parse ClamAV response
  // ----------------------------------------------------------------
  private parseScanResponse(
    response: string,
    uid: string,
    resolve: (result: ClamavScanResult) => void,
  ): void {
    const lines = response.split('\n');
    const lastLine = lines[lines.length - 1]?.trim() || '';

    if (lastLine.startsWith('STREAM')) {
      const statusMatch = lastLine.match(/STREAM\s+(OK|ERROR|AGAIN)\s*\(\s*(.*?)\s*\)/);
      if (statusMatch) {
        const status = statusMatch[1];
        const detail = statusMatch[2] || '';

        if (status === 'OK') {
          resolve({ clean: true, scanDurationMs: 0 });
        } else {
          // Infected or error
          resolve({
            clean: false,
            virusName: detail || 'unknown',
            scanDurationMs: 0,
          });

          auditLogger.warn(`ClamAV detected virus: ${detail} for ${uid}`,
            {
              metadata: {
                virusName: detail,
              },
            },
          );
        }
      } else {
        // Try simpler parsing
        if (lastLine.includes('OK')) {
          resolve({ clean: true, scanDurationMs: 0 });
        } else {
          resolve({
            clean: false,
            virusName: lastLine,
            scanDurationMs: 0,
          });
        }
      }
    } else {
      // Fallback parsing
      if (response.includes('OK')) {
        resolve({ clean: true, scanDurationMs: 0 });
      } else {
        resolve({
          clean: false,
          virusName: response.substring(0, 100),
          scanDurationMs: 0,
        });
      }
    }
  }

  // ----------------------------------------------------------------
  // Health check
  // ----------------------------------------------------------------
  async healthCheck(): Promise<boolean> {
    if (!this.config.enabled) return true;

    return new Promise<boolean>((resolve) => {
      const socket = new Socket();
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 3000);

      socket.on('connect', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(true);
      });

      socket.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });

      socket.connect(this.config.port, this.config.host);
    });
  }

  // ----------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  isConnected(): boolean {
    return this.connected;
  }
}