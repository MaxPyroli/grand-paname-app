import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { alertesActuelles, nouvellesAlertes, composerMessages, executerSurveillance, travauxActuels } = createRequire(import.meta.url)('../../functions/alertes-trafic.js');

const p = n => String(n).padStart(2, '0');
const ddmm = d => `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}00`;
const PERIODE = [{ begin: ddmm(new Date(Date.now() - 86_400_000)), end: ddmm(new Date(Date.now() + 86_400_000)) }];
const annonce = (id, cause, severity) => ({ id, cause, severity, applicationPeriods: PERIODE, title: 'Titre ' + id, message: '<p>Détail</p>' });
const bulk = (...as) => ({
  disruptions: as,
  lines: as.map((a, i) => ({ id: 'L' + i, shortName: String(i + 1), mode: 'Metro', impactedObjects: [{ type: 'line', disruptionIds: [a.id] }] })),
});
const TOUT = bulk(annonce('coupe', 'PERTURBATION', 'BLOQUANTE'), annonce('gene', 'PERTURBATION', 'PERTURBEE'), annonce('info', 'INFORMATION', 'INFORMATION'), annonce('chantier', 'TRAVAUX', 'BLOQUANTE'));
const LIGNES = ['L0', 'L1', 'L2', 'L3'];

test('les informations ne sont détectées que sur demande ; les travaux jamais', () => {
  assert.deepEqual([...alertesActuelles(TOUT).keys()], ['coupe', 'gene']);
  assert.deepEqual([...alertesActuelles(TOUT, Date.now(), true).keys()], ['coupe', 'gene', 'info']);
});

test('chaque réglage reçoit ce qu il demande', () => {
  const n = nouvellesAlertes(alertesActuelles(TOUT, Date.now(), true), {});
  const titres = niveau => composerMessages(n, LIGNES, new Map(), niveau).map(m => m.title);
  assert.deepEqual(titres('toutes'), ['Métro 1 : trafic interrompu', 'Métro 2 : trafic perturbé', 'Métro 3 : information']);
  assert.deepEqual(titres('standard'), ['Métro 1 : trafic interrompu', 'Métro 2 : trafic perturbé']);
  assert.deepEqual(titres('interruptions'), ['Métro 1 : trafic interrompu']);
  // Interruption annoncée par le texte (arrêt bloqué mais « trafic interrompu » dans le titre) : envoyée aussi.
  const fr = new Map([['gene', { titre: 'Trafic interrompu entre A et B', etiquette: '' }]]);
  assert.equal(composerMessages(n, ['L1'], fr, 'interruptions').length, 1);
});

function monde(etat, abonnes, donnees = TOUT) {
  const envois = [], ecritures = [], travaux = [];
  const db = {
    doc: () => ({ get: async () => ({ exists: true, data: () => etat }), set: async v => { ecritures.push(v); } }),
    collection: nom => ({ add: async v => { if (nom === 'journalTravaux') travaux.push(v); }, get: async () => ({ docs: abonnes.map(a => ({ ref: {}, data: () => a })) }) }),
  };
  globalThis.fetch = async (url, o) => {
    if (String(url).includes('disruptions_bulk')) return { ok: true, json: async () => donnees };
    if (String(url).includes('line_reports')) return { ok: true, json: async () => ({ disruptions: ['coupe', 'gene', 'info'].map(id => ({ id, messages: [{ channel: { name: 'titre' }, text: 'Texte ' + id }] })) }) };
    const lot = JSON.parse(o.body); envois.push(...lot); return { json: async () => ({ data: lot.map(() => ({ status: 'ok' })) }) };
  };
  return { envois, ecritures, travaux, lancer: () => executerSurveillance({ db, horodatage: 'T', cle: 'k', reel: true, journal: () => {} }) };
}

test('au premier passage avec les informations, celles déjà en cours ne partent pas', async () => {
  const m = monde({ signalees: { coupe: 'BLOQUANTE', gene: 'PERTURBEE' } }, [{ token: 'A', alertesLignes: LIGNES, alertesNiveau: 'toutes' }]);
  await m.lancer();
  assert.equal(m.envois.length, 0);
  assert.equal(m.ecritures[0].signalees.info, 'INFORMATION');
});

test('une nouvelle information part seulement aux abonnés « toutes »', async () => {
  const abonnes = [{ token: 'TOUT', alertesLignes: LIGNES, alertesNiveau: 'toutes' }, { token: 'STD', alertesLignes: LIGNES }, { token: 'INT', alertesLignes: LIGNES, alertesNiveau: 'interruptions' }];
  const m = monde({ signalees: {}, suitInfos: true }, abonnes);
  await m.lancer();
  const recus = t => m.envois.filter(e => e.to === t).map(e => e.data.ligneId).sort();
  assert.deepEqual(recus('TOUT'), ['L0', 'L1', 'L2']);
  assert.deepEqual(recus('STD'), ['L0', 'L1']);
  assert.deepEqual(recus('INT'), ['L0']);
});

test('travaux : observés (nouveaux seulement), jamais envoyés', async () => {
  assert.deepEqual([...travauxActuels(TOUT).keys()], ['chantier']);
  const abonnes = [{ token: 'A', alertesLignes: ['L3'], alertesNiveau: 'toutes' }];
  const premier = monde({ signalees: {}, suitInfos: true }, abonnes);
  await premier.lancer();
  assert.equal(premier.travaux.length, 0);
  const ensuite = monde({ signalees: {}, suitInfos: true, travauxVus: [] }, abonnes);
  await ensuite.lancer();
  assert.equal(ensuite.travaux[0].travaux[0].titre, 'Titre chantier');
  assert.equal(ensuite.envois.length, 0);
});
