// ============================================================================
// Crux-Webmail — Auth Service (Business Logic Layer)
// ============================================================================
// Maneja registro, login, MFA, cambio de contraseña, lockout por fuerza bruta.
// Conecta User model, bcrypt hashing, session manager, audit logging.
// ============================================================================

import { UserModel, comparePassword } from '../../models/User';
import { AuditLogModel } from '../../models/AuditLog';
import { MFASessionModel } from '../../models/MFASession';
import { RefreshTokenModel } from '../../models/RefreshToken';
import { config } from '../../config/app.config';
import { auditLogger } from '../../utils/audit-logger';
import { 
  generateSecureUuid, 
  hashFingerprint, 
  hashIp, 
  createHmac,
  generateNonce,
} from '../../utils/crypto';
import { getSessionManager } from '../auth/session-manager';
import { Op } from 'sequelize';

// ------------------------------------------------------------------
// Brute-force protection constants
// ------------------------------------------------------------------
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// ------------------------------------------------------------------
// Interfaces
// ------------------------------------------------------------------
export interface LoginRequest {
  username: string;
  password: string;
  device_fingerprint: {
    browser: string;
    os: string;
    screen: string;
    timezone: string;
    languages: string[];
  };
  clientIp: string;
  mtlsSerial: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  display_name?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface MFASetupResponse {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
  mfaSessionId: string;
}

export interface MFAVerifyRequest {
  mfaSessionId: string;
  code: string;
}

export interface AuthResult {
  success: boolean;
  requiresMFA?: boolean;
  mfaSessionId?: string;
  token?: string;
  refreshToken?: string;
  session_id?: string;
  fingerprint?: string;
  error?: string;
}

// ------------------------------------------------------------------
// Auth Service
// ------------------------------------------------------------------
export class AuthService {

  // ----------------------------------------------------------------
  // REGISTER — nuevo usuario con validación de contraseña
  // ----------------------------------------------------------------
  async register(req: RegisterRequest): Promise<{ success: boolean; user_id?: string; error?: string }> {
    try {
      // Validate password strength
      const pwResult = validatePasswordStrength(req.password);
      if (!pwResult.valid) {
        auditLogger.warn('Weak password attempt', {
          metadata: { error: pwResult.error },
        });
        return { success: false, error: 'WEAK_PASSWORD' };
      }

      // Check if user already exists
      const existing = await UserModel.findOne({ where: { username: req.username } });
      if (existing) {
        auditLogger.warn('Duplicate register attempt', {
          metadata: { username: req.username },
        });
        return { success: false, error: 'USER_EXISTS' };
      }

      // Create user
      const user = await UserModel.create({
        username: req.username,
        password: req.password, // Hook will hash it
        display_name: req.display_name || req.username.split('@')[0],
        roles: ['user'],
        is_active: true,
        mfa_enabled: false,
      } as any);

      await (AuditLogModel as any).create({
        event_id: generateSecureUuid(),
        timestamp: new Date().toISOString(),
        source: 'auth-service',
        level: 'info',
        category: 'account',
        message: 'New user registered',
        actor_id: user.id,
        metadata: {
          username: user.username,
        },
      });

      return { success: true, user_id: user.id };
    } catch (err) {
      auditLogger.error('Register failed', {
        metadata: { error: (err as Error).message },
      });
      return { success: false, error: 'REGISTRATION_ERROR' };
    }
  }

