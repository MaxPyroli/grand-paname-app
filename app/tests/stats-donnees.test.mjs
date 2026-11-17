import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { agreger, comparerVersions } = createRequire(import.meta.url)('../../scripts/stats-donnees.js');

const J = 86_400_000;
const NOW = Date.UTC(2026, 10, 17, 12);
const appareils = [
  { platform: 'android', appVersion: '3.3.3', updatedAt: NOW - 1 * J, alertesLignes: ['L8', 'L1'] },
  { platform: 'android', appVersion: '3.3.2', updatedAt: NOW - 20 * J, alertesLignes: ['L8'] },
  { platform: 'android', appVersion: '3.10.0', updatedAt: NOW - 40 * J, alertesLignes: [] },
  { platform: 'ios', updatedAt: null },
];

test('versions : tri numérique, la plus récente d\'abord', () => {
  assert.ok(comparerVersions('3.10.0', '3.3.3') < 0);
  const s = agreger({ appareils, maintenant: NOW });
  assert.deepEqual(s.appareils.parVersion.map(v => v.nom), ['3.10.0', '3.3.3', '3.3.2', 'inconnue']);
});

test('appareils : totaux, vus 7 / 30 jours, abonnés aux alertes', () => {
  const a = agreger({ appareils, maintenant: NOW }).appareils;
  assert.deepEqual([a.total, a.vus7j, a.vus30j, a.avecAlertes], [4, 1, 2, 2]);
  assert.deepEqual(a.parPlateforme.map(p => [p.nom, p.n]), [['android', 3], ['ios', 1]]);
});

test('lignes les plus suivies, avec leurs noms', () => {
  const noms = new Map([['L8', { code: '8', mode: 'Métro' }]]);
  const s = agreger({ appareils, maintenant: NOW, nomsLignes: noms });
  assert.deepEqual(s.lignesPopulaires.map(l => [l.nom, l.n]), [['Métro 8', 2], ['L1', 1]]);
});

test('aucun jeton ni détail interne dans le résultat', () => {
  const texte = JSON.stringify(agreger({ appareils: [{ token: 'ExponentPushToken[secret]', platform: 'android', alertesLignes: [] }], maintenant: NOW }));
  assert.ok(!texte.includes('secret'));
  assert.ok(!texte.includes('lignesSuivies'));
});

test('alertes : écarts, erreurs, notifications, série', () => {
  const H = 3_600_000;
  const passages = [
    { at: NOW - 20 * H, perturbations: 10, nouvelles: 0, envoyees: 0, premierPassage: true },
    { at: NOW - 10 * H, perturbations: 12, nouvelles: 2, envoyees: 1 },
    { at: NOW - 2 * H, perturbations: 11, nouvelles: 1, envoyees: 0, erreur: 'HTTP 500' },
  ];
  const al = agreger({ passages, maintenant: NOW }).alertes;
  assert.deepEqual([al.passages, al.passages24h, al.erreurs, al.notificationsEnvoyees, al.nouvellesDetectees], [3, 3, 1, 1, 3]);
  assert.equal(al.ecartMoyenMs, 9 * H);
  assert.equal(al.ecartMaxMs, 10 * H);
  assert.equal(al.serie[0].ecartMs, null);
  assert.equal(al.serie[2].erreur, 'HTTP 500');
});

test('données vides : aucun plantage', () => {
  const s = agreger({ maintenant: NOW });
  assert.deepEqual([s.appareils.total, s.alertes.passages, s.alertes.ecartMoyenMs, s.envois.total, s.lignesPopulaires.length], [0, 0, null, 0, 0]);
});

test('envois manuels : les plus récents d\'abord, par canal', () => {
  const s = agreger({ historique: [
    { date: '2026-10-01T10:00:00Z', categorie: 'maj', titre: 'A', destinataires: 3, livres: 3, echecs: 0 },
    { date: '2026-10-05T10:00:00Z', categorie: 'trafic', titre: 'B', destinataires: 3, livres: 2, echecs: 1 }], maintenant: NOW }).envois;
  assert.equal(s.recents[0].titre, 'B');
  assert.deepEqual(s.parCategorie.map(c => c.nom).sort(), ['maj', 'trafic']);
});
