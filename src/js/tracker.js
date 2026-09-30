/**
 * LaGo 🌸 - Données du cycle & journal quotidien
 *
 * - Lecture instantanée depuis le cache de l'appareil (fonctionne hors-ligne)
 * - Synchronisation automatique avec le serveur quand la session est en ligne
 * - File d'attente des modifications faites hors-ligne, renvoyée dès le retour du réseau
 * - Le code PIN reste uniquement sur l'appareil
 */
const Tracker = {
  LOCAL_ONLY_KEYS: ['pinHash', 'pinCode'],
  syncing: false,

  getUserId() {
    const user = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;
    return user && user.id ? user.id : 'default';
  },

  keys(uid = this.getUserId()) {
    return {
      settings: `lago_settings_${uid}`,
      logs: `lago_logs_${uid}`,
      pending: `lago_pending_${uid}`,
      pin: `lago_pin_${uid}`
    };
  },

  defaultSettings() {
    return {
      lastPeriodDate: CycleCalculator.formatDateISO(CycleCalculator.addDays(new Date(), -12)),
      cycleLength: 28,
      periodDuration: 5,
      petalsEnabled: true,
      darkMode: false,
      discreetMode: false,
      remindersEnabled: false
    };
  },

  // -------------------------------------------------------------------------
  // Paramètres
  // -------------------------------------------------------------------------
  getSettings() {
    const stored = Utils.readJSON(this.keys().settings, null);
    const merged = { ...this.defaultSettings(), ...(stored || {}) };
    delete merged.pinCode;
    return merged;
  },

  hasStoredSettings() {
    return Utils.readJSON(this.keys().settings, null) !== null;
  },

  saveSettings(partial) {
    const updated = { ...this.getSettings(), ...partial, updatedAt: new Date().toISOString() };
    this.LOCAL_ONLY_KEYS.forEach(k => delete updated[k]);
    if (!Utils.writeJSON(this.keys().settings, updated)) return null;
    this.markPending({ settings: true });
    this.pushSoon();
    return updated;
  },

  // -------------------------------------------------------------------------
  // Journal
  // -------------------------------------------------------------------------
  getAllLogs() {
    const logs = Utils.readJSON(this.keys().logs, {});
    return logs && typeof logs === 'object' ? logs : {};
  },

  getLogForDate(dateStr) {
    return this.getAllLogs()[dateStr] || null;
  },

  saveDayLog(dateStr, logData) {
    const logs = this.getAllLogs();
    logs[dateStr] = { ...logData, updatedAt: new Date().toISOString() };
    if (!Utils.writeJSON(this.keys().logs, logs)) return null;
    this.markPending({ logs: { [dateStr]: true } });
    this.pushSoon();
    return logs[dateStr];
  },

  deleteDayLog(dateStr) {
    const logs = this.getAllLogs();
    if (!logs[dateStr]) return true;
    delete logs[dateStr];
    Utils.writeJSON(this.keys().logs, logs);
    this.markPending({ logs: { [dateStr]: true } });
    this.pushSoon();
    return true;
  },

  /** Données de démonstration de Sarah (mode local uniquement, créées une seule fois). */
  seedSampleData(uid) {
    const k = this.keys(uid);
    if (Utils.readJSON(k.logs, null)) return;
    const today = new Date();
    const lmp = CycleCalculator.addDays(today, -12);
    const iso = d => CycleCalculator.formatDateISO(d);
    const now = new Date().toISOString();
    Utils.writeJSON(k.settings, { lastPeriodDate: iso(lmp), cycleLength: 28, periodDuration: 5 });
    Utils.writeJSON(k.logs, {
      [iso(lmp)]: { flow: 'heavy', mood: 'tired', temperature: '36.4', symptoms: ['cramps', 'fatigue', 'backpain'], notes: 'Premier jour de mes règles. Tisane de framboisier et bouillotte.', updatedAt: now },
      [iso(CycleCalculator.addDays(lmp, 1))]: { flow: 'medium', mood: 'calm', temperature: '36.5', symptoms: ['cramps', 'headache'], notes: 'Moins mal aujourd’hui. Repos.', updatedAt: now },
      [iso(CycleCalculator.addDays(lmp, 2))]: { flow: 'light', mood: 'calm', temperature: '36.5', symptoms: ['fatigue'], notes: 'Flux très léger.', updatedAt: now },
      [iso(CycleCalculator.addDays(today, -1))]: { flow: 'none', mood: 'energetic', temperature: '36.7', symptoms: ['acne'], notes: 'Pleine forme pour les cours !', updatedAt: now },
      [iso(today)]: { flow: 'none', mood: 'happy', temperature: '36.7', symptoms: ['libido', 'cervical'], notes: 'Sensation de bien-être, beaucoup d’énergie.', updatedAt: now }
    });
  },

  // -------------------------------------------------------------------------
  // Synchronisation serveur
  // -------------------------------------------------------------------------
  getPending(uid = this.getUserId()) {
    return Utils.readJSON(this.keys(uid).pending, { settings: false, logs: {} });
  },

  hasPending(uid = this.getUserId()) {
    const p = this.getPending(uid);
    return Boolean(p.settings || Object.keys(p.logs || {}).length);
  },

  markPending({ settings, logs }) {
    const p = this.getPending();
    if (settings) p.settings = true;
    if (logs) p.logs = { ...(p.logs || {}), ...logs };
    Utils.writeJSON(this.keys().pending, p);
  },

  pushSoon() {
    clearTimeout(this._pushTimer);
    this._pushTimer = setTimeout(() => this.sync(), 400);
  },

  /**
   * Envoie les modifications en attente puis récupère la version serveur.
   * Renvoie 'synced' | 'offline' | 'local' | 'error'.
   */
  async sync({ pull = false } = {}) {
    if (typeof Auth === 'undefined' || !Auth.isServerSession()) return 'local';
    if (this.syncing) return 'busy';
    this.syncing = true;
    const uid = this.getUserId();
    const k = this.keys(uid);

    try {
      const pending = this.getPending(uid);
      const hasPending = pending.settings || Object.keys(pending.logs || {}).length;
      let res;

      if (hasPending) {
        const logs = this.getAllLogs();
        const payloadLogs = {};
        Object.keys(pending.logs || {}).forEach(date => { payloadLogs[date] = logs[date] || null; });
        res = await Api.importData({
          settings: pending.settings ? this.getSettings() : undefined,
          logs: payloadLogs,
          mode: 'merge'
        });
        if (res.offline) return 'offline';
        if (!res.ok) return 'error';
        Utils.writeJSON(k.pending, { settings: false, logs: {} });
        this.applyServerData(uid, res.data.settings, res.data.logs);
        return 'synced';
      }

      if (!pull) return 'synced';

      const [settingsRes, logsRes] = await Promise.all([Api.getSettings(), Api.getLogs()]);
      if (settingsRes.offline || logsRes.offline) return 'offline';
      if (!settingsRes.ok || !logsRes.ok) return 'error';

      // Première connexion sur le serveur : on envoie les réglages déjà présents sur l'appareil
      if (!settingsRes.data.settings && this.hasStoredSettings()) {
        this.markPending({ settings: true });
        this.syncing = false;
        return this.sync();
      }
      this.applyServerData(uid, settingsRes.data.settings, logsRes.data.logs);
      return 'synced';
    } catch (e) {
      console.warn('[Sync] Erreur :', e);
      return 'error';
    } finally {
      this.syncing = false;
    }
  },

  applyServerData(uid, settings, logs) {
    const k = this.keys(uid);
    if (settings) {
      const local = Utils.readJSON(k.settings, {}) || {};
      Utils.writeJSON(k.settings, { ...local, ...settings });
    }
    if (logs && typeof logs === 'object') Utils.writeJSON(k.logs, logs);
    window.dispatchEvent(new CustomEvent('lago:data-updated'));
  },

  // -------------------------------------------------------------------------
  // Code PIN (uniquement sur l'appareil)
  // -------------------------------------------------------------------------
  getPinHash(uid = this.getUserId()) {
    return Utils.readJSON(this.keys(uid).pin, null);
  },

  async setPin(pin) {
    if (!/^\d{4,6}$/.test(String(pin))) return { success: false, message: 'Le code doit contenir 4 à 6 chiffres.' };
    Utils.writeJSON(this.keys().pin, await Utils.hashSecret(pin));
    return { success: true };
  },

  removePin() {
    Utils.remove(this.keys().pin);
  },

  async checkPin(pin) {
    return Utils.verifySecret(pin, this.getPinHash());
  },

  // -------------------------------------------------------------------------
  // Export / Import / Réinitialisation
  // -------------------------------------------------------------------------
  buildExport() {
    const user = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;
    return {
      app: 'LaGo',
      version: '3.0',
      user: user ? { name: user.name, email: user.email } : 'anonymous',
      exportedAt: new Date().toISOString(),
      settings: this.getSettings(),
      logs: this.getAllLogs()
    };
  },

  exportFileName() {
    return `lago_sauvegarde_${CycleCalculator.formatDateISO(new Date())}.json`;
  },

  /** Téléchargement navigateur (la version mobile passe par Platform.shareFile). */
  exportDataJSON() {
    const blob = new Blob([JSON.stringify(this.buildExport(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.exportFileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  importDataJSON(jsonString) {
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (e) {
      return { success: false, message: 'Fichier JSON invalide ou corrompu.' };
    }
    if (!parsed || typeof parsed !== 'object' || (!parsed.settings && !parsed.logs)) {
      return { success: false, message: 'Ce fichier n’est pas une sauvegarde LaGo.' };
    }

    if (parsed.settings && typeof parsed.settings === 'object') {
      const s = parsed.settings;
      const clean = {};
      if (Utils.parseISODate(s.lastPeriodDate)) clean.lastPeriodDate = s.lastPeriodDate;
      if (Number.isFinite(+s.cycleLength)) clean.cycleLength = Math.min(60, Math.max(15, parseInt(s.cycleLength, 10)));
      if (Number.isFinite(+s.periodDuration)) clean.periodDuration = Math.min(15, Math.max(1, parseInt(s.periodDuration, 10)));
      ['petalsEnabled', 'darkMode', 'discreetMode', 'remindersEnabled'].forEach(key => {
        if (typeof s[key] === 'boolean') clean[key] = s[key];
      });
      this.saveSettings(clean);
    }

    let count = 0;
    if (parsed.logs && typeof parsed.logs === 'object') {
      const logs = this.getAllLogs();
      const touched = {};
      Object.entries(parsed.logs).forEach(([date, entry]) => {
        if (!Utils.parseISODate(date) || !entry || typeof entry !== 'object') return;
        logs[date] = {
          flow: String(entry.flow || 'none'),
          mood: String(entry.mood || 'calm'),
          temperature: entry.temperature ? String(entry.temperature) : '',
          symptoms: Array.isArray(entry.symptoms) ? entry.symptoms.map(String) : [],
          notes: typeof entry.notes === 'string' ? entry.notes.slice(0, 2000) : '',
          updatedAt: entry.updatedAt || new Date().toISOString()
        };
        touched[date] = true;
        count++;
      });
      Utils.writeJSON(this.keys().logs, logs);
      this.markPending({ logs: touched });
      this.pushSoon();
    }
    return { success: true, message: `Sauvegarde restaurée (${count} jour${count > 1 ? 's' : ''} de journal).` };
  },

  async clearAllData() {
    const k = this.keys();
    Utils.remove(k.settings);
    Utils.remove(k.logs);
    Utils.remove(k.pending);
    if (typeof Auth !== 'undefined' && Auth.isServerSession()) {
      const res = await Api.clearData();
      if (!res.ok) return { success: false, offline: res.offline };
    }
    return { success: true };
  },

  clearLocalCacheIfSynced(uid) {
    if (this.hasPending(uid)) return;
    const k = this.keys(uid);
    Utils.remove(k.settings);
    Utils.remove(k.logs);
  },

  purgeUser(uid) {
    Object.values(this.keys(uid)).forEach(key => Utils.remove(key));
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Tracker;
}
