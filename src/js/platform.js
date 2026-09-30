/**
 * LaGo 🌸 - Couche plateforme (Web / PWA / Application mobile Capacitor)
 * Tout ce qui diffère entre la version web et la version mobile est centralisé ici.
 */
const Platform = {
  REMINDER_ID_BASE: 7100,

  get config() {
    return window.LAGO_CONFIG || {};
  },

  /** true dans l'application Android/iOS compilée avec Capacitor */
  get isNative() {
    return Boolean(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
  },

  get isMobileBuild() {
    return this.config.platform === 'mobile' || this.isNative;
  },

  plugin(name) {
    return this.isNative && window.Capacitor.Plugins ? window.Capacitor.Plugins[name] : null;
  },

  init() {
    const body = document.body;
    body.classList.add(this.isMobileBuild ? 'platform-mobile' : 'platform-web');
    if (this.isNative) body.classList.add('is-native');
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) body.classList.add('is-standalone');

    // Retour du réseau -> synchronisation des modifications faites hors-ligne
    window.addEventListener('online', () => {
      Tracker.sync().then(state => { if (state === 'synced') App.setSyncStatus('synced'); });
    });
    window.addEventListener('offline', () => App.setSyncStatus('offline'));

    if (this.isNative) {
      this.initNative();
    } else {
      this.initPwa();
    }
  },

  // -------------------------------------------------------------------------
  // Mobile natif
  // -------------------------------------------------------------------------
  initNative() {
    const StatusBar = this.plugin('StatusBar');
    const SplashScreen = this.plugin('SplashScreen');
    const CapApp = this.plugin('App');

    if (StatusBar) {
      StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
      this.applyStatusBarTheme(document.body.classList.contains('dark-mode'));
    }
    if (SplashScreen) setTimeout(() => SplashScreen.hide().catch(() => {}), 300);

    if (CapApp) {
      // Bouton retour Android : ferme la fenêtre ouverte, sinon revient au tableau de bord, sinon réduit l'app
      CapApp.addListener('backButton', () => {
        if (App.closeTopModal()) return;
        const active = document.querySelector('.nav-tab-btn.active');
        if (active && active.dataset.tab !== 'tab-dashboard') {
          App.switchTab('tab-dashboard');
          return;
        }
        CapApp.minimizeApp().catch(() => CapApp.exitApp());
      });

      // Retour dans l'app : verrouillage PIN + synchronisation
      CapApp.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
          this.backgroundAt = Date.now();
          return;
        }
        if (this.backgroundAt && Date.now() - this.backgroundAt > 30000) App.lockIfNeeded();
        Tracker.sync({ pull: true });
      });
    }
  },

  applyStatusBarTheme(isDark) {
    const StatusBar = this.plugin('StatusBar');
    if (!StatusBar) return;
    StatusBar.setStyle({ style: isDark ? 'DARK' : 'LIGHT' }).catch(() => {});
    StatusBar.setBackgroundColor({ color: isDark ? '#1f141d' : '#fce4ec' }).catch(() => {});
  },

  // -------------------------------------------------------------------------
  // Web / PWA
  // -------------------------------------------------------------------------
  initPwa() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:' && this.config.platform !== 'mobile') {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then((reg) => {
          // Nouvelle version disponible -> proposer le rechargement
          reg.addEventListener('updatefound', () => {
            const worker = reg.installing;
            if (!worker) return;
            worker.addEventListener('statechange', () => {
              if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                App.showToast('Nouvelle version de LaGo disponible — rechargez la page.', 'info', 8000);
              }
            });
          });
        }).catch((err) => console.log('[PWA] Service worker non enregistré :', err.message));
      });
    }

    let deferredPrompt = null;
    const installBtn = document.getElementById('pwa-install-btn');
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (installBtn) installBtn.style.display = 'inline-flex';
    });
    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        installBtn.style.display = 'none';
        deferredPrompt.prompt();
        await deferredPrompt.userChoice.catch(() => null);
        deferredPrompt = null;
      });
    }
    window.addEventListener('appinstalled', () => {
      if (installBtn) installBtn.style.display = 'none';
      App.showToast('🌸 LaGo est installée sur votre appareil !');
    });
  },

  // -------------------------------------------------------------------------
  // Fonctions communes à comportement différent
  // -------------------------------------------------------------------------

  /** Mode discret instantané */
  quickHide() {
    if (this.isNative) {
      App.lockIfNeeded(true);
      const CapApp = this.plugin('App');
      if (CapApp) CapApp.minimizeApp().catch(() => {});
      return;
    }
    document.body.style.display = 'none';
    window.location.replace('https://www.google.com');
  },

  /** Export d'un fichier : téléchargement (web) ou partage natif (mobile) */
  async saveFile(fileName, content) {
    const Filesystem = this.plugin('Filesystem');
    const Share = this.plugin('Share');
    if (Filesystem && Share) {
      const written = await Filesystem.writeFile({ path: fileName, data: content, directory: 'CACHE', encoding: 'utf8' });
      await Share.share({ title: 'Sauvegarde LaGo', url: written.uri, dialogTitle: 'Enregistrer ma sauvegarde LaGo' });
      return true;
    }
    return false;
  },

  get supportsReminders() {
    return Boolean(this.plugin('LocalNotifications'));
  },

  /**
   * Programme les rappels locaux (application mobile) :
   * 2 jours avant les règles et le jour J, sur les 3 prochains cycles.
   */
  async scheduleReminders(settings) {
    const LN = this.plugin('LocalNotifications');
    if (!LN) return { success: false, message: 'Rappels disponibles dans l’application mobile.' };

    // Annule les anciens rappels LaGo
    try {
      const pending = await LN.getPending();
      const ours = (pending.notifications || []).filter(n => n.id >= this.REMINDER_ID_BASE && n.id < this.REMINDER_ID_BASE + 100);
      if (ours.length) await LN.cancel({ notifications: ours.map(n => ({ id: n.id })) });
    } catch (e) { /* ignore */ }

    if (!settings.remindersEnabled) return { success: true };

    const perm = await LN.requestPermissions();
    if (perm.display !== 'granted') {
      return { success: false, message: 'Autorisez les notifications de LaGo dans les réglages du téléphone.' };
    }

    const discreet = Boolean(settings.discreetMode);
    const cycles = CycleCalculator.generateFutureCycles(settings.lastPeriodDate, settings.cycleLength, settings.periodDuration, 4, true);
    const now = new Date();
    const notifications = [];
    let id = this.REMINDER_ID_BASE;

    cycles.forEach(c => {
      const before = CycleCalculator.addDays(c.periodStart, -2);
      before.setHours(9, 0, 0, 0);
      const dayOf = new Date(c.periodStart);
      dayOf.setHours(8, 30, 0, 0);
      if (before > now) {
        notifications.push({
          id: id++,
          title: discreet ? 'LaGo 🌸' : 'Règles dans 2 jours 🌸',
          body: discreet ? 'Petit rappel bien-être du jour.' : 'Pensez à prévoir vos protections et à prendre soin de vous.',
          schedule: { at: before, allowWhileIdle: true }
        });
      }
      if (dayOf > now) {
        notifications.push({
          id: id++,
          title: discreet ? 'LaGo 🌸' : 'Règles prévues aujourd’hui',
          body: discreet ? 'Un moment pour vous aujourd’hui.' : 'Notez votre flux et vos sensations dans votre journal LaGo.',
          schedule: { at: dayOf, allowWhileIdle: true }
        });
      }
    });

    if (notifications.length) await LN.schedule({ notifications });
    return { success: true, count: notifications.length };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Platform;
}
