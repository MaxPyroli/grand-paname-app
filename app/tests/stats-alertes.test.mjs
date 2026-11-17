import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { resumer, duree } = createRequire(import.meta.url)('../../scripts/stats-alertes.js');

const H = 3600_000;
test('durées lisibles', () => {
  assert.equal(duree(null), '—');
  assert.equal(duree(5 * 60_000), '5 min');
  assert.equal(duree(4 * H + 30 * 60_000), '4 h 30');
});

test('résumé : écarts, erreurs, notifications', () => {
  const r = resumer([
    { at: 0, nouvelles: 0, envoyees: 0 },
    { at: 4 * H, nouvelles: 2, envoyees: 1 },
    { at: 14 * H, nouvelles: 1, envoyees: 0, erreur: 'HTTP 500' },
  ]);
  assert.deepEqual([r.passages, r.erreurs, r.notifications, r.nouvelles], [3, 1, 1, 3]);
  assert.equal(r.ecartMoyen, 7 * H);
  assert.equal(r.ecartMax, 10 * H);
  assert.equal(resumer([{ at: 0 }]).ecartMoyen, null);
});
