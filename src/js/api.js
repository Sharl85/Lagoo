/**
 * LaGo 🌸 - Client API REST
 * Chaque appel renvoie { ok, status, data, offline } :
 *  - offline = true  -> serveur injoignable (réseau coupé) : l'app bascule en mode local
 *  - ok = false      -> le serveur a répondu une erreur (ex. mauvais mot de passe) : pas de repli local
 */
const Api = {
  TIMEOUT_MS: 10000,
  token: null,

  get baseUrl() {
    const cfg = window.LAGO_CONFIG || {};
    return (cfg.apiBaseUrl || '').replace(/\/+$/, '');
  },

  /**
   * Le serveur est-il utilisable ? En version web, il est sur la même origine.
   * En version mobile, il faut une apiBaseUrl configurée au build.
   */
  get enabled() {
    const cfg = window.LAGO_CONFIG || {};
    if (cfg.platform === 'mobile') return Boolean(this.baseUrl);
    return true;
  },

  setToken(token) {
    this.token = token || null;
  },

  async request(endpoint, options = {}) {
    if (!this.enabled) return { ok: false, status: 0, data: null, offline: true };

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), this.TIMEOUT_MS) : null;
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    try {
      const response = await fetch(this.baseUrl + endpoint, {
        ...options,
        headers,
        signal: controller ? controller.signal : undefined
      });
      const data = await response.json().catch(() => null);
      // Réponse synthétique du service worker quand le réseau est coupé
      if (data && data.offline === true) {
        return { ok: false, status: 0, data: null, offline: true };
      }
      if (response.status === 401 && this.token && typeof Auth !== 'undefined') {
        Auth.handleExpiredSession();
      }
      return { ok: response.ok, status: response.status, data, offline: false };
    } catch (err) {
      console.warn(`[Api] Serveur injoignable (${endpoint}) :`, err.message);
      return { ok: false, status: 0, data: null, offline: true };
    } finally {
      if (timer) clearTimeout(timer);
    }
  },

  message(res, fallback) {
    return (res && res.data && res.data.message) || fallback;
  },

  // --- Santé ---
  health() { return this.request('/api/health'); },

  // --- Auth ---
  login(email, password) {
    return this.request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  },
  register(name, email, password, age) {
    return this.request('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password, age }) });
  },
  me() { return this.request('/api/auth/me'); },
  changePassword(currentPassword, newPassword) {
    return this.request('/api/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
  },
  deleteAccount() { return this.request('/api/auth/account', { method: 'DELETE' }); },

  // --- Cycle ---
  getSettings() { return this.request('/api/cycle/settings'); },
  saveSettings(settings) {
    return this.request('/api/cycle/settings', { method: 'POST', body: JSON.stringify({ settings }) });
  },
  getLogs() { return this.request('/api/cycle/logs'); },
  saveLog(date, data) {
    return this.request('/api/cycle/logs', { method: 'POST', body: JSON.stringify({ date, data }) });
  },
  deleteLog(date) {
    return this.request('/api/cycle/logs', { method: 'DELETE', body: JSON.stringify({ date }) });
  },
  importData(payload) {
    return this.request('/api/cycle/import', { method: 'POST', body: JSON.stringify(payload) });
  },
  clearData() { return this.request('/api/cycle/data', { method: 'DELETE' }); },

  // --- Super Admin ---
  getAdminStats() { return this.request('/api/admin/stats'); },
  getAdminUsers() { return this.request('/api/admin/users'); },
  createUser(name, email, password, age) {
    return this.request('/api/admin/user', { method: 'POST', body: JSON.stringify({ name, email, password, age }) });
  },
  updateUserRole(userId, role) {
    return this.request('/api/admin/user/role', { method: 'POST', body: JSON.stringify({ userId, role }) });
  },
  updateUserStatus(userId, status) {
    return this.request('/api/admin/user/status', { method: 'POST', body: JSON.stringify({ userId, status }) });
  },
  deleteUser(userId) {
    return this.request(`/api/admin/user?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' });
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Api;
}
