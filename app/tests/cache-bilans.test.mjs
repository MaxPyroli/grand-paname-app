import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { creerCacheBilans } = createRequire(import.meta.url)('../../scripts/cache-bilans.js');

const MIN = 60_000, JOUR = 86_400_000;

test('chaque bilan n est lu qu une fois ; pas de nouvelle lecture avant 5 minutes ; mémoire gardée entre deux lancements', async () => {
  let maintenant = 100 * JOUR;
  const base = [{ at: maintenant - 40 * JOUR }, { at: maintenant - 2 * MIN }];
  const demandes = [];
  const lire = async depuis => { const r = base.filter(b => b.at > +depuis); demandes.push(r.length); return r; };
  let disque = null;
  const stockage = { charger: () => disque, sauver: v => { disque = JSON.parse(JSON.stringify(v)); } };
  const cache = creerCacheBilans({ lire, stockage, horloge: () => maintenant });
  assert.equal((await cache()).length, 1);              // le bilan de plus de 30 jours n est pas demandé
  maintenant += 2 * MIN; base.push({ at: maintenant });
  assert.equal((await cache()).length, 1);              // trop tôt : aucune lecture
  maintenant += 4 * MIN;
  assert.equal((await cache()).length, 2);
  assert.deepEqual(demandes, [1, 1]);
  const relance = creerCacheBilans({ lire, stockage, horloge: () => maintenant + 10 * MIN });
  assert.equal((await relance()).length, 2);
  assert.deepEqual(demandes, [1, 1, 0]);
});
