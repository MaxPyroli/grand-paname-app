import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { analyser } = createRequire(import.meta.url)('../../scripts/journal-alertes.js');

const e = (perturbationId, disruptionId, titre, motifEnvoi = 'nouvelle') => ({ ligneId: 'L1', ligne: 'RER A', perturbationId, disruptionId, titre, detail: '', motifEnvoi });

test('journal : répétitions par texte, par annonce et par disruption_id', () => {
  const r = analyser([e('a', 'D1', 'Panne'), e('b', 'D1', 'Panne'), e('b', 'D1', 'Panne à Poissy'), e('c', '', '')]);
  assert.deepEqual([r.total, r.memeTexte, r.memeAnnonce, r.sansDisruptionId, r.groupes], [4, 1, 1, 1, 1]);
  assert.equal(r.groupesRepetes[0].length, 3);
});
