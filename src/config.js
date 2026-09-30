/**
 * LaGo - Configuration par défaut.
 * Ce fichier est régénéré par `npm run build` (dist/web et dist/mobile).
 * En version web servie par server.js, /config.js est fourni dynamiquement.
 *
 *  platform   : 'web' | 'mobile'
 *  apiBaseUrl : URL du serveur API ('' = même origine ; obligatoire pour l'app mobile
 *               si l'on veut la synchronisation, sinon l'app fonctionne 100 % en local)
 *  demoMode   : affiche les accès démo 1-clic et connecte Sarah au premier lancement
 */
window.LAGO_CONFIG = Object.assign({
  platform: 'web',
  apiBaseUrl: '',
  demoMode: true,
  version: '3.0.0'
}, window.LAGO_CONFIG || {});