  // ----------------------------------------------------------------
  // LOGIN — validación de credenciales + lockout + MFA check
  // ----------------------------------------------------------------
  async login(req: LoginRequest): Promise<AuthResult> {
    const clientIp = req.clientIp;

    try {
      // 1. Find user
      const user = await UserModel.findOne({ where: { username: req.username } });

      if (!user) {
        // Generic error — don't leak user existence
        auditLogger.warn('Login attempt — user not found', {
          metadata: { username: req.username, client_ip: clientIp },
        });
        return { success: false, error: 'INVALID_CREDENTIALS' };
      }

      // 2. Check if account is active
      if (!user.is_active) {
        auditLogger.warn('Login attempt — account disabled', {
          actor_id: user.id,
          client_ip: clientIp,
        });
        return { success: false, error: 'ACCOUNT_DISABLED' };
      }

      // 3. Check brute-force lockout
      if (user.locked_until && user.locked_until > Date.now()) {
        const remainingMs = user.locked_until - Date.now();
        auditLogger.warn('Login attempt — account locked', {
          actor_id: user.id,
          client_ip: clientIp,
          metadata: { locked_until: new Date(user.locked_until).toISOString() },
        });
        return {
          success: false,
          error: 'ACCOUNT_LOCKED',
          // Don't expose exact time in production
        };
      }

      // 4. Validate password
      const passwordValid = await comparePassword(req.password, user.passwordHash);

      if (!passwordValid) {
        // Increment failed attempts
        await this.incrementFailedAttempts(user);

        auditLogger.warn('Login failed — invalid password', {
          actor_id: user.id,
          client_ip: clientIp,
          metadata: { failed_attempts: user.failed_attempts + 1 },
        });

        return { success: false, error: 'INVALID_CREDENTIALS' };
      }

      // 5. Password valid — reset failed attempts & update last_login
      if (user.failed_attempts > 0 || user.locked_until) {
        await (UserModel as any).update(
          {
            failed_attempts: 0,
            locked_until: null,
          },
          { where: { id: user.id } }
        );
      }

      await (UserModel as any).update(
        { last_login: new Date() },
        { where: { id: user.id } }
      );

      // 6. Check MFA requirement
      if (user.mfa_enabled) {
        // Create pending MFA session
        const mfaSession = await (MFASessionModel as any).create({
          userId: user.id,
          session_id: generateSecureUuid(),
          method: 'totp',
          status: 'pending',
          totp_secret: user.mfa_secret,
          attempts: 0,
          max_attempts: 5,
          expires_at: Date.now() + 300000, // 5 min TTL
        });

        auditLogger.info('MFA required for login', {
          actor_id: user.id,
          client_ip: clientIp,
          metadata: { mfa_session_id: mfaSession.id },
        });

        return {
          success: false,
          requiresMFA: true,
          mfaSessionId: mfaSession.id,
        };
      }

      // 7. Authenticate via Session Manager
      const sessionManager = await getSessionManager();
      const fpHash = await hashFingerprint(JSON.stringify(req.device_fingerprint));

      const authResult = await sessionManager.authenticate(
        user.id,
        req.password,
        req.device_fingerprint as any,
        clientIp,
        req.mtlsSerial
      );

      if (!authResult.success) {
        return authResult;
      }

      // 8. Store refresh token in DB
      const ipHash = hashIp(clientIp, 'refresh-token-salt');
      await (RefreshTokenModel as any).create({
        userId: user.id,
        sessionId: authResult.session_id!,
        tokenHash: createHmac(authResult.refreshToken!, 'refresh-token-hmac'),
        fingerprint: fpHash,
        ip_hash: ipHash,
        expiresAt: Date.now() + config.JWT_REFRESH_TTL_MS,
      });

      // 9. Audit log
      await (AuditLogModel as any).create({
        event_id: generateSecureUuid(),
        timestamp: new Date().toISOString(),
        source: 'auth-service',
        level: 'info',
        category: 'auth',
        message: 'User logged in successfully',
        actor_id: user.id,
        session_id: authResult.session_id,
        client_ip: clientIp,
        metadata: {
          method: 'password',
          mtls_serial: req.mtlsSerial,
        },
      });

      return {
        success: true,
        token: authResult.token,
        refreshToken: authResult.refreshToken,
        session_id: authResult.session_id,
        fingerprint: authResult.fingerprint,
      };
    } catch (err) {
      auditLogger.error('Login process error', {
        client_ip: clientIp,
        metadata: { error: (err as Error).message },
      });
      return { success: false, error: 'AUTH_INTERNAL_ERROR' };
    }
  }

  // ----------------------------------------------------------------
  // MFA VERIFY — completar verificación TOTP
  // ----------------------------------------------------------------
  async verifyMFA(mfaSessionId: string, code: string, clientIp: string): Promise<AuthResult> {
    try {
      // 1. Find pending MFA session
      const mfaSession = await MFASessionModel.findOne({ where: { id: mfaSessionId } });

      if (!mfaSession) {
        return { success: false, error: 'INVALID_MFA_SESSION' };
      }

      // 2. Check expired
      if (mfaSession.expires_at < Date.now()) {
        await mfaSession.update({ status: 'expired' });
        return { success: false, error: 'MFA_SESSION_EXPIRED' };
      }

      // 3. Check max attempts
      if (mfaSession.attempts >= mfaSession.max_attempts) {
        await mfaSession.update({ status: 'failed' });
        auditLogger.critical('MFA max attempts exceeded — session terminated', {
          actor_id: mfaSession.userId,
          client_ip: clientIp,
        });
        return { success: false, error: 'MFA_MAX_ATTEMPTS' };
      }

      // 4. Verify TOTP code
      const isValid = verifyTOTPCode(mfaSession.totp_secret!, code);

      if (!isValid) {
        await mfaSession.update({ attempts: mfaSession.attempts + 1 });
        auditLogger.warn('MFA verification failed', {
          actor_id: mfaSession.userId,
          client_ip: clientIp,
          metadata: { attempts: mfaSession.attempts + 1, max: mfaSession.max_attempts },
        });
        return { success: false, error: 'INVALID_MFA_CODE' };
      }

      // 5. MFA verified — mark session
      await mfaSession.update({
        status: 'verified',
        verified_at: Date.now(),
      });

      // 6. Now create session via Session Manager
      const user = await UserModel.findByPk(mfaSession.userId);
      if (!user) {
        return { success: false, error: 'USER_NOT_FOUND' };
      }

      const sessionManager = await getSessionManager();

      // Use a default fingerprint for MFA flow (user already authenticated in browser)
      const deviceFp = {
        browser: 'unknown',
        os: 'unknown',
        screen: 'unknown',
        timezone: 'UTC',
        languages: ['en'],
      };

      const authResult = await sessionManager.authenticate(
        user.id,
        '', // password already verified
        deviceFp as any,
        clientIp,
        'none'
      );

      if (!authResult.success) {
        return authResult;
      }

      await (AuditLogModel as any).create({
        event_id: generateSecureUuid(),
        timestamp: new Date().toISOString(),
        source: 'auth-service',
        level: 'info',
        category: 'mfa',
        message: 'MFA verification successful',
        actor_id: user.id,
        session_id: authResult.session_id,
        client_ip: clientIp,
      });

      return {
        success: true,
        token: authResult.token,
        refreshToken: authResult.refreshToken,
        session_id: authResult.session_id,
        fingerprint: authResult.fingerprint,
      };
    } catch (err) {
      auditLogger.error('MFA verify error', {
        metadata: { error: (err as Error).message },
      });
      return { success: false, error: 'MFA_INTERNAL_ERROR' };
    }
  }

