/**
 * LaGo - Sécurité : hachage des mots de passe, jetons signés, limitation de débit.
 * Uniquement des modules natifs Node.js (aucune dépendance externe).
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SCRYPT_KEYLEN = 64;
const TOKEN_TTL_SECONDS = parseInt(process.env.LAGO_TOKEN_TTL || '', 10) || 60 * 60 * 24 * 30; // 30 jours

// ---------------------------------------------------------------------------
// Mots de passe (scrypt + sel aléatoire)
// ---------------------------------------------------------------------------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hash] = parts;
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(String(password), salt, expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// ---------------------------------------------------------------------------
// Secret de signature (variable d'env, sinon généré et conservé dans data/)
// ---------------------------------------------------------------------------
function loadSecret(dataDir) {
  if (process.env.LAGO_SECRET && process.env.LAGO_SECRET.length >= 32) {
    return process.env.LAGO_SECRET;
  }
  const secretFile = path.join(dataDir, '.secret');
  try {
    if (fs.existsSync(secretFile)) {
      const s = fs.readFileSync(secretFile, 'utf-8').trim();
      if (s.length >= 32) return s;
    }
    const generated = crypto.randomBytes(48).toString('hex');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(secretFile, generated, { encoding: 'utf-8', mode: 0o600 });
    return generated;
  } catch (e) {
    console.warn('[Sécurité] Impossible de persister le secret, secret éphémère utilisé.');
    return crypto.randomBytes(48).toString('hex');
  }
}

// ---------------------------------------------------------------------------
// Jetons signés HMAC-SHA256 (format : payload_base64url.signature_base64url)
// ---------------------------------------------------------------------------
function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function createToken(secret, userId) {
  const payload = {
    sub: userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
  };
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(secret, token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
    if (!payload.sub || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Limitation de débit simple en mémoire (anti force brute sur la connexion)
// ---------------------------------------------------------------------------
function createRateLimiter({ windowMs, max }) {
  const hits = new Map();
  return {
    check(key) {
      const now = Date.now();
      const entry = hits.get(key);
      if (!entry || entry.resetAt < now) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }
      entry.count += 1;
      return entry.count <= max;
    },
    reset(key) {
      hits.delete(key);
    },
    cleanup() {
      const now = Date.now();
      for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
    }
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  loadSecret,
  createToken,
  verifyToken,
  createRateLimiter,
  TOKEN_TTL_SECONDS
};
