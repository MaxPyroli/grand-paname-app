import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { alertesActuelles, nouvellesAlertes, composerMessages, libelleLigne, dateNavitia } = createRequire(import.meta.url)('../../scripts/surveillance-trafic.js');

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
  assert.deepEqual(composerMessages(n, ['L9']), []);
  const un = composerMessages(n, ['L1']);
  assert.deepEqual(un, [{ title: 'Métro 8 : trafic interrompu', data: { type: 'trafic', ligneId: 'L1' } }]);
  const fr = new Map([['d1', { titre: 'Panne de courant', etiquette: 'Trafic Interrompu' }]]);
  const avecFr = composerMessages(n, ['L1'], fr);
  assert.equal(avecFr[0].title, 'Métro 8 : trafic interrompu');
  assert.equal(avecFr[0].body, 'Panne de courant');
  // Deux lignes suivies touchées : deux notifications distinctes, pas un message groupé.
  const deux = composerMessages(n, ['L1', 'L2']);
  assert.deepEqual(deux.map(m => m.title).sort(), ['Métro 8 : trafic interrompu', 'RER A : trafic interrompu']);
});

test('message : au-delà de 5 notifications, regroupement du reste', () => {
  const lignes = Array.from({ length: 8 }, (_, i) => ({ id: `L${i}`, shortName: String(i + 1), mode: 'Metro' }));
  const n = nouvellesAlertes(alertesActuelles(bulk({ severity: 'PERTURBEE' }, 'line', lignes), NOW), {});
  const m = composerMessages(n, lignes.map(l => l.id));
  assert.equal(m.length, 5);
  assert.equal(m[4].title, '4 autres perturbations sur tes lignes');
});

test('message : le détail de l annonce suit le titre dans le corps, tronqué si trop long', () => {
  const lignes = [{ id: 'L1', shortName: '8', mode: 'Metro' }];
  const n = nouvellesAlertes(alertesActuelles(bulk({ severity: 'BLOQUANTE' }, 'line', lignes), NOW), {});
  const [m] = composerMessages(n, ['L1'], new Map([['d1', { titre: 'Panne de courant', detail: 'Reprise estimée vers 15 h.', etiquette: '' }]]));
  assert.equal(m.body, 'Panne de courant\nReprise estimée vers 15 h.');
  const [long] = composerMessages(n, ['L1'], new Map([['d1', { titre: 'T', detail: 'x'.repeat(900), etiquette: '' }]]));
  assert.equal(long.body.length, 400);
  assert.ok(long.body.endsWith('…'));
});

test('message : la perturbation voyage dans les données de la notification (pour l app)', () => {
  const lignes = [{ id: 'L1', shortName: '8', mode: 'Metro' }];
  const n = nouvellesAlertes(alertesActuelles(bulk({ severity: 'BLOQUANTE' }, 'line', lignes), NOW), {});
  const [m] = composerMessages(n, ['L1'], new Map([['d1', { titre: 'Panne', detail: 'Détail', etiquette: '' }]]));
  assert.deepEqual(m.data, { type: 'trafic', ligneId: 'L1', perturbation: { id: 'd1', titre: 'Panne', detail: 'Détail', niveau: 'interrompu' } });
});
