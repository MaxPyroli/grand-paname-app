import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { alertesActuelles, nouvellesAlertes, composerMessage, libelleLigne, dateNavitia } = createRequire(import.meta.url)('../../scripts/surveillance-trafic.js');

// 15 octobre 2026 = heure d'été (UTC+2) ; 15 décembre = heure d'hiver (UTC+1), quel que soit le fuseau de la machine.
test('dateNavitia : heure de Paris, été et hiver', () => {
  assert.equal(dateNavitia('20261015T120000'), Date.UTC(2026, 9, 15, 10, 0, 0));
  assert.equal(dateNavitia('20261215T120000'), Date.UTC(2026, 11, 15, 11, 0, 0));
});

const NOW = Date.UTC(2026, 9, 15, 10, 0, 0);
const PERIODE = [{ begin: '20261015T000000', end: '20261016T000000' }];
function bulk(p, type = 'line', lignes = [{ id: 'L1', shortName: '8', mode: 'Metro' }]) {
  return {
    disruptions: [{ id: 'd1', cause: 'PERTURBATION', severity: 'PERTURBEE', applicationPeriods: PERIODE, ...p }],
    lines: lignes.map(l => ({ ...l, impactedObjects: [{ type, disruptionIds: ['d1'] }] })),
  };
}

test('alertes : perturbation en cours signalée, niveau selon la gravité et la cible', () => {
  assert.equal(alertesActuelles(bulk({}), NOW).get('d1').lignes.get('L1').niveau, 'perturbe');
  assert.equal(alertesActuelles(bulk({ severity: 'BLOQUANTE' }), NOW).get('d1').lignes.get('L1').niveau, 'interrompu');
  assert.equal(alertesActuelles(bulk({ severity: 'BLOQUANTE' }, 'stop_point'), NOW).get('d1').lignes.get('L1').niveau, 'perturbe');
});

test('alertes : travaux, information, hors période, autres objets ignorés', () => {
  assert.equal(alertesActuelles(bulk({ cause: 'TRAVAUX' }), NOW).size, 0);
  assert.equal(alertesActuelles(bulk({ cause: 'INFORMATION' }), NOW).size, 0);
  assert.equal(alertesActuelles(bulk({ severity: 'INFORMATION' }), NOW).size, 0);
  assert.equal(alertesActuelles(bulk({}), NOW + 2 * 86_400_000).size, 0);
  assert.equal(alertesActuelles(bulk({}, 'network'), NOW).size, 0);
  assert.equal(alertesActuelles({}, NOW).size, 0);
});

test('alertes : une perturbation sur ligne et arrêt garde « interrompu »', () => {
  const b = bulk({ severity: 'BLOQUANTE' });
  b.lines[0].impactedObjects.push({ type: 'stop_point', disruptionIds: ['d1'] });
  assert.equal(alertesActuelles(b, NOW).get('d1').lignes.get('L1').niveau, 'interrompu');
});

test('nouvelles alertes : déjà signalée ignorée, aggravation signalée', () => {
  const a = alertesActuelles(bulk({}), NOW);
  assert.equal(nouvellesAlertes(a, {}).length, 1);
  assert.equal(nouvellesAlertes(a, { d1: 'PERTURBEE' }).length, 0);
  assert.equal(nouvellesAlertes(a, { d1: 'BLOQUANTE' }).length, 0);
  const b = alertesActuelles(bulk({ severity: 'BLOQUANTE' }), NOW);
  assert.equal(nouvellesAlertes(b, { d1: 'PERTURBEE' }).length, 1);
});

test('libellé de ligne', () => {
  assert.equal(libelleLigne({ mode: 'Metro', code: '3B' }), 'Métro 3 bis');
  assert.equal(libelleLigne({ mode: 'RapidTransit', code: 'A' }), 'RER A');
  assert.equal(libelleLigne({ mode: 'Autre', code: 'X' }), 'Ligne X');
  assert.equal(libelleLigne({ mode: 'Bus', code: '104' }), 'Bus 104');
});

test('message : filtré par lignes suivies, une ligne, plusieurs lignes', () => {
  const lignes = [{ id: 'L1', shortName: '8', mode: 'Metro' }, { id: 'L2', shortName: 'A', mode: 'RapidTransit' }];
  const n = nouvellesAlertes(alertesActuelles(bulk({ severity: 'BLOQUANTE' }, 'line', lignes), NOW), {});
  assert.equal(composerMessage(n, ['L9']), null);
  const un = composerMessage(n, ['L1']);
  assert.deepEqual(un, { title: 'Métro 8 : trafic interrompu', body: 'Touche pour voir le détail.', data: { type: 'trafic', ligneId: 'L1' } });
  const fr = new Map([['d1', { titre: 'Panne de courant', etiquette: 'Trafic Interrompu' }]]);
  const avecFr = composerMessage(n, ['L1'], fr);
  assert.equal(avecFr.title, 'Métro 8 : trafic interrompu');
  assert.equal(avecFr.body, 'Panne de courant');
  const deux = composerMessage(n, ['L1', 'L2']);
  assert.equal(deux.title, '2 de tes lignes sont perturbées');
  assert.equal(deux.body, 'Métro 8, RER A');
});
