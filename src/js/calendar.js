/**
 * LaGo 🌸 - Calendrier Menstruel Interactif
 */

const CalendarView = {
  currentDate: new Date(),
  selectedDate: new Date(),
  cycleData: null,

  init(cycleData) {
    this.cycleData = cycleData;
    const now = new Date();
    this.currentDate = new Date(now.getFullYear(), now.getMonth(), 1);
    this.render();
    this.bindEvents();
  },

  /** Change de mois sans débordement (ex. 31 janvier -> février). */
  shiftMonth(delta) {
    this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + delta, 1);
    this.render();
  },

  updateCycleData(newCycleData) {
    this.cycleData = newCycleData;
    this.render();
  },

  bindEvents() {
    if (this.eventsBound) return;
    this.eventsBound = true;
    const prevBtn = document.getElementById('cal-prev-month');
    const nextBtn = document.getElementById('cal-next-month');
    const todayBtn = document.getElementById('cal-today-btn');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        this.shiftMonth(-1);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        this.shiftMonth(1);
      });
    }

    // Balayage gauche/droite sur mobile pour changer de mois
    const grid = document.getElementById('calendar-days-container');
    if (grid) {
      let startX = null;
      grid.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
      grid.addEventListener('touchend', (e) => {
        if (startX === null) return;
        const dx = e.changedTouches[0].clientX - startX;
        startX = null;
        if (Math.abs(dx) < 60) return;
        this.shiftMonth(dx < 0 ? 1 : -1);
      }, { passive: true });
    }

    if (todayBtn) {
      todayBtn.addEventListener('click', () => {
        const now = new Date();
        this.currentDate = new Date(now.getFullYear(), now.getMonth(), 1);
        this.render();
      });
    }
  },

  render() {
    const monthYearEl = document.getElementById('calendar-month-year');
    const daysContainer = document.getElementById('calendar-days-container');
    if (!daysContainer) return;

    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();

    // Titre Mois Année en français
    if (monthYearEl) {
      const monthName = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(this.currentDate);
      monthYearEl.textContent = monthName;
    }

    daysContainer.innerHTML = '';

    // Premier jour du mois et nombre de jours
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const totalDays = lastDay.getDate();

    // Jour de la semaine du 1er jour (0 = Dimanche, 1 = Lundi, etc.)
    // En France la semaine commence le lundi (1)
    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6; // Dimanche devient index 6

    // Cellules vides avant le 1er jour
    for (let i = 0; i < startDayOfWeek; i++) {
      const emptyCell = document.createElement('div');
      emptyCell.className = 'calendar-day-cell empty';
      daysContainer.appendChild(emptyCell);
    }

    const todayISO = CycleCalculator.formatDateISO(new Date());
    const allLogs = Tracker.getAllLogs();
    const settings = Tracker.getSettings();

    // Prévision des cycles pour couvrir l'affichage
    const futureCycles = CycleCalculator.generateFutureCycles(
      settings.lastPeriodDate,
      settings.cycleLength,
      settings.periodDuration,
      24
    );

    // Rendu des jours du mois
    for (let day = 1; day <= totalDays; day++) {
      const cellDate = new Date(year, month, day);
      const dateISO = CycleCalculator.formatDateISO(cellDate);
      const cell = document.createElement('div');
      cell.className = 'calendar-day-cell';
      cell.dataset.date = dateISO;

      // Est-ce aujourd'hui ?
      if (dateISO === todayISO) {
        cell.classList.add('today');
      }

      // Détermination du statut de cycle pour ce jour précis
      this.applyCycleStatus(cell, cellDate, futureCycles);

      // Vérification s'il y a un journal enregistré
      const log = allLogs[dateISO];
      if (log) {
        cell.classList.add('has-log');
        // Règles réellement notées dans le journal
        if (log.flow && log.flow !== 'none' && log.flow !== 'spotting') {
          cell.classList.remove('period-predicted', 'fertile-day', 'ovulation-day');
          cell.classList.add('period-day');
        }
      }

      // Construction du contenu HTML de la cellule
      let indicatorsHtml = '<div class="day-indicators-row">';
      if (log) {
        if (log.flow && log.flow !== 'none') {
          indicatorsHtml += '<span class="indicator-dot indicator-period" title="Flux"></span>';
        }
        if (log.symptoms && log.symptoms.length > 0) {
          indicatorsHtml += '<span class="indicator-dot indicator-symptom" title="Symptômes"></span>';
        }
        if (log.mood) {
          indicatorsHtml += `<span class="day-symptom-icon" title="Humeur">${this.getMoodEmoji(log.mood)}</span>`;
        }
      }
      indicatorsHtml += '</div>';

      cell.innerHTML = `
        <span class="day-number">${day}</span>
        ${indicatorsHtml}
      `;

      // Clic (ou Entrée) pour ouvrir le journal du jour
      cell.setAttribute('role', 'button');
      cell.setAttribute('tabindex', '0');
      cell.setAttribute('aria-label', CycleCalculator.formatDateFR(cellDate) + (log ? ' — journal rempli' : ''));
      cell.addEventListener('click', () => {
        App.openJournalModal(dateISO);
      });
      cell.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          App.openJournalModal(dateISO);
        }
      });

      daysContainer.appendChild(cell);
    }

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  },

  applyCycleStatus(cell, date, cycles) {
    const d = CycleCalculator.normalizeDate(date);

    for (const cycle of cycles) {
      // Période des règles
      if (d >= cycle.periodStart && d <= cycle.periodEnd) {
        if (d <= CycleCalculator.normalizeDate(new Date())) {
          cell.classList.add('period-day');
        } else {
          cell.classList.add('period-predicted');
        }
        return;
      }

      // Jour d'ovulation
      if (CycleCalculator.diffInDays(d, cycle.ovulationDate) === 0) {
        cell.classList.add('ovulation-day');
        return;
      }

      // Fenêtre fertile
      if (d >= cycle.fertileStart && d <= cycle.fertileEnd) {
        cell.classList.add('fertile-day');
        return;
      }
    }
  },

  getMoodEmoji(moodKey) {
    const map = {
      calm: '🌸',
      happy: '✨',
      energetic: '⚡',
      sensitive: '🥺',
      tired: '😴',
      stressed: '🌧️',
      irritated: '⚡',
      romantic: '💖'
    };
    return map[moodKey] || '📝';
  }
};
