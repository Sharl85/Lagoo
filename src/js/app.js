/**
 * LaGo 🌸 - Contrôleur principal (commun aux versions web et mobile)
 */
const App = {
  currentCycleData: null,
  activeDateForJournal: null,
  modalStack: [],

  async init() {
    Platform.init();
    this.initModals();
    this.initToastA11y();

    // 1. Authentification (session serveur, repli local, démo)
    await Auth.init();

    // 2. Préférences d'affichage de l'utilisatrice
    LotusAnimation.initPetals();
    this.applyUserPreferences();

    // 3. Interface
    this.updateUserProfileUI();
    this.refreshCycleData();
    this.initNavigation();
    this.initSettingsForm();
    this.initJournalModal();
    this.initAuthModal();
    this.initDataExportImport();
    this.initPrivacyAndTheme();
    this.initSecuritySection();
    this.initLockScreen();
    CalendarView.init(this.currentCycleData);

    window.addEventListener('lago:data-updated', () => this.onDataUpdated());
    window.addEventListener('lago:session-expired', () => {
      this.updateUserProfileUI();
      this.showToast('Votre session a expiré, reconnectez-vous.', 'info');
      this.openModal(document.getElementById('auth-modal'));
    });

    if (Auth.isSuperAdmin()) Admin.init();

    const user = Auth.getCurrentUser();
    if (!user) {
      this.openModal(document.getElementById('auth-modal'));
    } else {
      this.lockIfNeeded();
    }

    // Raccourci PWA / lien direct : index.html#journal
    if (location.hash === '#journal' && user) {
      this.openJournalModal(CycleCalculator.formatDateISO(new Date()));
      history.replaceState(null, '', location.pathname);
    }

    this.refreshIcons();
    this.syncNow(true);
    document.body.classList.add('app-ready');
    console.log(`🌸 LaGo ${(window.LAGO_CONFIG || {}).version || ''} (${Platform.isMobileBuild ? 'mobile' : 'web'}) initialisée.`);
  },

  refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  },

  // -------------------------------------------------------------------------
  // Synchronisation
  // -------------------------------------------------------------------------
  async syncNow(pull = false) {
    if (!Auth.isServerSession()) {
      this.setSyncStatus(Auth.getCurrentUser() ? 'local' : 'guest');
      return;
    }
    this.setSyncStatus('syncing');
    const state = await Tracker.sync({ pull });
    this.setSyncStatus(state === 'synced' ? 'synced' : state === 'offline' ? 'offline' : state === 'busy' ? 'syncing' : 'error');
  },

  setSyncStatus(state) {
    const el = document.getElementById('sync-status');
    if (!el) return;
    const labels = {
      synced: ['cloud', 'Données synchronisées'],
      syncing: ['refresh-cw', 'Synchronisation…'],
      offline: ['cloud-off', 'Hors-ligne — enregistré sur l’appareil'],
      error: ['alert-triangle', 'Synchronisation en attente'],
      local: ['smartphone', 'Mode local (sur cet appareil)'],
      guest: ['user', 'Invitée — données sur cet appareil']
    };
    const [icon, text] = labels[state] || labels.local;
    el.dataset.state = state;
    el.innerHTML = `<i data-lucide="${icon}" class="app-icon" style="width: 14px; height: 14px;"></i><span>${text}</span>`;
    this.refreshIcons();
  },

  onDataUpdated() {
    this.applyUserPreferences();
    this.refreshCycleData();
    this.fillSettingsForm();
    const calendarTab = document.getElementById('tab-calendar');
    if (calendarTab && calendarTab.classList.contains('active')) CalendarView.render();
  },

  // -------------------------------------------------------------------------
  // Préférences (thème, pétales)
  // -------------------------------------------------------------------------
  applyUserPreferences() {
    const settings = Tracker.getSettings();
    this.applyTheme(Boolean(settings.darkMode));
    const petals = settings.petalsEnabled !== false;
    LotusAnimation.toggle(petals);
    const petalsBtn = document.getElementById('toggle-petals-btn');
    if (petalsBtn) {
      petalsBtn.classList.toggle('active', petals);
      petalsBtn.setAttribute('aria-pressed', String(petals));
    }
  },

  applyTheme(isDark) {
    document.body.classList.toggle('dark-mode', isDark);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark ? '#1f141d' : '#f8bbd0');
    const themeBtn = document.getElementById('toggle-theme-btn');
    if (themeBtn) themeBtn.setAttribute('aria-pressed', String(isDark));
    Platform.applyStatusBarTheme(isDark);
  },

  // -------------------------------------------------------------------------
  // Profil (en-tête)
  // -------------------------------------------------------------------------
  updateUserProfileUI() {
    const user = Auth.getCurrentUser();
    const $ = id => document.getElementById(id);
    const nameEl = $('header-user-name');
    const avatarEl = $('header-user-avatar');
    const roleBadgeEl = $('header-user-role-badge');
    const dropdownNameEl = $('dropdown-user-fullname');
    const dropdownEmailEl = $('dropdown-user-email');
    const adminTabBtn = $('nav-tab-admin-btn');
    const dropdownAdminBtn = $('dropdown-admin-portal-btn');
    const logoutBtn = $('dropdown-logout-btn');
    const accountSection = $('account-security-section');

    const showAdmin = Boolean(user && user.role === 'superadmin');
    if (adminTabBtn) adminTabBtn.style.display = showAdmin ? 'flex' : 'none';
    if (dropdownAdminBtn) dropdownAdminBtn.style.display = showAdmin ? 'flex' : 'none';
    document.body.classList.toggle('is-admin', showAdmin);
    document.body.classList.toggle('is-guest', !user);

    if (!showAdmin) {
      const adminPane = $('tab-admin');
      if (adminPane && adminPane.classList.contains('active')) this.switchTab('tab-dashboard');
    }

    if (!user) {
      if (nameEl) nameEl.textContent = 'Connexion';
      if (roleBadgeEl) { roleBadgeEl.textContent = 'Invitée'; roleBadgeEl.className = 'user-profile-role-badge'; }
      if (avatarEl) { avatarEl.textContent = '👧'; avatarEl.style.background = 'var(--lotus-gradient)'; }
      if (dropdownNameEl) dropdownNameEl.textContent = 'Invitée';
      if (dropdownEmailEl) dropdownEmailEl.textContent = 'Non connectée';
      if (logoutBtn) logoutBtn.style.display = 'none';
      if (accountSection) accountSection.style.display = 'none';
      this.setSyncStatus('guest');
      return;
    }

    if (logoutBtn) logoutBtn.style.display = 'flex';
    if (accountSection) accountSection.style.display = '';
    if (nameEl) nameEl.textContent = user.name;
    if (dropdownNameEl) dropdownNameEl.textContent = user.name;
    if (dropdownEmailEl) dropdownEmailEl.textContent = user.email;

    if (showAdmin) {
      if (avatarEl) { avatarEl.textContent = '👑'; avatarEl.style.background = 'linear-gradient(135deg, #ffd54f, #d4a373)'; }
      if (roleBadgeEl) { roleBadgeEl.textContent = 'Super Admin 👑'; roleBadgeEl.className = 'user-profile-role-badge admin'; }
    } else {
      if (avatarEl) { avatarEl.textContent = '👧'; avatarEl.style.background = 'var(--lotus-gradient)'; }
      if (roleBadgeEl) {
        roleBadgeEl.textContent = user.age ? `${user.age} ans` : 'Membre';
        roleBadgeEl.className = 'user-profile-role-badge';
      }
    }
    this.refreshIcons();
  },

  // -------------------------------------------------------------------------
  // Tableau de bord
  // -------------------------------------------------------------------------
  refreshCycleData() {
    const settings = Tracker.getSettings();
    this.currentCycleData = CycleCalculator.calculateCycle(settings.lastPeriodDate, settings.cycleLength, settings.periodDuration);
    this.updateDashboardUI(this.currentCycleData);
    if (CalendarView.cycleData) CalendarView.updateCycleData(this.currentCycleData);
  },

  updateDashboardUI(data) {
    const $ = id => document.getElementById(id);
    const dayNumberEl = $('dial-day-number');
    const totalDaysEl = $('dial-total-days');
    const phaseBadgeEl = $('hero-phase-badge');
    const countdownTextEl = $('countdown-message');
    const ringProgress = $('ring-progress-circle');
    const fmt = (d, o) => CycleCalculator.formatDateFR(d, o);

    if (dayNumberEl) dayNumberEl.textContent = `Jour ${data.currentCycleDay}`;
    if (totalDaysEl) totalDaysEl.textContent = `sur ${data.cycleLength} jours`;

    if (ringProgress) {
      const circumference = 2 * Math.PI * 125;
      ringProgress.style.strokeDasharray = `${circumference} ${circumference}`;
      ringProgress.style.strokeDashoffset = circumference - (data.progressPercent / 100) * circumference;
    }

    if (phaseBadgeEl) {
      phaseBadgeEl.className = `cycle-phase-badge ${data.currentPhase.badgeClass}`;
      phaseBadgeEl.innerHTML = `<i data-lucide="flower-2" class="app-icon" style="width: 15px; height: 15px;"></i> <span>${Utils.escapeHtml(data.currentPhase.name)}</span>`;
    }

    LotusAnimation.updateLotusPhase(data.currentPhase.key);

    if (countdownTextEl) {
      const n = data.daysUntilNextPeriod;
      if (n === 0) {
        countdownTextEl.innerHTML = `<i data-lucide="sparkles" class="app-icon icon-rose" style="width: 16px; height: 16px;"></i> <span>Vos règles sont prévues <strong>aujourd'hui</strong>. Prenez soin de vous !</span>`;
      } else if (n > 0) {
        countdownTextEl.innerHTML = `<i data-lucide="clock" class="app-icon icon-rose" style="width: 16px; height: 16px;"></i> <span>Prochaines règles estimées dans <strong>${n} jour${n > 1 ? 's' : ''}</strong> (${fmt(data.nextPeriodStart)}).</span>`;
      } else {
        countdownTextEl.innerHTML = `<i data-lucide="flower-2" class="app-icon icon-rose" style="width: 16px; height: 16px;"></i> <span>Cycle en cours. Prochaines règles : <strong>${fmt(data.nextPeriodStart)}</strong>.</span>`;
      }
    }

    const setText = (id, text) => { const el = $(id); if (el) el.textContent = text; };
    setText('stat-next-period', fmt(data.nextPeriodStart, { day: 'numeric', month: 'short' }));
    setText('stat-ovulation', fmt(data.ovulationDate, { day: 'numeric', month: 'short' }));
    setText('stat-fertility', data.pregnancyChance);
    setText('stat-current-phase', data.currentPhase.name);
    setText('wisdom-phase-title', data.wisdom.title);
    setText('wisdom-advice-text', `« ${data.wisdom.advice} »`);
    setText('wisdom-nutrition-text', data.wisdom.nutrition);
    setText('wisdom-sport-text', data.wisdom.sport);

    this.renderForecastList();
    this.refreshIcons();
  },

  renderForecastList() {
    const container = document.getElementById('forecast-cycles-list');
    if (!container) return;
    const s = Tracker.getSettings();
    const fmt = (d, o) => CycleCalculator.formatDateFR(d, o);
    const short = { day: 'numeric', month: 'short' };
    const cycles = CycleCalculator.generateFutureCycles(s.lastPeriodDate, s.cycleLength, s.periodDuration, 6, true);

    container.innerHTML = cycles.map(c => `
      <div class="glass-card forecast-card">
        <div class="forecast-card-head">
          <h4><i data-lucide="flower" class="app-icon icon-rose" style="width: 16px; height: 16px;"></i> Cycle n°${c.cycleIndex}</h4>
          <span class="cycle-phase-badge badge-follicular" style="font-size: 0.75rem;">${fmt(c.periodStart, { month: 'long', year: 'numeric' })}</span>
        </div>
        <div class="forecast-card-grid">
          <div><i data-lucide="droplet" class="app-icon icon-rose" style="width: 15px; height: 15px;"></i>
            <span><strong>Règles :</strong> ${fmt(c.periodStart, short)} - ${fmt(c.periodEnd, short)}</span></div>
          <div><i data-lucide="sparkles" class="app-icon icon-purple" style="width: 15px; height: 15px;"></i>
            <span><strong>Ovulation :</strong> ${fmt(c.ovulationDate, short)}</span></div>
          <div><i data-lucide="sprout" class="app-icon icon-green" style="width: 15px; height: 15px;"></i>
            <span><strong>Fertilité :</strong> ${fmt(c.fertileStart, short)} - ${fmt(c.fertileEnd, short)}</span></div>
        </div>
      </div>`).join('');
    this.refreshIcons();
  },

  // -------------------------------------------------------------------------
  // Navigation par onglets (barre du haut sur web, barre du bas sur mobile)
  // -------------------------------------------------------------------------
  initNavigation() {
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });
    const brand = document.getElementById('brand-home-link');
    if (brand) {
      brand.addEventListener('click', () => this.switchTab('tab-dashboard'));
      brand.addEventListener('keydown', e => { if (e.key === 'Enter') this.switchTab('tab-dashboard'); });
    }
  },

  switchTab(targetTab) {
    if (targetTab === 'tab-admin' && !Auth.isSuperAdmin()) return;
    const pane = document.getElementById(targetTab);
    if (!pane) return;

    document.querySelectorAll('.nav-tab-btn').forEach(b => {
      const active = b.dataset.tab === targetTab;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    pane.classList.add('active');

    if (targetTab === 'tab-calendar') CalendarView.render();
    else if (targetTab === 'tab-admin') Admin.init();

    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    this.refreshIcons();
  },

  // -------------------------------------------------------------------------
  // Paramètres du cycle
  // -------------------------------------------------------------------------
  fillSettingsForm() {
    const s = Tracker.getSettings();
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('setting-lmp', s.lastPeriodDate);
    set('setting-cycle-length', s.cycleLength);
    set('setting-period-duration', s.periodDuration);
    const discreet = document.getElementById('setting-discreet');
    if (discreet) discreet.checked = Boolean(s.discreetMode);
    const reminders = document.getElementById('setting-reminders');
    if (reminders) reminders.checked = Boolean(s.remindersEnabled);
    const lmp = document.getElementById('setting-lmp');
    if (lmp) lmp.max = CycleCalculator.formatDateISO(new Date());
  },

  initSettingsForm() {
    this.fillSettingsForm();
    const form = document.getElementById('cycle-settings-form');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = '1';

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const lmp = document.getElementById('setting-lmp').value;
      const cycleLength = parseInt(document.getElementById('setting-cycle-length').value, 10);
      const periodDuration = parseInt(document.getElementById('setting-period-duration').value, 10);

      if (!Utils.parseISODate(lmp)) return this.showToast('Date des dernières règles invalide.', 'error');
      if (Utils.parseISODate(lmp) > new Date()) return this.showToast('La date des dernières règles ne peut pas être dans le futur.', 'error');
      if (!(cycleLength >= 20 && cycleLength <= 45)) return this.showToast('La durée du cycle doit être comprise entre 20 et 45 jours.', 'error');
      if (!(periodDuration >= 2 && periodDuration <= 10)) return this.showToast('La durée des règles doit être comprise entre 2 et 10 jours.', 'error');
      if (periodDuration >= cycleLength) return this.showToast('Les règles doivent être plus courtes que le cycle.', 'error');

      const updated = Tracker.saveSettings({ lastPeriodDate: lmp, cycleLength, periodDuration });
      if (updated) {
        this.refreshCycleData();
        this.rescheduleReminders();
        this.showToast('🌸 Paramètres du cycle enregistrés avec succès !');
      }
    });

    const discreet = document.getElementById('setting-discreet');
    if (discreet) {
      discreet.addEventListener('change', () => {
        Tracker.saveSettings({ discreetMode: discreet.checked });
        this.rescheduleReminders();
        this.showToast(discreet.checked ? 'Mode discret activé (notifications neutres).' : 'Mode discret désactivé.');
      });
    }

    const reminders = document.getElementById('setting-reminders');
    if (reminders) {
      if (!Platform.supportsReminders) {
        const block = document.getElementById('reminders-block');
        if (block) block.style.display = 'none';
      }
      reminders.addEventListener('change', async () => {
        Tracker.saveSettings({ remindersEnabled: reminders.checked });
        const res = await this.rescheduleReminders();
        if (res && !res.success) {
          reminders.checked = false;
          Tracker.saveSettings({ remindersEnabled: false });
          this.showToast(res.message, 'error');
        } else {
          this.showToast(reminders.checked ? `🔔 Rappels programmés${res && res.count ? ` (${res.count})` : ''}.` : 'Rappels désactivés.');
        }
      });
    }
  },

  async rescheduleReminders() {
    if (!Platform.supportsReminders) return null;
    try {
      return await Platform.scheduleReminders(Tracker.getSettings());
    } catch (e) {
      return { success: false, message: 'Impossible de programmer les rappels.' };
    }
  },

  // -------------------------------------------------------------------------
  // Fenêtres modales (gestion commune, touche Échap, bouton retour Android)
  // -------------------------------------------------------------------------
  initModals() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal && !modal.dataset.persistent) this.closeModal(modal);
      });
      modal.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => this.closeModal(modal));
      });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeTopModal();
    });
  },

  openModal(modal) {
    if (!modal) return;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    this.modalStack = this.modalStack.filter(m => m !== modal).concat(modal);
    document.body.classList.add('modal-open');
    const focusable = modal.querySelector('input:not([type=hidden]), select, textarea, button');
    if (focusable && !Platform.isMobileBuild) setTimeout(() => focusable.focus(), 50);
    this.refreshIcons();
  },

  closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    this.modalStack = this.modalStack.filter(m => m !== modal);
    if (!this.modalStack.length) document.body.classList.remove('modal-open');
    if (modal._onClose) { const cb = modal._onClose; modal._onClose = null; cb(); }
  },

  /** Ferme la fenêtre du dessus. Renvoie true si une fenêtre a été fermée. */
  closeTopModal() {
    const dropdown = document.getElementById('profile-dropdown');
    if (dropdown && dropdown.classList.contains('active')) {
      dropdown.classList.remove('active');
      return true;
    }
    const top = this.modalStack[this.modalStack.length - 1];
    if (!top || top.dataset.persistent) return false;
    this.closeModal(top);
    return true;
  },

  /** Boîte de confirmation (remplace window.confirm, fonctionne aussi dans l'app mobile). */
  confirmDialog(message, { danger = false, okLabel = 'Confirmer' } = {}) {
    const modal = document.getElementById('confirm-modal');
    if (!modal) return Promise.resolve(window.confirm(message));
    document.getElementById('confirm-modal-message').textContent = message;
    const okBtn = document.getElementById('confirm-modal-ok');
    okBtn.querySelector('span').textContent = okLabel;
    okBtn.classList.toggle('btn-danger-solid', danger);

    return new Promise(resolve => {
      let result = false;
      const onOk = () => { result = true; this.closeModal(modal); };
      okBtn.addEventListener('click', onOk, { once: true });
      modal._onClose = () => { okBtn.removeEventListener('click', onOk); resolve(result); };
      this.openModal(modal);
    });
  },

  // -------------------------------------------------------------------------
  // Journal quotidien
  // -------------------------------------------------------------------------
  initJournalModal() {
    const modal = document.getElementById('journal-modal');
    const quickLogTodayBtn = document.getElementById('quick-log-today-btn');
    const fab = document.getElementById('mobile-fab-log');

    [quickLogTodayBtn, fab].forEach(btn => {
      if (btn) btn.addEventListener('click', () => this.openJournalModal(CycleCalculator.formatDateISO(new Date())));
    });

    document.querySelectorAll('.symptom-pill').forEach(pill => {
      pill.setAttribute('role', 'checkbox');
      pill.setAttribute('tabindex', '0');
      pill.setAttribute('aria-checked', 'false');
      const toggle = () => {
        pill.classList.toggle('selected');
        pill.setAttribute('aria-checked', String(pill.classList.contains('selected')));
      };
      pill.addEventListener('click', toggle);
      pill.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } });
    });

    const saveBtn = document.getElementById('journal-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', () => this.saveCurrentJournalEntry());

    const deleteBtn = document.getElementById('journal-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (!this.activeDateForJournal) return;
        const date = this.activeDateForJournal;
        this.closeModal(modal);
        const ok = await this.confirmDialog('Supprimer cette entrée du journal ?', { danger: true, okLabel: 'Supprimer' });
        if (!ok) return;
        Tracker.deleteDayLog(date);
        this.showToast('Entrée du journal supprimée.');
        CalendarView.render();
      });
    }
  },

  openJournalModal(dateISO) {
    this.activeDateForJournal = dateISO;
    const modal = document.getElementById('journal-modal');
    if (!modal) return;
    const $ = id => document.getElementById(id);
    const dateObj = Utils.parseISODate(dateISO) || new Date();

    const title = $('journal-modal-title');
    if (title) {
      title.innerHTML = `<i data-lucide="calendar-heart" class="app-icon icon-rose" style="width: 20px; height: 20px;"></i> <span>Journal du ${Utils.escapeHtml(CycleCalculator.formatDateFR(dateObj))}</span>`;
    }

    document.querySelectorAll('.symptom-pill').forEach(p => {
      p.classList.remove('selected');
      p.setAttribute('aria-checked', 'false');
    });

    const log = Tracker.getLogForDate(dateISO);
    $('journal-flow').value = (log && log.flow) || 'none';
    $('journal-mood').value = (log && log.mood) || 'calm';
    $('journal-temp').value = (log && log.temperature) || '';
    $('journal-notes').value = (log && log.notes) || '';
    if (log && Array.isArray(log.symptoms)) {
      log.symptoms.forEach(key => {
        const pill = document.querySelector(`.symptom-pill[data-symptom="${CSS.escape(key)}"]`);
        if (pill) { pill.classList.add('selected'); pill.setAttribute('aria-checked', 'true'); }
      });
    }
    const deleteBtn = $('journal-delete-btn');
    if (deleteBtn) deleteBtn.style.display = log ? 'inline-flex' : 'none';

    this.openModal(modal);
  },

  saveCurrentJournalEntry() {
    if (!this.activeDateForJournal) return;
    const $ = id => document.getElementById(id);
    const tempRaw = $('journal-temp').value.trim().replace(',', '.');
    if (tempRaw) {
      const t = parseFloat(tempRaw);
      if (Number.isNaN(t) || t < 34 || t > 43) {
        return this.showToast('Température invalide (entre 34 et 43 °C).', 'error');
      }
    }

    const symptoms = Array.from(document.querySelectorAll('.symptom-pill.selected')).map(p => p.dataset.symptom);
    Tracker.saveDayLog(this.activeDateForJournal, {
      flow: $('journal-flow').value,
      mood: $('journal-mood').value,
      temperature: tempRaw,
      symptoms,
      notes: $('journal-notes').value.trim().slice(0, 2000)
    });
    this.showToast('✨ Journal LaGo enregistré avec succès !');
    this.closeModal($('journal-modal'));
    CalendarView.render();
  },

  // -------------------------------------------------------------------------
  // Connexion / Inscription / Démo
  // -------------------------------------------------------------------------
  initAuthModal() {
    const $ = id => document.getElementById(id);
    const authModal = $('auth-modal');
    const headerUserBtn = $('header-user-btn');
    const dropdown = $('profile-dropdown');
    const tabLogin = $('auth-tab-login');
    const tabRegister = $('auth-tab-register');
    const loginForm = $('auth-login-form');
    const registerForm = $('auth-register-form');
    const demoBox = $('quick-demo-box');

    if (demoBox && !Auth.demoMode) demoBox.style.display = 'none';

    if (headerUserBtn && dropdown) {
      headerUserBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!Auth.getCurrentUser()) {
          this.openModal(authModal);
          return;
        }
        dropdown.classList.toggle('active');
        headerUserBtn.setAttribute('aria-expanded', String(dropdown.classList.contains('active')));
      });
      document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target)) dropdown.classList.remove('active');
      });
    }

    const showTab = (login) => {
      tabLogin.classList.toggle('active', login);
      tabRegister.classList.toggle('active', !login);
      loginForm.style.display = login ? 'block' : 'none';
      registerForm.style.display = login ? 'none' : 'block';
    };
    if (tabLogin && tabRegister) {
      tabLogin.addEventListener('click', () => showTab(true));
      tabRegister.addEventListener('click', () => showTab(false));
    }

    const closeDropdown = () => dropdown && dropdown.classList.remove('active');

    const switchBtn = $('dropdown-switch-user-btn');
    if (switchBtn) switchBtn.addEventListener('click', () => { closeDropdown(); this.openModal(authModal); });

    const adminBtn = $('dropdown-admin-portal-btn');
    if (adminBtn) adminBtn.addEventListener('click', () => { closeDropdown(); this.switchTab('tab-admin'); });

    const settingsBtn = $('dropdown-settings-btn');
    if (settingsBtn) settingsBtn.addEventListener('click', () => { closeDropdown(); this.switchTab('tab-settings'); });

    const logoutBtn = $('dropdown-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        closeDropdown();
        Auth.logout();
        this.afterSessionChange();
        this.showToast('Déconnexion réussie.');
        this.openModal(authModal);
      });
    }

    const withBusy = async (form, fn) => {
      const btn = form.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      try { await fn(); } finally { if (btn) btn.disabled = false; }
    };

    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        withBusy(loginForm, async () => {
          const res = await Auth.login($('login-email').value, $('login-password').value);
          if (res.success) {
            loginForm.reset();
            this.handleSuccessfulAuth(res.user, res.offline);
          } else {
            this.showAuthError(res.message);
          }
        });
      });
    }

    if (registerForm) {
      registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        withBusy(registerForm, async () => {
          const res = await Auth.register($('reg-name').value, $('reg-email').value, $('reg-password').value, $('reg-age').value);
          if (res.success) {
            registerForm.reset();
            this.handleSuccessfulAuth(res.user, res.offline);
          } else {
            this.showAuthError(res.message);
          }
        });
      });
    }

    const quickUser = $('quick-login-user-btn');
    if (quickUser) quickUser.addEventListener('click', async () => {
      const res = await Auth.login('sarah@lago.app', 'user123');
      res.success ? this.handleSuccessfulAuth(res.user, res.offline) : this.showAuthError(res.message);
    });

    const quickAdmin = $('quick-login-admin-btn');
    if (quickAdmin) quickAdmin.addEventListener('click', async () => {
      const res = await Auth.login('admin@lago.app', 'admin123');
      res.success ? this.handleSuccessfulAuth(res.user, res.offline) : this.showAuthError(res.message);
    });
  },

  showAuthError(message) {
    const el = document.getElementById('auth-error');
    if (el) {
      el.textContent = message || 'Une erreur est survenue.';
      el.style.display = 'block';
    } else {
      this.showToast(message, 'error');
    }
  },

  afterSessionChange() {
    this.applyUserPreferences();
    this.updateUserProfileUI();
    this.refreshCycleData();
    this.fillSettingsForm();
    this.updatePinUI();
    CalendarView.render();
  },

  async handleSuccessfulAuth(user, offline) {
    const authModal = document.getElementById('auth-modal');
    const err = document.getElementById('auth-error');
    if (err) err.style.display = 'none';
    this.closeModal(authModal);
    this.afterSessionChange();

    if (user.role === 'superadmin') {
      Admin.init();
      this.showToast(`👑 Bienvenue Super Admin (${user.name}) !`);
    } else {
      this.showToast(`🌸 Bienvenue sur LaGo, ${user.name} !`);
    }
    if (offline) this.showToast('Serveur injoignable : mode local sur cet appareil.', 'info');

    await this.syncNow(true);
    this.rescheduleReminders();
  },

  // -------------------------------------------------------------------------
  // Export / Import / Réinitialisation
  // -------------------------------------------------------------------------
  initDataExportImport() {
    const $ = id => document.getElementById(id);
    const exportBtn = $('export-data-btn');
    const importInput = $('import-file-input');
    const importBtn = $('import-data-btn');
    const clearBtn = $('clear-data-btn');

    if (exportBtn) {
      exportBtn.addEventListener('click', async () => {
        try {
          const content = JSON.stringify(Tracker.buildExport(), null, 2);
          const shared = await Platform.saveFile(Tracker.exportFileName(), content);
          if (!shared) Tracker.exportDataJSON();
          this.showToast('📁 Sauvegarde LaGo exportée.');
        } catch (e) {
          if (!/cancel/i.test(e && e.message)) this.showToast('Export impossible : ' + e.message, 'error');
        }
      });
    }

    if (importBtn && importInput) {
      importBtn.addEventListener('click', () => importInput.click());
      importInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
          importInput.value = '';
          return this.showToast('Fichier trop volumineux (2 Mo max).', 'error');
        }
        const reader = new FileReader();
        reader.onload = (event) => {
          const result = Tracker.importDataJSON(event.target.result);
          this.showToast(result.message, result.success ? 'success' : 'error');
          if (result.success) this.onDataUpdated();
          importInput.value = '';
        };
        reader.readAsText(file);
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        const ok = await this.confirmDialog('Voulez-vous vraiment effacer vos données personnelles LaGo (paramètres et journal) ?', { danger: true, okLabel: 'Effacer' });
        if (!ok) return;
        const res = await Tracker.clearAllData();
        this.onDataUpdated();
        this.showToast(res.success ? 'Vos données ont été réinitialisées.' : 'Effacé sur l’appareil ; le serveur sera mis à jour à la prochaine connexion.', res.success ? 'success' : 'info');
      });
    }
  },

  // -------------------------------------------------------------------------
  // Thème, pétales, mode discret
  // -------------------------------------------------------------------------
  initPrivacyAndTheme() {
    const petalsBtn = document.getElementById('toggle-petals-btn');
    const themeBtn = document.getElementById('toggle-theme-btn');
    const hideBtn = document.getElementById('quick-hide-btn');

    if (petalsBtn) {
      petalsBtn.addEventListener('click', () => {
        const enabled = Tracker.getSettings().petalsEnabled === false;
        Tracker.saveSettings({ petalsEnabled: enabled });
        this.applyUserPreferences();
        this.showToast(enabled ? '🌸 Pluie de pétales activée' : 'Pétales désactivés');
      });
    }

    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const isDark = !Tracker.getSettings().darkMode;
        Tracker.saveSettings({ darkMode: isDark });
        this.applyTheme(isDark);
        this.showToast(isDark ? '🌙 Mode Nuit Rosé activé' : '☀️ Mode Jour Aurore activé');
      });
    }

    if (hideBtn) hideBtn.addEventListener('click', () => Platform.quickHide());
  },

  // -------------------------------------------------------------------------
  // Sécurité du compte : code PIN, mot de passe, suppression du compte
  // -------------------------------------------------------------------------
  initSecuritySection() {
    const $ = id => document.getElementById(id);

    const pinForm = $('pin-form');
    if (pinForm) {
      pinForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pin = $('pin-new').value.trim();
        const confirmPin = $('pin-confirm').value.trim();
        if (pin !== confirmPin) return this.showToast('Les deux codes ne correspondent pas.', 'error');
        try {
          const res = await Tracker.setPin(pin);
          if (!res.success) return this.showToast(res.message, 'error');
        } catch (err) {
          return this.showToast(err.message, 'error');
        }
        pinForm.reset();
        this.updatePinUI();
        this.showToast('🔒 Code PIN activé. Il sera demandé à l’ouverture de LaGo.');
      });
    }

    const removePin = $('pin-remove-btn');
    if (removePin) {
      removePin.addEventListener('click', async () => {
        const ok = await this.confirmDialog('Désactiver le verrouillage par code PIN ?');
        if (!ok) return;
        Tracker.removePin();
        this.updatePinUI();
        this.showToast('Code PIN désactivé.');
      });
    }

    const pwdForm = $('password-form');
    if (pwdForm) {
      pwdForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const res = await Auth.changePassword($('pwd-current').value, $('pwd-new').value);
        if (res.success) {
          pwdForm.reset();
          this.showToast('Mot de passe modifié.');
        } else {
          this.showToast(res.message, 'error');
        }
      });
    }

    const deleteAccount = $('delete-account-btn');
    if (deleteAccount) {
      deleteAccount.addEventListener('click', async () => {
        const ok = await this.confirmDialog('Supprimer définitivement votre compte LaGo et toutes vos données ? Cette action est irréversible.', { danger: true, okLabel: 'Supprimer mon compte' });
        if (!ok) return;
        const res = await Auth.deleteOwnAccount();
        if (!res.success) return this.showToast(res.message, 'error');
        this.afterSessionChange();
        this.showToast('Votre compte a été supprimé.');
        this.openModal(document.getElementById('auth-modal'));
      });
    }

    this.updatePinUI();
  },

  updatePinUI() {
    const hasPin = Boolean(Tracker.getPinHash());
    const status = document.getElementById('pin-status');
    const removeBtn = document.getElementById('pin-remove-btn');
    if (status) status.textContent = hasPin ? 'Activé — demandé à chaque ouverture' : 'Désactivé';
    if (status) status.dataset.active = String(hasPin);
    if (removeBtn) removeBtn.style.display = hasPin ? 'inline-flex' : 'none';
  },

  initLockScreen() {
    const form = document.getElementById('lock-form');
    const input = document.getElementById('lock-pin-input');
    const forgot = document.getElementById('lock-forgot-btn');
    const lock = document.getElementById('lock-screen');
    if (!form || !lock) return;

    document.querySelectorAll('[data-pin-key]').forEach(key => {
      key.addEventListener('click', () => {
        const k = key.dataset.pinKey;
        if (k === 'del') input.value = input.value.slice(0, -1);
        else if (input.value.length < 6) input.value += k;
        if (input.value.length >= 4) this.tryUnlock(true);
      });
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.tryUnlock(false);
    });

    if (forgot) {
      forgot.addEventListener('click', async () => {
        // Réinitialisation : déconnexion + suppression du PIN (le mot de passe du compte reste nécessaire)
        Tracker.removePin();
        Auth.logout();
        lock.classList.remove('active');
        document.body.classList.remove('locked');
        this.afterSessionChange();
        this.openModal(document.getElementById('auth-modal'));
        this.showToast('Reconnectez-vous avec votre mot de passe.', 'info');
      });
    }
  },

  async tryUnlock(silent) {
    const input = document.getElementById('lock-pin-input');
    const lock = document.getElementById('lock-screen');
    const err = document.getElementById('lock-error');
    const ok = await Tracker.checkPin(input.value);
    if (ok) {
      input.value = '';
      if (err) err.textContent = '';
      lock.classList.remove('active');
      document.body.classList.remove('locked');
    } else if (!silent || input.value.length >= 6) {
      input.value = '';
      if (err) err.textContent = 'Code incorrect, réessayez.';
      lock.classList.add('shake');
      setTimeout(() => lock.classList.remove('shake'), 400);
    }
  },

  lockIfNeeded(force = false) {
    const lock = document.getElementById('lock-screen');
    if (!lock || !Auth.getCurrentUser() || !Tracker.getPinHash()) return;
    if (!force && lock.classList.contains('active')) return;
    lock.classList.add('active');
    document.body.classList.add('locked');
    const input = document.getElementById('lock-pin-input');
    if (input) { input.value = ''; if (!Platform.isMobileBuild) input.focus(); }
    this.refreshIcons();
  },

  // -------------------------------------------------------------------------
  // Notifications Toast
  // -------------------------------------------------------------------------
  initToastA11y() {
    const container = document.getElementById('toast-container');
    if (container) {
      container.setAttribute('role', 'status');
      container.setAttribute('aria-live', 'polite');
    }
  },

  showToast(message, type = 'success', duration = 3200) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { success: '🌸', error: '⚠️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = document.createElement('span');
    icon.textContent = icons[type] || '🌸';
    const text = document.createElement('span');
    text.textContent = message;
    toast.append(icon, text);
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init().catch(err => console.error('[LaGo] Erreur au démarrage :', err));
});
