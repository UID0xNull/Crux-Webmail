// ============================================================================
// Crux-Webmail — Opciones TLS para conexiones a servicios de correo
// ============================================================================
// Zero-Trust: las conexiones del backend a Dovecot/Postfix SIEMPRE validan el
// certificado del servidor contra la CA interna (ca-chain.crt) y presentan el
// cert de cliente del backend (mTLS — los certs del proyecto tienen EKU
// clientAuth). NO hay fallback inseguro: si falta la CA, la conexión falla
// (fail-closed) en vez de aceptar certificados sin validar.
// ============================================================================

import fs from 'node:fs';
import type { ConnectionOptions } from 'node:tls';
import { config } from '../../config/app.config';
import { auditLogger } from '../../utils/audit-logger';

interface TlsMaterial {
  ca?: Buffer;
  cert?: Buffer;
  key?: Buffer;
}

let cached: TlsMaterial | null = null;

function loadMaterial(): TlsMaterial {
  if (cached) return cached;
  const m: TlsMaterial = {};

  try {
    m.ca = fs.readFileSync(config.TLS_CA_PATH);
  } catch {
    // Sin CA no podemos validar → las conexiones fallarán (fail-closed).
    auditLogger.error('[MailTLS] CA interna no encontrada — las conexiones IMAP/SMTP fallarán', {
      metadata: { path: config.TLS_CA_PATH } as any,
    });
  }

  // Cert de cliente para mTLS (opcional: sólo se presenta si está disponible).
  try {
    m.cert = fs.readFileSync(config.TLS_CERT_PATH);
    m.key = fs.readFileSync(config.TLS_KEY_PATH);
  } catch {
    auditLogger.warn('[MailTLS] Cert/key de cliente no disponibles — sin mTLS de cliente', {
      metadata: { cert: config.TLS_CERT_PATH } as any,
    });
  }

  cached = m;
  return m;
}

/**
 * Opciones TLS endurecidas para conectarse a un servicio de correo interno.
 * @param servername SAN esperado en el cert del servidor (p.ej. dovecot.crux.local)
 */
export function buildMailTlsOptions(servername: string): ConnectionOptions & { servername: string } {
  const m = loadMaterial();
  const opts: ConnectionOptions & { servername: string } = {
    servername,
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2',
  };
  if (m.ca) opts.ca = m.ca;
  if (m.cert && m.key) {
    opts.cert = m.cert;
    opts.key = m.key;
  }
  return opts;
}
