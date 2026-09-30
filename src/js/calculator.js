/**
 * LaGo 🌸 - Moteur de Calcul & Prévisions du Cycle Menstruel
 * Algorithmes basés sur la physiologie gynécologique standard
 */

const CycleCalculator = {
  // Constantes par défaut
  DEFAULT_CYCLE_LENGTH: 28,
  DEFAULT_PERIOD_DURATION: 5,
  LUTEAL_PHASE_DURATION: 14, // Phase lutéale typique de 14 jours avant les règles suivantes

  /**
   * Nettoie et formate une date en objet Date à minuit (heure locale)
   */
  normalizeDate(dateInput) {
    let d;
    if (!dateInput) {
      d = new Date();
    } else if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      // 'AAAA-MM-JJ' interprété en heure locale (évite le décalage d'un jour lié à l'UTC)
      const [y, m, day] = dateInput.split('-').map(Number);
      return new Date(y, m - 1, day);
    } else {
      d = new Date(dateInput);
    }
    if (Number.isNaN(d.getTime())) d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  },

  /**
   * Ajoute ou soustrait des jours à une date
   */
  addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  },

  /**
   * Différence en jours entiers entre deux dates
   */
  diffInDays(dateA, dateB) {
    const normA = this.normalizeDate(dateA);
    const normB = this.normalizeDate(dateB);
    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.round((normA - normB) / msPerDay);
  },

  /**
   * Formate une date en chaîne lisible en français
   */
  formatDateFR(date, options = { day: 'numeric', month: 'long', year: 'numeric' }) {
    if (!date) return '';
    return new Intl.DateTimeFormat('fr-FR', options).format(date);
  },

  /**
   * Formate une date au format YYYY-MM-DD
   */
  formatDateISO(date) {
    if (!date) return '';
    const d = this.normalizeDate(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  /**
   * Calcule toutes les métriques et dates clés pour le cycle en cours et à venir
   */
  calculateCycle(lastPeriodStartDate, cycleLength = 28, periodDuration = 5, targetDate = new Date()) {
    const today = this.normalizeDate(targetDate);
    let lmp = this.normalizeDate(lastPeriodStartDate);
    cycleLength = parseInt(cycleLength, 10) || this.DEFAULT_CYCLE_LENGTH;
    periodDuration = parseInt(periodDuration, 10) || this.DEFAULT_PERIOD_DURATION;

    cycleLength = Math.min(60, Math.max(15, cycleLength));
    periodDuration = Math.min(cycleLength - 1, Math.max(1, periodDuration));

    // Recale la date de référence sur le cycle en cours (passé lointain ou date future)
    let daysSinceLMP = this.diffInDays(today, lmp);
    if (daysSinceLMP >= cycleLength || daysSinceLMP < 0) {
      const shift = Math.floor(daysSinceLMP / cycleLength);
      lmp = this.addDays(lmp, shift * cycleLength);
      daysSinceLMP = this.diffInDays(today, lmp);
    }

    // Dates clés du cycle courant
    const currentPeriodStart = lmp;
    const currentPeriodEnd = this.addDays(lmp, periodDuration - 1);
    
    // Prochaines règles
    const nextPeriodStart = this.addDays(lmp, cycleLength);
    const nextPeriodEnd = this.addDays(nextPeriodStart, periodDuration - 1);

    // Ovulation : survient environ 14 jours avant les règles suivantes
    // (jamais pendant les règles, même pour les cycles très courts)
    const ovulationDate = this.addDays(lmp, this.ovulationOffset(cycleLength, periodDuration));

    // Fenêtre de fertilité : 5 jours avant l'ovulation + le jour même + 1 jour après
    const fertileStart = this.addDays(ovulationDate, -5);
    const fertileEnd = this.addDays(ovulationDate, 1);

    // Jour actuel dans le cycle (Jour 1 = premier jour des règles)
    const currentCycleDay = daysSinceLMP + 1;
    const progressPercent = Math.min(100, Math.max(0, Math.round((currentCycleDay / cycleLength) * 100)));

    // Décompte de jours
    const daysUntilNextPeriod = this.diffInDays(nextPeriodStart, today);
    const daysUntilOvulation = this.diffInDays(ovulationDate, today);

    // Détermination de la Phase en cours
    let currentPhase = {
      key: 'follicular',
      name: 'Phase Folliculaire',
      badgeClass: 'badge-follicular',
      lotusStage: 'lotus-stage-follicular',
      summary: 'Énergie montante, créativité et renouveau.',
      color: '#81c784'
    };

    if (currentCycleDay <= periodDuration) {
      currentPhase = {
        key: 'menstrual',
        name: 'Phase Menstruelle',
        badgeClass: 'badge-menstrual',
        lotusStage: 'lotus-stage-menstrual',
        summary: 'Repos, écoute de son corps et douceur.',
        color: '#e57373'
      };
    } else if (today >= fertileStart && today <= fertileEnd) {
      currentPhase = {
        key: 'ovulation',
        name: 'Phase Ovulatoire',
        badgeClass: 'badge-ovulation',
        lotusStage: 'lotus-stage-ovulation',
        summary: 'Pic d’énergie, sociabilité et fertilité maximale.',
        color: '#ba68c8'
      };
    } else if (today > fertileEnd) {
      currentPhase = {
        key: 'luteal',
        name: 'Phase Lutéale',
        badgeClass: 'badge-luteal',
        lotusStage: 'lotus-stage-luteal',
        summary: 'Ralentissement, cocooning et préparation au nouveau cycle.',
        color: '#ffb74d'
      };
    }

    // Probabilité de conception pour la journée
    let pregnancyChance = 'Très faible';
    let pregnancyChanceClass = 'low';
    if (this.diffInDays(today, ovulationDate) === 0) {
      pregnancyChance = 'Maximale (Jour d\'ovulation)';
      pregnancyChanceClass = 'peak';
    } else if (today >= fertileStart && today <= fertileEnd) {
      pregnancyChance = 'Élevée (Fenêtre fertile)';
      pregnancyChanceClass = 'high';
    } else if (this.diffInDays(today, fertileStart) >= -2 && today < fertileStart) {
      pregnancyChance = 'Moyenne';
      pregnancyChanceClass = 'medium';
    }

    // Conseils bien-être & nutrition personnalisés selon la phase
    const wisdom = this.getPhaseWisdom(currentPhase.key);

    return {
      currentCycleDay,
      cycleLength,
      periodDuration,
      progressPercent,
      currentPeriodStart,
      currentPeriodEnd,
      nextPeriodStart,
      nextPeriodEnd,
      ovulationDate,
      fertileStart,
      fertileEnd,
      daysUntilNextPeriod,
      daysUntilOvulation,
      currentPhase,
      pregnancyChance,
      pregnancyChanceClass,
      wisdom
    };
  },

  /**
   * Génère les prévisions pour les X prochains mois
   */
  generateFutureCycles(lastPeriodStartDate, cycleLength = 28, periodDuration = 5, monthsCount = 6, fromToday = false) {
    const cycles = [];
    cycleLength = Math.min(60, Math.max(15, parseInt(cycleLength, 10) || this.DEFAULT_CYCLE_LENGTH));
    periodDuration = Math.min(cycleLength - 1, Math.max(1, parseInt(periodDuration, 10) || this.DEFAULT_PERIOD_DURATION));
    let currentStart = this.normalizeDate(lastPeriodStartDate);

    // Option : commencer au cycle en cours plutôt qu'à la date saisie
    if (fromToday) {
      const elapsed = this.diffInDays(new Date(), currentStart);
      if (elapsed >= cycleLength || elapsed < 0) {
        currentStart = this.addDays(currentStart, Math.floor(elapsed / cycleLength) * cycleLength);
      }
    }

    for (let i = 0; i < monthsCount; i++) {
      const periodStart = this.addDays(currentStart, cycleLength * i);
      const periodEnd = this.addDays(periodStart, periodDuration - 1);
      const ovulationDate = this.addDays(periodStart, this.ovulationOffset(cycleLength, periodDuration));
      const fertileStart = this.addDays(ovulationDate, -5);
      const fertileEnd = this.addDays(ovulationDate, 1);

      cycles.push({
        cycleIndex: i + 1,
        periodStart,
        periodEnd,
        ovulationDate,
        fertileStart,
        fertileEnd
      });
    }

    return cycles;
  },

  /**
   * Nombre de jours entre le début des règles et l'ovulation estimée.
   */
  ovulationOffset(cycleLength, periodDuration) {
    return Math.max(periodDuration, cycleLength - this.LUTEAL_PHASE_DURATION);
  },

  /**
   * Retourne le statut d'un jour précis pour le calendrier
   */
  getDayStatus(date, cycleData) {
    const d = this.normalizeDate(date);
    const dateISO = this.formatDateISO(d);

    // Vérification si le jour tombe dans les règles courantes
    if (d >= cycleData.currentPeriodStart && d <= cycleData.currentPeriodEnd) {
      return { type: 'period', label: 'Règles en cours' };
    }

    // Prochaines règles prévues
    if (d >= cycleData.nextPeriodStart && d <= cycleData.nextPeriodEnd) {
      return { type: 'period-predicted', label: 'Règles prévues' };
    }

    // Jour d'ovulation
    if (this.diffInDays(d, cycleData.ovulationDate) === 0) {
      return { type: 'ovulation', label: 'Ovulation estimée' };
    }

    // Fenêtre fertile
    if (d >= cycleData.fertileStart && d <= cycleData.fertileEnd) {
      return { type: 'fertile', label: 'Période fertile' };
    }

    return { type: 'normal', label: '' };
  },

  /**
   * Fiches de conseils holistiques par phase
   */
  getPhaseWisdom(phaseKey) {
    const wisdoms = {
      menstrual: {
        title: "Phase Menstruelle (L'Hiver Intérieur)",
        energy: "Douce & Calme",
        hormones: "Baisse des œstrogènes et de la progestérone",
        nutrition: "Aliments riches en fer (lentilles, épinards), bouillons chauds, chocolat noir, tisanes de feuilles de framboisier et camomille.",
        sport: "Marche tranquille, étirements doux, yoga restauratif, respiration profonde.",
        advice: "Accordez-vous de la bienveillance et du repos. C'est le moment idéal pour ralentir et écouter vos besoins profonds."
      },
      follicular: {
        title: "Phase Folliculaire (Le Printemps Intérieur)",
        energy: "Montante & Créative",
        hormones: "Augmentation progressive des œstrogènes",
        nutrition: "Aliments frais, graines de courge et de lin (seed cycling), protéines légères, agrumes et légumes verts croquants.",
        sport: "Cardio, danse, renforcement musculaire, randonnée rythmée.",
        advice: "Votre clarté mentale et votre enthousiasme sont au plus haut. Idéal pour démarrer de nouveaux projets ou planifier vos objectifs."
      },
      ovulation: {
        title: "Phase Ovulatoire (L'Été Intérieur)",
        energy: "Rayonnante & Magnétique",
        hormones: "Pic d'œstrogènes et poussée de LH",
        nutrition: "Aliments riches en antioxydants (baies, grenade), fibres douces, hydratation renforcée à l'eau infusée.",
        sport: "HIIT, séances intenses, sports collectifs, dépassement de soi.",
        advice: "Vous êtes à l'apogée de votre sociabilité et de votre confiance. Parfait pour les présentations, rencontres et moments festifs !"
      },
      luteal: {
        title: "Phase Lutéale (L'Automne Intérieur)",
        energy: "Centrée & Réflexive",
        hormones: "Hausse de la progestérone puis chute avant les règles",
        nutrition: "Magnésium (graines de tournesol, bananes), glucides complexes (patate douce, avoine), tisanes de mélisse et gingembre.",
        sport: "Pilates, natation douce, renforcement modéré, étirements.",
        advice: "Créez un environnement chaleureux et apaisant. Prenez soin de vos émotions, privilégiez le confort et les nuits réparatrices."
      }
    };

    return wisdoms[phaseKey] || wisdoms.follicular;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CycleCalculator;
}
