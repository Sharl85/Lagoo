/**
 * LaGo 🌸 - Authentification & rôles (Utilisatrice / Super Admin)
 *
 * Deux modes :
 *  - 'server' : comptes gérés par l'API (mots de passe hachés côté serveur, jeton signé)
 *  - 'local'  : repli hors-ligne / app mobile sans serveur (comptes stockés sur l'appareil,
 *               mots de passe hachés PBKDF2 — plus jamais en clair)
 */
const Auth = {
  STORAGE_KEY_SESSION: 'lago_current_session',
  STORAGE_KEY_LOCAL_USERS: 'lago_local_users',
  LEGACY_KEY_USERS: 'lago_users_db',
  STORAGE_KEY_ACTIVITY: 'lago_admin_activity_logs',

  DEMO_ACCOUNTS: [
    { id: 'usr_admin_001', name: 'Directrice LaGo', email: 'admin@lago.app', password: 'admin123', role: 'superadmin', age: 28 },
    { id: 'usr_sarah_002', name: 'Sarah', email: 'sarah@lago.app', password: 'user123', role: 'user', age: 17 },
    { id: 'usr_lea_003', name: 'Léa', email: 'lea@lago.app', password: 'user123', role: 'user', age: 16 }
  ],

  _expiring: false,

  get demoMode() {
    return Boolean((window.LAGO_CONFIG || {}).demoMode);
  },

  /**
   * Initialisation : migration des anciennes données, validation de la session,
   * connexion automatique au compte démo si activé.
   */
  async init() {
    await this.migrateLegacyStorage();

    const session = this.getCurrentUser();
    if (session && session.mode === 'server' && session.token) {
      Api.setToken(session.token);
      const res = await Api.me();
      if (res.ok && res.data && res.data.user) {
        this.saveSession({ ...session, ...res.data.user });
      } else if (!res.offline && (res.status === 401 || res.status === 403)) {
        this.clearSession();
      }
    }

    // Démo fluide : connexion automatique de Sarah au tout premier lancement
    if (!this.getCurrentUser() && this.demoMode && !Utils.readJSON('lago_demo_autologin_done', false)) {
      Utils.writeJSON('lago_demo_autologin_done', true);
      await this.login('sarah@lago.app', 'user123');
    }
  },

  /** Ancienne version : comptes (avec mots de passe en clair) copiés dans le navigateur. */
  async migrateLegacyStorage() {
    const legacy = Utils.readJSON(this.LEGACY_KEY_USERS, null);
    if (!Array.isArray(legacy)) return;
    const localUsers = this.getLocalUsers();
    for (const u of legacy) {
      if (!u || !u.email || localUsers.some(l => l.email === u.email.toLowerCase())) continue;
      try {
        localUsers.push({
          id: u.id, name: u.name, email: u.email.toLowerCase(), role: u.role || 'user',
          age: u.age, status: u.status || 'active', createdAt: u.createdAt || new Date().toISOString(),
          passwordHash: u.password ? await Utils.hashSecret(u.password) : null
        });
      } catch (e) { /* contexte non sécurisé : on ignore */ }
    }
    this.saveLocalUsers(localUsers);
    Utils.remove(this.LEGACY_KEY_USERS);
    // Nettoyage : la session ne doit plus contenir de mot de passe
    const session = this.getCurrentUser();
    if (session && session.password) {
      delete session.password;
      this.saveSession({ ...session, mode: session.mode || 'local' });
    }
  },

  // -------------------------------------------------------------------------
  // Session
  // -------------------------------------------------------------------------
  getCurrentUser() {
    return Utils.readJSON(this.STORAGE_KEY_SESSION, null);
  },

  saveSession(session) {
    Utils.writeJSON(this.STORAGE_KEY_SESSION, session);
    Api.setToken(session && session.token);
  },

  clearSession() {
    Utils.remove(this.STORAGE_KEY_SESSION);
    Api.setToken(null);
  },

  isSuperAdmin() {
    const user = this.getCurrentUser();
    return Boolean(user && user.role === 'superadmin');
  },

  isServerSession() {
    const user = this.getCurrentUser();
    return Boolean(user && user.mode === 'server' && user.token);
  },

  handleExpiredSession() {
    if (this._expiring) return;
    this._expiring = true;
    this.clearSession();
    window.dispatchEvent(new CustomEvent('lago:session-expired'));
    setTimeout(() => { this._expiring = false; }, 1000);
  },

  // -------------------------------------------------------------------------
  // Comptes locaux (mode hors-ligne)
  // -------------------------------------------------------------------------
  getLocalUsers() {
    const users = Utils.readJSON(this.STORAGE_KEY_LOCAL_USERS, []);
    return Array.isArray(users) ? users : [];
  },

  saveLocalUsers(users) {
    Utils.writeJSON(this.STORAGE_KEY_LOCAL_USERS, users);
  },

  /** Crée les comptes de démonstration sur l'appareil (mode démo hors-ligne uniquement). */
  async ensureLocalDemoAccounts() {
    if (!this.demoMode) return;
    const users = this.getLocalUsers();
    let changed = false;
    for (const demo of this.DEMO_ACCOUNTS) {
      if (users.some(u => u.email === demo.email)) continue;
      users.push({
        id: demo.id, name: demo.name, email: demo.email, role: demo.role, age: demo.age,
        status: 'active', createdAt: new Date().toISOString(),
        passwordHash: await Utils.hashSecret(demo.password)
      });
      changed = true;
      if (demo.id === 'usr_sarah_002' && typeof Tracker !== 'undefined') {
        Tracker.seedSampleData(demo.id);
      }
    }
    if (changed) this.saveLocalUsers(users);
  },

  toSession(user, mode, token) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      age: user.age,
      status: user.status || 'active',
      mode,
      token: token || null,
      loginAt: new Date().toISOString()
    };
  },

  // -------------------------------------------------------------------------
  // Connexion / Inscription / Déconnexion
  // -------------------------------------------------------------------------
  async login(email, password) {
    const cleanEmail = String(email || '').toLowerCase().trim();
    if (!cleanEmail || !password) return { success: false, message: 'Email et mot de passe requis.' };

    const res = await Api.login(cleanEmail, password);
    if (res.ok && res.data && res.data.user) {
      const session = this.toSession(res.data.user, 'server', res.data.token);
      this.saveSession(session);
      return { success: true, user: session };
    }
    if (!res.offline) {
      return { success: false, message: Api.message(res, 'Connexion impossible.') };
    }

    // Repli local : serveur injoignable
    try {
      await this.ensureLocalDemoAccounts();
    } catch (e) {
      return { success: false, message: 'Serveur injoignable et mode local indisponible sur ce navigateur.' };
    }
    const user = this.getLocalUsers().find(u => u.email === cleanEmail);
    if (!user || !(await Utils.verifySecret(password, user.passwordHash))) {
      return { success: false, message: 'Email ou mot de passe incorrect (mode hors-ligne).' };
    }
    if (user.status === 'blocked') {
      return { success: false, message: 'Ce compte a été suspendu par le Super Admin.' };
    }
    const session = this.toSession(user, 'local');
    this.saveSession(session);
    this.logActivity(`Connexion de ${user.name} (${user.role}) — mode local`);
    return { success: true, user: session, offline: true };
  },

  async register(name, email, password, age = 17) {
    const cleanName = String(name || '').trim();
    const cleanEmail = String(email || '').toLowerCase().trim();
    if (!cleanName) return { success: false, message: 'Le prénom est obligatoire.' };
    if (!Utils.isValidEmail(cleanEmail)) return { success: false, message: 'Adresse email invalide.' };
    if (!password || password.length < 6) {
      return { success: false, message: 'Le mot de passe doit contenir au moins 6 caractères.' };
    }

    const res = await Api.register(cleanName, cleanEmail, password, age);
    if (res.ok && res.data && res.data.user) {
      const session = this.toSession(res.data.user, 'server', res.data.token);
      this.saveSession(session);
      return { success: true, user: session };
    }
    if (!res.offline) {
      return { success: false, message: Api.message(res, 'Inscription impossible.') };
    }

    // Repli local
    const users = this.getLocalUsers();
    if (users.some(u => u.email === cleanEmail)) {
      return { success: false, message: 'Un compte existe déjà avec cette adresse email sur cet appareil.' };
    }
    let passwordHash;
    try {
      passwordHash = await Utils.hashSecret(password);
    } catch (e) {
      return { success: false, message: e.message };
    }
    const newUser = {
      id: 'usr_' + Date.now().toString(36),
      name: cleanName.slice(0, 60),
      email: cleanEmail,
      passwordHash,
      role: 'user',
      age: parseInt(age, 10) || null,
      createdAt: new Date().toISOString(),
      status: 'active'
    };
    users.push(newUser);
    this.saveLocalUsers(users);
    this.logActivity(`Inscription locale de ${newUser.name}`);
    const session = this.toSession(newUser, 'local');
    this.saveSession(session);
    return { success: true, user: session, offline: true };
  },

  logout() {
    const user = this.getCurrentUser();
    if (user) {
      this.logActivity(`Déconnexion de ${user.name}`);
      // Confidentialité : on retire du navigateur les données déjà sauvegardées sur le serveur
      if (user.mode === 'server' && typeof Tracker !== 'undefined') {
        Tracker.clearLocalCacheIfSynced(user.id);
      }
    }
    this.clearSession();
  },

  async changePassword(currentPassword, newPassword) {
    const user = this.getCurrentUser();
    if (!user) return { success: false, message: 'Non connectée.' };
    if (!newPassword || newPassword.length < 6) {
      return { success: false, message: 'Le nouveau mot de passe doit contenir au moins 6 caractères.' };
    }
    if (user.mode === 'server') {
      const res = await Api.changePassword(currentPassword, newPassword);
      if (res.ok) return { success: true };
      return { success: false, message: res.offline ? 'Connexion au serveur requise.' : Api.message(res, 'Échec.') };
    }
    const users = this.getLocalUsers();
    const local = users.find(u => u.id === user.id);
    if (!local || !(await Utils.verifySecret(currentPassword, local.passwordHash))) {
      return { success: false, message: 'Mot de passe actuel incorrect.' };
    }
    local.passwordHash = await Utils.hashSecret(newPassword);
    this.saveLocalUsers(users);
    return { success: true };
  },

  async deleteOwnAccount() {
    const user = this.getCurrentUser();
    if (!user) return { success: false, message: 'Non connectée.' };
    if (user.mode === 'server') {
      const res = await Api.deleteAccount();
      if (!res.ok) return { success: false, message: res.offline ? 'Connexion au serveur requise.' : Api.message(res, 'Échec.') };
    } else {
      const users = this.getLocalUsers();
      const self = users.find(u => u.id === user.id);
      if (self && self.role === 'superadmin' && users.filter(u => u.role === 'superadmin').length <= 1) {
        return { success: false, message: 'Impossible de supprimer le dernier Super Admin.' };
      }
      this.saveLocalUsers(users.filter(u => u.id !== user.id));
    }
    if (typeof Tracker !== 'undefined') Tracker.purgeUser(user.id);
    this.clearSession();
    return { success: true };
  },

  // -------------------------------------------------------------------------
  // Journal d'activité local (mode hors-ligne)
  // -------------------------------------------------------------------------
  logActivity(actionText) {
    const logs = Utils.readJSON(this.STORAGE_KEY_ACTIVITY, []);
    logs.unshift({ timestamp: new Date().toISOString(), action: actionText });
    Utils.writeJSON(this.STORAGE_KEY_ACTIVITY, logs.slice(0, 50));
  },

  getActivityLogs() {
    return Utils.readJSON(this.STORAGE_KEY_ACTIVITY, []);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Auth;
}
