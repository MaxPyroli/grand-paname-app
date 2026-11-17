import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { executerSurveillance } = createRequire(import.meta.url)('../../functions/alertes-trafic.js');

// Un passage complet avec une fausse base et un faux réseau : ni vrai serveur, ni vrai envoi.
const maintenant = new Date();
const p = n => String(n).padStart(2, '0');
const ddmm = d => `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}00`;
const PERIODE = [{ begin: ddmm(new Date(+maintenant - 86_400_000)), end: ddmm(new Date(+maintenant + 86_400_000)) }];
const BULK = {
  disruptions: [{ id: 'd1', cause: 'PERTURBATION', severity: 'BLOQUANTE', applicationPeriods: PERIODE }],
  lines: [{ id: 'L1', shortName: '8', mode: 'Metro', impactedObjects: [{ type: 'line', disruptionIds: ['d1'] }] }],
};

function fauxMonde({ etat, abonnes }) {
  const ecritures = []; const suppressions = []; const envois = []; const bilans = [];
  const db = {
    doc: () => ({ get: async () => ({ exists: etat !== null, data: () => etat }), set: async v => { ecritures.push(v); } }),
    collection: nom => ({ add: async b => { if (nom === 'statsAlertes') bilans.push(b); }, get: async () => ({ docs: abonnes.map(a => ({ ref: { delete: async () => { suppressions.push(a.token); } }, data: () => a })) }) }),
  };
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('disruptions_bulk')) return { ok: true, json: async () => BULK };
    if (String(url).includes('line_reports')) return { ok: true, json: async () => ({ disruptions: [] }) };
    if (String(url).includes('exp.host')) { const lot = JSON.parse(opts.body); envois.push(...lot); return { json: async () => ({ data: lot.map(() => ({ status: 'ok' })) }) }; }
    throw new Error('URL inattendue ' + url);
  };
  return { db, ecritures, suppressions, envois, bilans };
}
const lancer = (m, reel) => executerSurveillance({ db: m.db, horodatage: 'T', cle: 'k', reel, journal: () => {} });

test('premier passage : état enregistré (en réel), rien envoyé', async () => {
  const m = fauxMonde({ etat: null, abonnes: [{ token: 'ExponentPushToken[x]', alertesLignes: ['L1'] }] });
  await lancer(m, true);
  assert.deepEqual(m.ecritures, [{ signalees: { d1: 'BLOQUANTE' }, miseAJour: 'T' }]);
  assert.equal(m.envois.length, 0);
});

test('nouvelle perturbation : une notification, seulement aux appareils qui suivent la ligne', async () => {
  const m = fauxMonde({ etat: { signalees: {} }, abonnes: [
    { token: 'A', alertesLignes: ['L1'] }, { token: 'B', alertesLignes: ['L9'] }, { token: 'C', alertesLignes: [] }] });
  await lancer(m, true);
  assert.equal(m.envois.length, 1);
  assert.equal(m.envois[0].to, 'A');
  assert.equal(m.envois[0].channelId, 'trafic');
  assert.match(m.envois[0].title, /Métro 8/);
  assert.equal(m.ecritures.length, 1);
});

test('déjà signalée : aucune notification', async () => {
  const m = fauxMonde({ etat: { signalees: { d1: 'BLOQUANTE' } }, abonnes: [{ token: 'A', alertesLignes: ['L1'] }] });
  await lancer(m, true);
  assert.equal(m.envois.length, 0);
});

test('simulation : ni envoi ni écriture', async () => {
  const m = fauxMonde({ etat: { signalees: {} }, abonnes: [{ token: 'A', alertesLignes: ['L1'] }] });
  await lancer(m, false);
  assert.equal(m.envois.length, 0);
  assert.equal(m.ecritures.length, 0);
});

test('bilan : un passage réel laisse ses chiffres, une simulation rien', async () => {
  const m = fauxMonde({ etat: { signalees: {} }, abonnes: [{ token: 'A', alertesLignes: ['L1'] }, { token: 'B', alertesLignes: ['L9'] }] });
  await lancer(m, true);
  assert.equal(m.bilans.length, 1);
  const b = m.bilans[0];
  assert.deepEqual([b.perturbations, b.nouvelles, b.abonnes, b.envoyees, b.premierPassage, b.erreur], [1, 1, 2, 1, false, null]);
  assert.ok(b.at instanceof Date && b.dureeMs >= 0);
  const s = fauxMonde({ etat: { signalees: {} }, abonnes: [{ token: 'A', alertesLignes: ['L1'] }] });
  await lancer(s, false);
  assert.equal(s.bilans.length, 0);
});

test('bilan : une panne est enregistrée avec son erreur, puis relancée', async () => {
  const m = fauxMonde({ etat: { signalees: {} }, abonnes: [] });
  const ok = globalThis.fetch;
  globalThis.fetch = async url => { if (String(url).includes('disruptions_bulk')) return { ok: false, status: 403 }; return ok(url); };
  await assert.rejects(lancer(m, true), /HTTP 403/);
  assert.equal(m.bilans.length, 1);
  assert.match(m.bilans[0].erreur, /HTTP 403/);
});
