'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('../src/js/calculator.js');

const iso = d => C.formatDateISO(d);

test('les dates AAAA-MM-JJ sont lues en heure locale (pas de décalage UTC)', () => {
  const d = C.normalizeDate('2026-09-03');
  assert.strictEqual(d.getDate(), 3);
  assert.strictEqual(d.getMonth(), 8);
});

test('cycle de 28 jours : jour, ovulation et prochaines règles', () => {
  const r = C.calculateCycle('2026-09-01', 28, 5, new Date(2026, 8, 12));
  assert.strictEqual(r.currentCycleDay, 12);
  assert.strictEqual(iso(r.ovulationDate), '2026-09-15');
  assert.strictEqual(iso(r.nextPeriodStart), '2026-09-29');
  assert.strictEqual(r.currentPhase.key, 'ovulation'); // fenêtre fertile 10 -> 16
});

test('phases menstruelle, folliculaire et lutéale', () => {
  assert.strictEqual(C.calculateCycle('2026-09-01', 28, 5, new Date(2026, 8, 3)).currentPhase.key, 'menstrual');
  assert.strictEqual(C.calculateCycle('2026-09-01', 28, 5, new Date(2026, 8, 7)).currentPhase.key, 'follicular');
  assert.strictEqual(C.calculateCycle('2026-09-01', 28, 5, new Date(2026, 8, 20)).currentPhase.key, 'luteal');
});

test('une date de dernières règles ancienne est recalée sur le cycle en cours', () => {
  const r = C.calculateCycle('2026-01-01', 28, 5, new Date(2026, 8, 30));
  assert.ok(r.currentCycleDay >= 1 && r.currentCycleDay <= 28);
  assert.ok(r.daysUntilNextPeriod >= 0);
});

test('une date future ne produit pas de jour de cycle négatif', () => {
  const r = C.calculateCycle('2026-10-10', 28, 5, new Date(2026, 8, 30));
  assert.ok(r.currentCycleDay >= 1 && r.currentCycleDay <= 28, `jour ${r.currentCycleDay}`);
});

test('cycle court : l’ovulation ne tombe jamais pendant les règles', () => {
  const r = C.calculateCycle('2026-09-01', 18, 6, new Date(2026, 8, 2));
  assert.ok(r.ovulationDate > r.currentPeriodEnd || iso(r.ovulationDate) === iso(r.currentPeriodEnd));
});

test('prévisions : 6 cycles consécutifs, option à partir du cycle en cours', () => {
  const cycles = C.generateFutureCycles('2026-01-01', 30, 5, 6, false);
  assert.strictEqual(cycles.length, 6);
  assert.strictEqual(C.diffInDays(cycles[1].periodStart, cycles[0].periodStart), 30);
  const current = C.generateFutureCycles('2020-01-01', 28, 5, 3, true);
  assert.ok(C.diffInDays(new Date(), current[0].periodStart) < 28);
});
