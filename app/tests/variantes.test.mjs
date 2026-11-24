import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { varianteDe, filtreValide, correspond } = createRequire(import.meta.url)('../../scripts/variantes.js');

test('variante d un appareil : étiquette ou « ancien »', () => {
  assert.equal(varianteDe({ variante: 'stable' }), 'stable');
  assert.equal(varianteDe({ variante: 'dev' }), 'dev');
  assert.equal(varianteDe({}), 'ancien');
  assert.equal(varianteDe({ variante: 'autre' }), 'ancien');
});

test('filtres : stable inclut les anciens, dev seulement dev, toutes tout', () => {
  assert.deepEqual(['stable', 'dev', 'ancien'].map(v => correspond(v, 'stable')), [true, false, true]);
  assert.deepEqual(['stable', 'dev', 'ancien'].map(v => correspond(v, 'dev')), [false, true, false]);
  assert.deepEqual(['stable', 'dev', 'ancien'].map(v => correspond(v, 'toutes')), [true, true, true]);
  assert.equal(filtreValide('nimporte'), 'stable');
  assert.equal(filtreValide(undefined), 'stable');
  assert.equal(filtreValide('dev'), 'dev');
});
