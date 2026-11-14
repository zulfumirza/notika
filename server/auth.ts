import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const COOKIE_NAME = 'vaultmark_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

const ephemeralSecret = crypto.randomBytes(32).toString('hex');

interface SessionPayload {
  iat: number;
  exp: number;
}

export interface AuthConfig {
  authEnabled: boolean;
  password: string;
  secret: string;
}

export function getAuthConfig(): AuthConfig {
  const password = process.env.APP_PASSWORD?.trim() ?? '';
  const configuredSecret = process.env.AUTH_SECRET?.trim() ?? '';

  return {
    authEnabled: password.length > 0,
    password,
    secret: configuredSecret.length >= 16 ? configuredSecret : ephemeralSecret,
  };
}

function sha256Buffer(value: string): Buffer {
  return crypto.createHash('sha256').update(value, 'utf8').digest();
}

export function verifyPassword(input: string, expected: string): boolean {
  const inputHash = sha256Buffer(input);
  const expectedHash = sha256Buffer(expected);
  return crypto.timingSafeEqual(inputHash, expectedHash);
}

function signPayload(encodedPayload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url');
}

export function createSessionToken(secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url'
  );
  const signature = signPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string, secret: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) {
    return false;
  }

  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) {
    return false;
  }

  const expectedSignature = signPayload(encodedPayload, secret);
  const sigBuf = Buffer.from(signature, 'utf8');
  const expectedBuf = Buffer.from(expectedSignature, 'utf8');

  if (sigBuf.length !== expectedBuf.length) {
    return false;
  }

  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return false;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as unknown;

    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      typeof (decoded as SessionPayload).exp !== 'number'
    ) {
      return false;
    }

    const now = Math.floor(Date.now() / 1000);
    return (decoded as SessionPayload).exp > now;
  } catch {
    return false;
  }
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) {
    return cookies;
  }

  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const eqIndex = pair.indexOf('=');
    if (eqIndex === -1) continue;
    const key = pair.slice(0, eqIndex).trim();
    const val = pair.slice(eqIndex + 1).trim();
    if (key.length > 0) {
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }

  return cookies;
}

export function isRequestAuthenticated(req: Request): boolean {
  const config = getAuthConfig();
  if (!config.authEnabled) {
    return true;
  }

  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) {
    return false;
  }

  return verifySessionToken(token, config.secret);
}

function isHttpsRequest(req: Request): boolean {
  const forwardedProto = req.headers['x-forwarded-proto'];
  if (typeof forwardedProto === 'string') {
    return forwardedProto.split(',')[0]?.trim().toLowerCase() === 'https';
  }
  return req.secure;
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];

  if (isHttpsRequest(req)) {
    parts.push('Secure');
  }

  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(req: Request, res: Response): void {
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];

  if (isHttpsRequest(req)) {
    parts.push('Secure');
  }

  res.setHeader('Set-Cookie', parts.join('; '));
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!isRequestAuthenticated(req)) {
    res.status(401).json({ error: 'Bu işlem için oturum açmanız gerekiyor.' });
    return;
  }
  next();
}