  // ----------------------------------------------------------------
  // MFA SETUP — generar secret + QR
  // ----------------------------------------------------------------
  async setupMFA(userId: string, clientIp: string): Promise<MFASetupResponse> {
    try {
      const user = await UserModel.findByPk(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Generate TOTP secret
      const totpSecret = generateTOTPSecret();
      const qrCodeUrl = generateQRCodeUrl(totpSecret, user.username, 'Crux-Webmail');

      // Generate 10 backup codes
      const backupCodes: string[] = [];
      for (let i = 0; i < 10; i++) {
        backupCodes.push(generateSecureUuid().substring(0, 8).toUpperCase());
      }

      // Create MFA session (pending until verified)
      const mfaSession = await (MFASessionModel as any).create({
        userId,
        session_id: generateSecureUuid(),
        method: 'totp',
        status: 'pending',
        totp_secret: totpSecret,
        attempts: 0,
        max_attempts: 5,
        expires_at: Date.now() + 3600000, // 1 hour to complete setup
      });

      // Store backup code hashes temporarily
      const hashedBackups = backupCodes.map(code => createHmac(code, 'backup-code-salt'));
      await mfaSession.update({
        backup_code_hash: JSON.stringify(hashedBackups),
      });

      await (AuditLogModel as any).create({
        event_id: generateSecureUuid(),
        timestamp: new Date().toISOString(),
        source: 'auth-service',
        level: 'info',
        category: 'mfa',
        message: 'MFA setup initiated',
        actor_id: userId,
        client_ip: clientIp,
      });

      return {
        secret: totpSecret,
        qrCodeUrl,
        backupCodes,
        mfaSessionId: mfaSession.id,
      };
    } catch (err) {
      auditLogger.error('MFA setup error', {
        actor_id: userId,
        metadata: { error: (err as Error).message },
      });
      throw err;
    }
  }

  // ----------------------------------------------------------------
  // MFA ENABLE — completar setup y activar MFA en el usuario
  // ----------------------------------------------------------------
  async enableMFA(mfaSessionId: string, code: string, clientIp: string): Promise<{ success: boolean; error?: string }> {
    try {
      const mfaSession = await MFASessionModel.findOne({ where: { id: mfaSessionId } });
      if (!mfaSession) {
        return { success: false, error: 'INVALID_MFA_SESSION' };
      }

      // Verify the TOTP code one last time
      const isValid = verifyTOTPCode(mfaSession.totp_secret!, code);
      if (!isValid) {
        return { success: false, error: 'INVALID_MFA_CODE' };
      }

      // Enable MFA on user
      await UserModel.update(
        { mfa_enabled: true, mfa_secret: mfaSession.totp_secret },
        { where: { id: mfaSession.userId } }
      );

      await mfaSession.update({ status: 'verified' });

      await (AuditLogModel as any).create({
        event_id: generateSecureUuid(),
        timestamp: new Date().toISOString(),
        source: 'auth-service',
        level: 'info',
        category: 'mfa',
        message: 'MFA enabled for user',
        actor_id: mfaSession.userId,
        client_ip: clientIp,
      });

      return { success: true };
    } catch (err) {
      return { success: false, error: 'MFA_ENABLE_ERROR' };
    }
  }

  // ----------------------------------------------------------------
  // CHANGE PASSWORD
  // ----------------------------------------------------------------
  async changePassword(
    userId: string,
    req: ChangePasswordRequest,
    clientIp: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const user = await UserModel.findByPk(userId);
      if (!user) {
        return { success: false, error: 'USER_NOT_FOUND' };
      }

      // Verify current password
      const currentValid = await comparePassword(req.currentPassword, user.passwordHash);
      if (!currentValid) {
        auditLogger.warn('Password change failed — wrong current password', {
          actor_id: userId,
          client_ip: clientIp,
        });
        return { success: false, error: 'INVALID_CURRENT_PASSWORD' };
      }

      // Validate new password strength
      const pwResult = validatePasswordStrength(req.newPassword);
      if (!pwResult.valid) {
        return { success: false, error: 'WEAK_PASSWORD' };
      }

      // Cannot reuse same password
      if (await comparePassword(req.newPassword, user.passwordHash)) {
        return { success: false, error: 'PASSWORD_SAME_AS_CURRENT' };
      }

      // Update password
      await UserModel.update(
        { password: req.newPassword }, // Hook will hash
        { where: { id: userId } }
      );

      await (AuditLogModel as any).create({
        event_id: generateSecureUuid(),
        timestamp: new Date().toISOString(),
        source: 'auth-service',
        level: 'info',
        category: 'password',
        message: 'Password changed successfully',
        actor_id: userId,
        client_ip: clientIp,
      });

      return { success: true };
    } catch (err) {
      auditLogger.error('Password change error', {
        actor_id: userId,
        metadata: { error: (err as Error).message },
      });
      return { success: false, error: 'PASSWORD_CHANGE_ERROR' };
    }
  }

