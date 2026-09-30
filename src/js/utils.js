/**
 * LaGo - Utilitaires partagés (sécurité d'affichage, dates, stockage)
 */
const Utils = {
  /** Échappe le texte avant insertion dans du HTML (protection XSS). */
  escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  /**
   * Convertit 'AAAA-MM-JJ' en Date locale à minuit.
   * (new Date('2026-09-03') est interprété en UTC et peut décaler d'un jour.)
   */
  parseISODate(iso) {
    if (typeof iso !== 'string') return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  },

  /** Lecture JSON sûre depuis localStorage. */
  readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  },

  writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('[Stockage] Écriture impossible :', key, e);
      return false;
    }
  },

  remove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  },

  /** Empreinte PBKDF2 (WebCrypto) pour les comptes locaux et le code PIN. */
  async hashSecret(secret, saltHex) {
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error('Chiffrement indisponible (contexte non sécurisé).');
    }
    const salt = saltHex
      ? new Uint8Array(saltHex.match(/.{2}/g).map(h => parseInt(h, 16)))
      : window.crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(secret)), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
    const toHex = buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    return `pbkdf2$${toHex(salt)}$${toHex(bits)}`;
  },

  async verifySecret(secret, stored) {
    if (!stored || typeof stored !== 'string') return false;
    const parts = stored.split('$');
    if (parts.length !== 3 || parts[0] !== 'pbkdf2') return false;
    const recomputed = await this.hashSecret(secret, parts[1]);
    return recomputed === stored;
  },

  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').trim());
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Utils;
}
