/**
 * LaGo 🌸 - Panneau Super Admin
 * - Session serveur : toutes les opérations passent par l'API (droits vérifiés côté serveur)
 * - Session locale (hors-ligne) : gestion des comptes enregistrés sur cet appareil
 */
const Admin = {
  eventsBound: false,
  users: [],

  get isRemote() {
    return Auth.isServerSession();
  },

  async init() {
    if (!Auth.isSuperAdmin()) return;
    this.bindEvents();
    await this.refresh();
  },

  async refresh() {
    const modeEl = document.getElementById('admin-data-source');
    if (modeEl) {
      modeEl.textContent = this.isRemote ? 'Base de données serveur' : 'Comptes de cet appareil (mode hors-ligne)';
    }
    await this.renderKPIs();          // charge this.users + statistiques
    await this.renderUsersTable();
    await this.renderActivityLogs();
  },

  // -------------------------------------------------------------------------
  // Source de données
  // -------------------------------------------------------------------------
  async fetchUsers() {
    if (this.isRemote) {
      const res = await Api.getAdminUsers();
      if (res.ok) return res.data.users;
      if (!res.offline) App.showToast(Api.message(res, 'Accès refusé.'), 'error');
      return [];
    }
    return Auth.getLocalUsers().map(u => ({
      id: u.id, name: u.name, email: u.email, role: u.role, age: u.age,
      status: u.status || 'active', createdAt: u.createdAt,
      logsCount: Object.keys(Utils.readJSON(`lago_logs_${u.id}`, {}) || {}).length
    }));
  },

  async fetchStats(users) {
    if (this.isRemote) {
      const res = await Api.getAdminStats();
      if (res.ok) return res.data.stats;
    }
    const counts = {};
    let totalLogs = 0;
    users.forEach(u => {
      const logs = Utils.readJSON(`lago_logs_${u.id}`, {}) || {};
      Object.values(logs).forEach(entry => {
        totalLogs++;
        (entry.symptoms || []).forEach(s => { counts[s] = (counts[s] || 0) + 1; });
      });
    });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return {
      totalUsers: users.length,
      superAdmins: users.filter(u => u.role === 'superadmin').length,
      blockedUsers: users.filter(u => u.status === 'blocked').length,
      totalLogs,
      topSymptom: top ? { key: top[0], label: this.symptomLabel(top[0]), count: top[1] } : null,
      activityLogs: Auth.getActivityLogs()
    };
  },

  symptomLabel(key) {
    const pill = document.querySelector(`.symptom-pill[data-symptom="${key}"]`);
    return pill ? pill.textContent.trim() : key;
  },

  // -------------------------------------------------------------------------
  // Rendu
  // -------------------------------------------------------------------------
  async renderKPIs() {
    this.users = await this.fetchUsers();
    const stats = await this.fetchStats(this.users);
    this.lastStats = stats;

    const set = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    set('admin-kpi-total-users', stats.totalUsers);
    set('admin-kpi-total-logs', stats.totalLogs);
    set('admin-kpi-top-symptom', stats.topSymptom ? `${stats.topSymptom.label} (${stats.topSymptom.count})` : '—');
    set('admin-kpi-admins', `${stats.superAdmins} Super Admin${stats.superAdmins > 1 ? 's' : ''}`);
  },

  async renderUsersTable() {
    const tableBody = document.getElementById('admin-users-table-body');
    if (!tableBody) return;
    const users = this.users;
    const currentUser = Auth.getCurrentUser();
    const esc = Utils.escapeHtml;

    if (!users.length) {
      tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--text-muted);">Aucune utilisatrice à afficher.</td></tr>`;
      return;
    }

    tableBody.innerHTML = users.map(user => {
      const isSelf = currentUser && currentUser.id === user.id;
      const isAdmin = user.role === 'superadmin';
      const isBlocked = user.status === 'blocked';
      const created = user.createdAt
        ? CycleCalculator.formatDateFR(new Date(user.createdAt), { day: 'numeric', month: 'short', year: 'numeric' })
        : '—';

      return `
        <tr>
          <td data-label="Utilisatrice">
            <div style="display: flex; align-items: center; gap: 0.6rem;">
              <div class="user-avatar-circle" style="background: ${isAdmin ? 'linear-gradient(135deg, #ffd54f, #d4a373)' : 'var(--lotus-gradient)'};">
                ${isAdmin ? '👑' : '👧'}
              </div>
              <div>
                <strong>${esc(user.name)}</strong> ${isSelf ? '<span style="font-size:0.75rem; color: var(--primary-pink);">(Vous)</span>' : ''}
                <div style="font-size: 0.78rem; color: var(--text-muted);">${esc(user.email)}</div>
              </div>
            </div>
          </td>
          <td data-label="Âge">${user.age ? esc(user.age) + ' ans' : '—'}</td>
          <td data-label="Rôle"><span class="role-pill ${isAdmin ? 'badge-admin' : 'badge-user'}">${isAdmin ? '👑 Super Admin' : '🌸 Utilisatrice'}</span></td>
          <td data-label="Statut">
            <span class="status-indicator ${isBlocked ? 'status-blocked' : 'status-active'}">${isBlocked ? '■ Suspendu' : '● Actif'}</span>
          </td>
          <td data-label="Inscription" style="font-size: 0.85rem; color: var(--text-muted);">${esc(created)}</td>
          <td data-label="Actions">
            <div style="display: flex; gap: 0.35rem; align-items: center;">
              ${isSelf ? '<span style="font-size: 0.78rem; color: var(--text-light); font-style: italic;">Compte actif</span>' : `
                <button class="btn-table-action" data-admin-action="role" data-user-id="${esc(user.id)}" title="${isAdmin ? 'Rétrograder en utilisatrice' : 'Promouvoir Super Admin'}" aria-label="Changer le rôle">
                  <i data-lucide="${isAdmin ? 'arrow-down-circle' : 'shield-alert'}" class="app-icon" style="width: 15px; height: 15px;"></i>
                </button>
                <button class="btn-table-action" data-admin-action="status" data-user-id="${esc(user.id)}" title="${isBlocked ? 'Réactiver le compte' : 'Suspendre le compte'}" aria-label="Suspendre ou réactiver">
                  <i data-lucide="${isBlocked ? 'unlock' : 'ban'}" class="app-icon" style="width: 15px; height: 15px;"></i>
                </button>
                <button class="btn-table-action btn-danger" data-admin-action="delete" data-user-id="${esc(user.id)}" title="Supprimer le compte" aria-label="Supprimer">
                  <i data-lucide="trash-2" class="app-icon" style="width: 15px; height: 15px;"></i>
                </button>`}
            </div>
          </td>
        </tr>`;
    }).join('');

    App.refreshIcons();
  },

  async renderActivityLogs() {
    const container = document.getElementById('admin-activity-logs-list');
    if (!container) return;
    const logs = (this.lastStats && this.lastStats.activityLogs) || Auth.getActivityLogs();
    if (!logs.length) {
      container.innerHTML = `<p style="font-size: 0.85rem; color: var(--text-muted); font-style: italic;">Aucune activité récente enregistrée.</p>`;
      return;
    }
    const fmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit' });
    container.innerHTML = logs.map(l => `
      <div class="activity-log-item">
        <span class="log-timestamp">[${Utils.escapeHtml(fmt.format(new Date(l.timestamp)))}]</span>
        <span class="log-text">${Utils.escapeHtml(l.action)}</span>
      </div>`).join('');
  },

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------
  findUser(userId) {
    return this.users.find(u => u.id === userId);
  },

  async toggleUserRole(userId) {
    const user = this.findUser(userId);
    if (!user) return;
    const newRole = user.role === 'superadmin' ? 'user' : 'superadmin';
    const ok = await App.confirmDialog(`Attribuer le rôle « ${newRole === 'superadmin' ? 'Super Admin' : 'Utilisatrice'} » à ${user.name} ?`);
    if (!ok) return;

    if (this.isRemote) {
      const res = await Api.updateUserRole(userId, newRole);
      if (!res.ok) return App.showToast(Api.message(res, 'Serveur injoignable.'), 'error');
    } else {
      const users = Auth.getLocalUsers();
      const target = users.find(u => u.id === userId);
      if (!target) return;
      if (target.role === 'superadmin' && users.filter(u => u.role === 'superadmin').length <= 1) {
        return App.showToast('Impossible de rétrograder le dernier Super Admin.', 'error');
      }
      target.role = newRole;
      Auth.saveLocalUsers(users);
      Auth.logActivity(`Rôle de ${target.name} changé en ${newRole}`);
    }
    await this.refresh();
    App.showToast(`Rôle de ${user.name} mis à jour.`);
  },

  async toggleUserStatus(userId) {
    const user = this.findUser(userId);
    if (!user) return;
    const newStatus = user.status === 'blocked' ? 'active' : 'blocked';
    const ok = await App.confirmDialog(newStatus === 'blocked'
      ? `Suspendre le compte de ${user.name} ? Elle ne pourra plus se connecter.`
      : `Réactiver le compte de ${user.name} ?`);
    if (!ok) return;

    if (this.isRemote) {
      const res = await Api.updateUserStatus(userId, newStatus);
      if (!res.ok) return App.showToast(Api.message(res, 'Serveur injoignable.'), 'error');
    } else {
      const users = Auth.getLocalUsers();
      const target = users.find(u => u.id === userId);
      if (!target) return;
      target.status = newStatus;
      Auth.saveLocalUsers(users);
      Auth.logActivity(`Compte de ${target.name} ${newStatus === 'blocked' ? 'suspendu' : 'réactivé'}`);
    }
    await this.refresh();
    App.showToast(`Compte de ${user.name} ${newStatus === 'blocked' ? 'suspendu' : 'réactivé'}.`);
  },

  async confirmDeleteUser(userId) {
    const user = this.findUser(userId);
    if (!user) return;
    const ok = await App.confirmDialog(`Supprimer définitivement le compte de ${user.name} et toutes ses données ?`, { danger: true });
    if (!ok) return;

    if (this.isRemote) {
      const res = await Api.deleteUser(userId);
      if (!res.ok) return App.showToast(Api.message(res, 'Serveur injoignable.'), 'error');
    } else {
      const users = Auth.getLocalUsers();
      const target = users.find(u => u.id === userId);
      if (!target) return;
      if (target.role === 'superadmin' && users.filter(u => u.role === 'superadmin').length <= 1) {
        return App.showToast('Impossible de supprimer le dernier Super Admin.', 'error');
      }
      Auth.saveLocalUsers(users.filter(u => u.id !== userId));
      Tracker.purgeUser(userId);
      Auth.logActivity(`Utilisateur ${target.name} supprimé`);
    }
    await this.refresh();
    App.showToast(`Compte de ${user.name} supprimé.`);
  },

  async createUser(form) {
    const name = form.name.trim();
    const email = form.email.toLowerCase().trim();
    const password = form.password;
    const age = parseInt(form.age, 10) || null;

    if (!name || !Utils.isValidEmail(email) || !password || password.length < 6) {
      App.showToast('Prénom, email valide et mot de passe (6 caractères min.) requis.', 'error');
      return false;
    }

    if (this.isRemote) {
      const res = await Api.createUser(name, email, password, age);
      if (!res.ok) {
        App.showToast(Api.message(res, 'Serveur injoignable.'), 'error');
        return false;
      }
    } else {
      // Création locale SANS changer la session du Super Admin
      const users = Auth.getLocalUsers();
      if (users.some(u => u.email === email)) {
        App.showToast('Un compte existe déjà avec cet email.', 'error');
        return false;
      }
      users.push({
        id: 'usr_' + Date.now().toString(36), name, email, role: 'user', age,
        status: 'active', createdAt: new Date().toISOString(),
        passwordHash: await Utils.hashSecret(password)
      });
      Auth.saveLocalUsers(users);
      Auth.logActivity(`Création manuelle de ${name} par le Super Admin`);
    }
    await this.refresh();
    App.showToast(`Utilisatrice ${name} créée avec succès !`);
    return true;
  },

  bindEvents() {
    if (this.eventsBound) return;
    this.eventsBound = true;

    // Délégation d'événements (plus de onclick inline -> compatible CSP stricte)
    const tableBody = document.getElementById('admin-users-table-body');
    if (tableBody) {
      tableBody.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-admin-action]');
        if (!btn) return;
        const id = btn.dataset.userId;
        const action = btn.dataset.adminAction;
        if (action === 'role') this.toggleUserRole(id);
        else if (action === 'status') this.toggleUserStatus(id);
        else if (action === 'delete') this.confirmDeleteUser(id);
      });
    }

    const createUserBtn = document.getElementById('admin-create-user-btn');
    const createModal = document.getElementById('admin-create-modal');
    const createForm = document.getElementById('admin-create-form');
    if (createUserBtn && createModal) {
      createUserBtn.addEventListener('click', () => {
        if (createForm) createForm.reset();
        App.openModal(createModal);
      });
    }
    if (createForm) {
      createForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = createForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;
        const ok = await this.createUser({
          name: createForm.elements['admin-new-name'].value,
          email: createForm.elements['admin-new-email'].value,
          password: createForm.elements['admin-new-password'].value,
          age: createForm.elements['admin-new-age'].value
        });
        if (submitBtn) submitBtn.disabled = false;
        if (ok) App.closeModal(createModal);
      });
    }

    const refreshLogsBtn = document.getElementById('admin-refresh-logs-btn');
    if (refreshLogsBtn) {
      refreshLogsBtn.addEventListener('click', async () => {
        await this.refresh();
        App.showToast('Données et statistiques actualisées !');
      });
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Admin;
}