  // ----------------------------------------------------------------
  // GET PROFILE
  // ----------------------------------------------------------------
  async getProfile(userId: string): Promise<any> {
    const user = await UserModel.findByPk(userId, {
      attributes: ['id', 'username', 'display_name', 'roles', 'is_active', 'mfa_enabled', 'last_login', 'created_at'],
    });

    if (!user) {
      throw new Error('User not found');
    }

    return {
      user_id: user.id,
      email: user.username,
      display_name: user.display_name,
      roles: user.roles,
      mfa_enabled: user.mfa_enabled,
      last_login: user.last_login,
      created_at: user.created_at,
    };
  }

  // ----------------------------------------------------------------
  // Internal helpers
  // ----------------------------------------------------------------
      private async incrementFailedAttempts(user: UserModel): Promise<void> {
    const newAttempts = user.failed_attempts + 1;
    const lockUntil = newAttempts >= MAX_FAILED_ATTEMPTS 
      ? Date.now() + LOCKOUT_DURATION_MS 
      : null;

    await (UserModel as any).update(
      {
        failed_attempts: newAttempts,
        locked_until: lockUntil,
      },
      { where: { id: user.id } }
    );
  }
}

// ============================================================================
// TOTP / MFA Helpers (RFC 6238 compliant — HMAC-SHA1, 30s period)
// ============================================================================

function generateTOTPSecret(): string {
  const bytes = generateNonce(20);
  // Convert to Base32
  return base32Encode(Buffer.from(bytes, 'hex'));
}

function verifyTOTPCode(secret: string, code: string): boolean {
  const speakeasy = require('speakeasy');
  try {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: code,
      window: 1, // Allow ±1 period (30s window) for clock drift
    });
  } catch {
    return false;
  }
}

function generateQRCodeUrl(secret: string, accountName: string, issuer: string): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
}

// ------------------------------------------------------------------
// Password strength validator
// ------------------------------------------------------------------
function validatePasswordStrength(password: string): { valid: boolean; error?: string } {
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' };
  }
  if (password.length > 128) {
    return { valid: false, error: 'Password must be at most 128 characters' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one digit' };
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one special character' };
  }
  return { valid: true };
}

// ------------------------------------------------------------------
// Base32 encoding (RFC 4648)
// ------------------------------------------------------------------
function base32Encode(data: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let result = '';
  let bitsLeft = 0;
  let buffer = 0;

  for (const byte of data) {
    buffer = (buffer << 8) | byte;
    bitsLeft += 8;
    while (bitsLeft >= 5) {
      result += alphabet[(buffer >> (bitsLeft - 5)) & 31];
      bitsLeft -= 5;
    }
  }

  if (bitsLeft > 0) {
    result += alphabet[(buffer << (5 - bitsLeft)) & 31];
  }

  return result;
}

// ------------------------------------------------------------------
// Singleton
// ------------------------------------------------------------------
let _authService: AuthService | null = null;

export function getAuthService(): AuthService {
  if (!_authService) {
    _authService = new AuthService();
  }
  return _authService;
}