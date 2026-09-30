/**
 * LaGo 🌸 - Système d'Animation : Fleurs de Lotus & Pluie de Pétales
 */

const LotusAnimation = {
  canvas: null,
  ctx: null,
  petals: [],
  maxPetals: 26,
  animationFrameId: null,
  isRunning: false,

  /**
   * Initialise le canvas de pétales flottants
   */
  initPetals() {
    this.canvas = document.getElementById('petals-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    // Moins de pétales sur petit écran (batterie), aucun si l'utilisatrice préfère réduire les animations
    if (window.innerWidth < 700) this.maxPetals = 14;
    this.reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    // Pause de l'animation quand l'app est en arrière-plan
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pausedByVisibility = this.isRunning;
        this.stop();
      } else if (this.pausedByVisibility) {
        this.pausedByVisibility = false;
        this.start();
      }
    });

    this.createPetals();
    if (!this.reducedMotion) this.start();
  },

  resizeCanvas() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  },

  createPetals() {
    this.petals = [];
    for (let i = 0; i < this.maxPetals; i++) {
      this.petals.push(this.generatePetal());
    }
  },

  generatePetal() {
    const width = this.canvas ? this.canvas.width : window.innerWidth;
    const height = this.canvas ? this.canvas.height : window.innerHeight;

    return {
      x: Math.random() * width,
      y: Math.random() * -height, // commence au-dessus de l'écran
      size: 10 + Math.random() * 14,
      speedY: 0.6 + Math.random() * 1.2,
      speedX: -0.4 + Math.random() * 0.8,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.02,
      opacity: 0.35 + Math.random() * 0.45,
      hueVariation: Math.random() * 20 - 10 // variations rosées délicates
    };
  },

  drawPetal(p) {
    this.ctx.save();
    this.ctx.translate(p.x, p.y);
    this.ctx.rotate(p.rotation);
    this.ctx.globalAlpha = p.opacity;

    // Dégradé rosé doux pour le pétale
    const gradient = this.ctx.createRadialGradient(0, 0, 0, 0, 0, p.size);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.4, '#f8bbd0');
    gradient.addColorStop(1, '#f48fb1');

    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();

    // Forme d'un pétale de lotus
    this.ctx.moveTo(0, -p.size);
    this.ctx.quadraticCurveTo(p.size * 0.6, -p.size * 0.3, p.size * 0.5, p.size * 0.5);
    this.ctx.quadraticCurveTo(0, p.size, 0, p.size);
    this.ctx.quadraticCurveTo(-p.size * 0.5, p.size * 0.5, -p.size * 0.6, -p.size * 0.3);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.restore();
  },

  updatePetals() {
    if (!this.canvas) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let i = 0; i < this.petals.length; i++) {
      const p = this.petals[i];
      p.y += p.speedY;
      p.x += Math.sin(p.y * 0.005) * 0.8 + p.speedX;
      p.rotation += p.rotationSpeed;

      // Si le pétale sort de l'écran, on le réinitialise en haut
      if (p.y > this.canvas.height + 20 || p.x < -30 || p.x > this.canvas.width + 30) {
        this.petals[i] = this.generatePetal();
        this.petals[i].y = -20;
      }

      this.drawPetal(p);
    }
  },

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    const loop = () => {
      if (!this.isRunning) return;
      this.updatePetals();
      this.animationFrameId = requestAnimationFrame(loop);
    };
    loop();
  },

  stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  },

  toggle(enable) {
    if (enable) {
      document.body.classList.remove('no-petals');
      if (!this.reducedMotion) this.start();
    } else {
      document.body.classList.add('no-petals');
      this.stop();
    }
  },

  /**
   * Met à jour la fleur de lotus centrale selon la phase active
   */
  updateLotusPhase(phaseKey) {
    const avatar = document.getElementById('lotus-interactive-avatar');
    if (!avatar) return;

    // Retrait des anciennes classes de stade
    avatar.classList.remove(
      'lotus-stage-menstrual',
      'lotus-stage-follicular',
      'lotus-stage-ovulation',
      'lotus-stage-luteal'
    );

    // Ajout du nouveau stade
    avatar.classList.add(`lotus-stage-${phaseKey}`);
  }
};
