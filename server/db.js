/**
 * LaGo - Base de données JSON persistante
 * - Chargée une seule fois en mémoire (plus de relecture disque à chaque requête)
 * - Écriture atomique (fichier temporaire + renommage) pour éviter toute corruption
 * - Migration automatique des mots de passe en clair vers des empreintes scrypt
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { hashPassword } = require('./security');

const EMPTY_DB = () => ({ users: [], settings: {}, logs: {}, activityLogs: [] });
const MAX_ACTIVITY_LOGS = 500;

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftISODate(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

/**
 * Décale les dates des données de démonstration pour qu'elles restent actuelles
 * (le cycle de Sarah commence toujours ~12 jours avant le premier démarrage).
 */
function refreshDemoDates(db) {
  const sarah = db.settings && db.settings.usr_sarah_002;
  if (!sarah || !sarah.lastPeriodDate) return;
  const [y, m, d] = sarah.lastPeriodDate.split('-').map(Number);
  const original = new Date(y, m - 1, d);
  const target = new Date();
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() - 12);
  const offset = Math.round((target - original) / 86400000);
  if (offset === 0) return;

  Object.values(db.settings).forEach(s => {
    if (s && s.lastPeriodDate) s.lastPeriodDate = shiftISODate(s.lastPeriodDate, offset);
  });
  Object.keys(db.logs).forEach(uid => {
    const shifted = {};
    Object.entries(db.logs[uid]).forEach(([date, entry]) => {
      shifted[shiftISODate(date, offset)] = entry;
    });
    db.logs[uid] = shifted;
  });
}

class Database {
  constructor({ dataDir, seedFile, demoMode }) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'lago_database.json');
    this.seedFile = seedFile;
    this.demoMode = demoMode;
    this.data = null;
    this.writeTimer = null;
  }

  load() {
    fs.mkdirSync(this.dataDir, { recursive: true });

    if (fs.existsSync(this.file)) {
      this.data = { ...EMPTY_DB(), ...JSON.parse(fs.readFileSync(this.file, 'utf-8')) };
    } else if (this.demoMode && this.seedFile && fs.existsSync(this.seedFile)) {
      this.data = { ...EMPTY_DB(), ...JSON.parse(fs.readFileSync(this.seedFile, 'utf-8')) };
      refreshDemoDates(this.data);
      this.data.activityLogs.unshift({
        timestamp: new Date().toISOString(),
        action: 'Base initialisée avec les comptes de démonstration'
      });
      console.log('🌱 Base de données créée à partir des données de démonstration.');
    } else {
      this.data = EMPTY_DB();
    }

    // Migration : mots de passe en clair -> empreinte scrypt
    let migrated = 0;
    this.data.users.forEach(u => {
      if (u.password && !u.passwordHash) {
        u.passwordHash = hashPassword(u.password);
        migrated++;
      }
      delete u.password;
      if (!u.status) u.status = 'active';
    });
    if (migrated) console.log(`🔐 ${migrated} mot(s) de passe migré(s) vers scrypt.`);

    this.ensureAdminFromEnv();
    this.flush();
    return this;
  }

  /** Crée (ou met à jour) un Super Admin depuis ADMIN_EMAIL / ADMIN_PASSWORD. */
  ensureAdminFromEnv() {
    const email = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
    const password = process.env.ADMIN_PASSWORD || '';
    if (!email || password.length < 8) return;
    let admin = this.data.users.find(u => u.email === email);
    if (!admin) {
      admin = {
        id: 'usr_' + Date.now().toString(36),
        name: process.env.ADMIN_NAME || 'Super Admin',
        email,
        role: 'superadmin',
        age: null,
        createdAt: new Date().toISOString(),
        status: 'active'
      };
      this.data.users.push(admin);
    }
    admin.role = 'superadmin';
    admin.status = 'active';
    admin.passwordHash = hashPassword(password);
  }

  /** Sauvegarde différée (regroupe les écritures rapprochées). */
  save() {
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      this.flush();
    }, 50);
  }

  /** Écriture atomique immédiate. */
  flush() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  logActivity(action) {
    this.data.activityLogs.unshift({ timestamp: new Date().toISOString(), action });
    if (this.data.activityLogs.length > MAX_ACTIVITY_LOGS) {
      this.data.activityLogs.length = MAX_ACTIVITY_LOGS;
    }
  }
}

module.exports = { Database, toISODate };
