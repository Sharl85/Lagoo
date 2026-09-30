'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 18000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lago-test-'));
let proc;

async function api(method, url, body, token) {
  const res = await fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, data: await res.json().catch(() => null), headers: res.headers };
}

test.before(async () => {
  proc = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR, DEMO_MODE: 'true' },
    stdio: 'ignore'
  });
  for (let i = 0; i < 50; i++) {
    try { await fetch(BASE + '/api/health'); return; } catch (e) { await new Promise(r => setTimeout(r, 100)); }
  }
  throw new Error('Serveur non démarré');
});

test.after(() => {
  proc.kill();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

test('les mots de passe sont hachés dans la base', () => {
  const db = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'lago_database.json'), 'utf-8'));
  db.users.forEach(u => {
    assert.strictEqual(u.password, undefined);
    assert.match(u.passwordHash, /^scrypt\$/);
  });
});

test('la base de données et le code serveur ne sont pas téléchargeables', async () => {
  for (const url of ['/data/lago_database.json', '/server/server.js', '/data/.secret', '/../data/lago_database.json']) {
    const res = await fetch(BASE + url);
    const text = await res.text();
    assert.ok(!text.includes('passwordHash'), url);
    assert.ok(!text.includes('LAGO_SECRET'), url);
  }
});

test('connexion : mauvais mot de passe refusé, bon mot de passe -> jeton', async () => {
  const bad = await api('POST', '/api/auth/login', { email: 'sarah@lago.app', password: 'nope' });
  assert.strictEqual(bad.status, 401);
  const ok = await api('POST', '/api/auth/login', { email: 'SARAH@lago.app ', password: 'user123' });
  assert.strictEqual(ok.status, 200);
  assert.ok(ok.data.token);
  assert.strictEqual(ok.data.user.passwordHash, undefined);
});

test('les routes protégées exigent un jeton', async () => {
  assert.strictEqual((await api('GET', '/api/cycle/logs')).status, 401);
  assert.strictEqual((await api('GET', '/api/admin/users')).status, 401);
  assert.strictEqual((await api('POST', '/api/admin/user/role', { userId: 'usr_sarah_002', role: 'superadmin' })).status, 401);
});

test('une utilisatrice ne peut ni accéder à l’admin ni lire les données des autres', async () => {
  const { data } = await api('POST', '/api/auth/login', { email: 'lea@lago.app', password: 'user123' });
  assert.strictEqual((await api('GET', '/api/admin/users', null, data.token)).status, 403);
  // ?userId est ignoré : on ne récupère que ses propres données
  const logs = await api('GET', '/api/cycle/logs?userId=usr_sarah_002', null, data.token);
  assert.deepStrictEqual(logs.data.logs, {});
});

test('journal : enregistrement validé et nettoyé', async () => {
  const { data } = await api('POST', '/api/auth/login', { email: 'lea@lago.app', password: 'user123' });
  const r = await api('POST', '/api/cycle/logs', {
    date: '2026-09-10',
    data: { flow: 'medium', mood: '<script>', symptoms: ['cramps', 'hack'], temperature: '99', notes: 'ok' }
  }, data.token);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.log.mood, 'calm');
  assert.deepStrictEqual(r.data.log.symptoms, ['cramps']);
  assert.strictEqual(r.data.log.temperature, '');
  const bad = await api('POST', '/api/cycle/logs', { date: '2026-13-45', data: {} }, data.token);
  assert.strictEqual(bad.status, 400);
});

test('inscription puis import / synchronisation', async () => {
  const reg = await api('POST', '/api/auth/register', { name: 'Camille', email: 'camille@test.fr', password: 'secret1', age: 19 });
  assert.strictEqual(reg.status, 201);
  const dup = await api('POST', '/api/auth/register', { name: 'X', email: 'camille@test.fr', password: 'secret1' });
  assert.strictEqual(dup.status, 409);
  const imp = await api('POST', '/api/cycle/import', {
    settings: { lastPeriodDate: '2026-09-01', cycleLength: 30, periodDuration: 5, pinCode: '1234' },
    logs: { '2026-09-01': { flow: 'heavy', symptoms: ['cramps'] } },
    mode: 'merge'
  }, reg.data.token);
  assert.strictEqual(imp.status, 200);
  assert.strictEqual(imp.data.settings.cycleLength, 30);
  assert.strictEqual(imp.data.settings.pinCode, undefined, 'le PIN ne doit jamais être stocké côté serveur');
  assert.strictEqual(imp.data.logs['2026-09-01'].flow, 'heavy');
});

test('Super Admin : statistiques, création, suspension, protections', async () => {
  const { data } = await api('POST', '/api/auth/login', { email: 'admin@lago.app', password: 'admin123' });
  const t = data.token;
  const stats = await api('GET', '/api/admin/stats', null, t);
  assert.strictEqual(stats.status, 200);
  assert.ok(stats.data.stats.totalUsers >= 3);

  const created = await api('POST', '/api/admin/user', { name: 'Nina', email: 'nina@test.fr', password: 'temp123' }, t);
  assert.strictEqual(created.status, 201);
  const ninaId = created.data.user.id;

  assert.strictEqual((await api('POST', '/api/admin/user/status', { userId: ninaId, status: 'blocked' }, t)).status, 200);
  assert.strictEqual((await api('POST', '/api/auth/login', { email: 'nina@test.fr', password: 'temp123' })).status, 403);

  // Le dernier Super Admin ne peut pas se supprimer / se rétrograder
  assert.strictEqual((await api('DELETE', `/api/admin/user?userId=${data.user.id}`, null, t)).status, 400);
  assert.strictEqual((await api('POST', '/api/admin/user/role', { userId: data.user.id, role: 'user' }, t)).status, 400);

  assert.strictEqual((await api('DELETE', `/api/admin/user?userId=${ninaId}`, null, t)).status, 200);
});

test('jeton falsifié refusé', async () => {
  const fake = Buffer.from(JSON.stringify({ sub: 'usr_admin_001', exp: 9999999999 })).toString('base64url') + '.abc';
  assert.strictEqual((await api('GET', '/api/admin/users', null, fake)).status, 401);
});

test('en-têtes de sécurité et CORS de l’application mobile', async () => {
  const page = await fetch(BASE + '/');
  assert.ok(page.headers.get('content-security-policy'));
  assert.strictEqual(page.headers.get('x-content-type-options'), 'nosniff');
  const pre = await fetch(BASE + '/api/auth/login', { method: 'OPTIONS', headers: { Origin: 'https://localhost' } });
  assert.strictEqual(pre.headers.get('access-control-allow-origin'), 'https://localhost');
  const evil = await fetch(BASE + '/api/auth/login', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
  assert.strictEqual(evil.headers.get('access-control-allow-origin'), null);
});

test('limitation des tentatives de connexion', async () => {
  let last;
  for (let i = 0; i < 12; i++) last = await api('POST', '/api/auth/login', { email: 'brute@test.fr', password: 'x' + i });
  assert.strictEqual(last.status, 429);
});
