#!/usr/bin/env node
/**
 * LaGo 🌸 - Construction des deux versions à partir du code partagé (src/)
 *
 *   node scripts/build.js          -> dist/web + dist/mobile
 *   node scripts/build.js web      -> dist/web     (servie par server.js / Docker / hébergement statique + API)
 *   node scripts/build.js mobile   -> dist/mobile  (embarquée dans l'application Android via Capacitor)
 *
 * Réglages : lago.config.json, surchargeables par variables d'environnement :
 *   LAGO_API_URL   URL publique de l'API pour l'app mobile (ex. https://api.monsite.com)
 *   LAGO_WEB_API_URL  URL de l'API pour la version web si elle est hébergée ailleurs (défaut : même origine)
 *   DEMO_MODE=false   masque les comptes de démonstration
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const pkg = require(path.join(ROOT, 'package.json'));

function readConfig() {
  const file = path.join(ROOT, 'lago.config.json');
  const cfg = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : {};
  const demoEnv = process.env.DEMO_MODE;
  const demo = (v) => (demoEnv === undefined ? v !== false : demoEnv !== 'false');
  return {
    web: {
      platform: 'web',
      apiBaseUrl: process.env.LAGO_WEB_API_URL || (cfg.web && cfg.web.apiBaseUrl) || '',
      demoMode: demo(cfg.web && cfg.web.demoMode),
      version: pkg.version
    },
    mobile: {
      platform: 'mobile',
      apiBaseUrl: process.env.LAGO_API_URL || (cfg.mobile && cfg.mobile.apiBaseUrl) || '',
      demoMode: demo(cfg.mobile && cfg.mobile.demoMode),
      version: pkg.version
    }
  };
}

function copyDir(from, to, filter) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    const rel = path.relative(SRC, src).split(path.sep).join('/');
    if (filter && !filter(rel, entry)) continue;
    if (entry.isDirectory()) copyDir(src, dst, filter);
    else fs.copyFileSync(src, dst);
  }
}

function listFiles(dir, base = dir) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(listFiles(full, base));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out.sort();
}

function hashDir(dir) {
  const h = crypto.createHash('sha256');
  listFiles(dir).forEach(f => h.update(f).update(fs.readFileSync(path.join(dir, f))));
  return h.digest('hex').slice(0, 10);
}

function writeConfig(outDir, config) {
  fs.writeFileSync(
    path.join(outDir, 'config.js'),
    `/* Généré par scripts/build.js — ne pas modifier à la main */\nwindow.LAGO_CONFIG = Object.assign(${JSON.stringify(config, null, 2)}, window.LAGO_CONFIG || {});\n`
  );
}

function buildWeb(config) {
  const out = path.join(DIST, 'web');
  fs.rmSync(out, { recursive: true, force: true });
  copyDir(SRC, out);
  writeConfig(out, config);

  // Service worker : version de cache + liste des fichiers à précharger
  const version = `${pkg.version}-${hashDir(out)}`;
  const assets = ['./'].concat(listFiles(out).filter(f => f !== 'sw.js' && !f.endsWith('.map')).map(f => './' + f));
  const sw = fs.readFileSync(path.join(out, 'sw.js'), 'utf-8')
    .replace('__BUILD_VERSION__', version)
    .replace('__ASSET_LIST__', JSON.stringify(assets, null, 2));
  fs.writeFileSync(path.join(out, 'sw.js'), sw);
  console.log(`✅ Version web   -> dist/web     (cache ${version}, ${assets.length} fichiers)`);
}

function buildMobile(config) {
  const out = path.join(DIST, 'mobile');
  fs.rmSync(out, { recursive: true, force: true });
  // Le service worker et le manifeste PWA sont inutiles dans l'application native
  copyDir(SRC, out, rel => rel !== 'sw.js' && rel !== 'manifest.json');
  writeConfig(out, config);

  let html = fs.readFileSync(path.join(out, 'index.html'), 'utf-8');
  const connect = ["'self'"];
  if (config.apiBaseUrl) connect.push(new URL(config.apiBaseUrl).origin);
  const csp = [
    "default-src 'self'",
    // 'unsafe-inline' requis : Capacitor injecte son pont natif en script inline
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connect.join(' ')}`
  ].join('; ');
  html = html
    .replace('<link rel="manifest" href="manifest.json">\n', '')
    .replace('<meta charset="UTF-8">', `<meta charset="UTF-8">\n  <meta http-equiv="Content-Security-Policy" content="${csp}">`)
    .replace('<body>', '<body class="platform-mobile">');
  fs.writeFileSync(path.join(out, 'index.html'), html);

  console.log(`✅ Version mobile -> dist/mobile  (API : ${config.apiBaseUrl || 'aucune — mode 100 % local sur le téléphone'})`);
}

const target = process.argv[2] || 'all';
const config = readConfig();
if (target === 'web' || target === 'all') buildWeb(config.web);
if (target === 'mobile' || target === 'all') buildMobile(config.mobile);
if (!['web', 'mobile', 'all'].includes(target)) {
  console.error('Usage : node scripts/build.js [web|mobile|all]');
  process.exit(1);
}
