import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { etatAnnonce, trierNouvelles, composerMessages } = createRequire(import.meta.url)('../../functions/alertes-trafic.js');

const annonce = (id, niveau = 'perturbe', ligne = 'L1') => ({ id, gravite: 'PERTURBEE', lignes: new Map([[ligne, { id: ligne, code: '8', mode: 'Metro', niveau }]]) });
const texte = (titre, disruptionId = 'inc', etiquette = '') => ({ titre, disruptionId, etiquette, detail: '' });
// Rejoue des passages successifs : `actives` = annonces en cours, `neuves` = celles qui viennent d'apparaître.
function suivi() {
  let memoire = {}, attente = {}, t = 1_000_000;
  const textes = new Map();
  return (neuves, { actives = neuves, francais = {}, dans = 120_000 } = {}) => {
    t += dans;
    for (const [k, v] of Object.entries(francais)) textes.set(k, v);
    const r = trierNouvelles({ nouvelles: neuves, alertes: new Map(actives.map(a => [a.id, a])), francais: textes, suivies: new Set(['L1']), memoire, attente, maintenant: t });
    memoire = r.memoire; attente = r.attente;
    const avecMaj = maj => r.aEnvoyer.filter(a => [...a.lignes.values()].some(l => !!l.maj === maj)).map(a => a.id);
    // `envoyees` : vraies alertes ; `precisions` : même état, texte nouveau (catégorie « Information »).
    return { ...r, envoyees: avecMaj(false), precisions: avecMaj(true) };
  };
}

test('état d une annonce : reprise, interrompu, très perturbé, perturbé, petit ralentissement', () => {
  assert.equal(etatAnnonce('perturbe', texte('Incident - Reprise progressive')), 'reprise');
  assert.equal(etatAnnonce('perturbe', texte('Ligne P : trafic interrompu')), 'interrompu');
  assert.equal(etatAnnonce('interrompu', texte('Panne')), 'interrompu');
  assert.equal(etatAnnonce('perturbe', texte('Panne - Trafic très perturbé')), 'tres');
  assert.equal(etatAnnonce('perturbe', texte('Panne', 'x', 'Trafic fortement perturbé')), 'tres');
  assert.equal(etatAnnonce('perturbe', { titre: 'Train stationne', etiquette: '', detail: 'Reprise estimée à 10h' }), 'mineur');
  assert.equal(etatAnnonce('perturbe', { titre: 'Panne de signalisation', etiquette: '', detail: 'Reprise estimée à 10h' }), 'perturbe');
  assert.equal(etatAnnonce('perturbe', texte('Trains stationnent', 'x', 'Trafic fortement perturbé')), 'tres');
});

test('même incident : seul un changement d état est renvoyé', () => {
  const passage = suivi();
  const a = annonce('a'), b = annonce('b'), c = annonce('c', 'interrompu'), d = annonce('d', 'interrompu'), e = annonce('e');
  assert.deepEqual(passage([a], { francais: { a: texte('Trafic perturbé') } }).envoyees, ['a']);
  assert.deepEqual(passage([b], { francais: { b: texte('Trafic perturbé, bus de remplacement') } }).envoyees, []);
  assert.deepEqual(passage([c], { francais: { c: texte('Trafic interrompu') } }).envoyees, ['c']);
  assert.deepEqual(passage([d], { francais: { d: texte('Trafic interrompu jusqu à 10h') } }).envoyees, []);
  assert.deepEqual(passage([e], { francais: { e: texte('Reprise progressive') } }).envoyees, ['e']);
});

test('un autre incident sur la même ligne n est jamais écarté', () => {
  const passage = suivi();
  const a = annonce('a'), z = annonce('z');
  passage([a], { francais: { a: texte('Trafic perturbé', 'inc1') } });
  assert.deepEqual(passage([z], { actives: [a, z], francais: { z: texte('Trafic perturbé', 'inc2') } }).envoyees, ['z']);
});

test('annonces jumelles au même passage : une seule, la plus grave', () => {
  const passage = suivi();
  const r = passage([annonce('leger'), annonce('grave', 'interrompu')], { francais: { leger: texte('Trafic interrompu'), grave: texte('Trafic interrompu') } });
  assert.equal(r.envoyees.length, 1);
});

test('une annonce plus légère à côté d une interruption toujours en cours n est pas une amélioration', () => {
  const passage = suivi();
  const grave = annonce('g', 'interrompu'), leger = annonce('l'), apres = annonce('p');
  passage([grave], { francais: { g: texte('Trafic interrompu') } });
  assert.deepEqual(passage([leger], { actives: [grave, leger], francais: { l: texte('Train stationne') } }).envoyees, []);
  assert.deepEqual(passage([apres], { actives: [apres], francais: { p: texte('Trafic perturbé') } }).envoyees, ['p']);
});

test('sans texte : attend jusqu à 4 minutes, puis part quand même', () => {
  const passage = suivi();
  const a = annonce('a');
  for (let i = 0; i < 2; i++) { const r = passage([a]); assert.deepEqual(r.envoyees, []); assert.ok(r.retenues.has('a')); }
  assert.deepEqual(passage([a]).envoyees, ['a']);
});

test('sans texte : envoyée dès que le texte arrive ; une interruption n attend pas', () => {
  const passage = suivi();
  const a = annonce('a');
  passage([a]);
  assert.deepEqual(passage([a], { francais: { a: texte('Trafic perturbé') } }).envoyees, ['a']);
  assert.deepEqual(suivi()([annonce('x', 'interrompu')]).envoyees, ['x']);
});

test('incident oublié après 3 h sans annonce en cours, gardé sinon', () => {
  const passage = suivi();
  const a = annonce('a'), b = annonce('b'), c = annonce('c');
  passage([a], { francais: { a: texte('Trafic perturbé') } });
  passage([], { actives: [a], dans: 4 * 3_600_000 });
  assert.deepEqual(passage([b], { francais: { b: texte('Trafic perturbé') } }).envoyees, []);
  passage([], { actives: [], dans: 4 * 3_600_000 });
  assert.deepEqual(passage([c], { francais: { c: texte('Trafic perturbé') } }).envoyees, ['c']);
});

test('notification remplaçable : une étiquette par ligne et par incident, aucune sans numéro d incident', () => {
  const [avec] = composerMessages([annonce('a')], ['L1'], new Map([['a', texte('Panne', 'inc')]]));
  assert.equal(avec.tag, 'trafic-L1-inc');
  const [sans] = composerMessages([annonce('a')], ['L1']);
  assert.ok(!('tag' in sans));
});

test('même état, texte nouveau : une précision discrète ; texte identique : rien', () => {
  const passage = suivi();
  passage([annonce('a')], { francais: { a: texte('Trafic perturbé') } });
  const r = passage([annonce('b')], { francais: { b: texte('Trafic perturbé, bus de remplacement') } });
  assert.deepEqual([r.envoyees, r.precisions], [[], ['b']]);
  const s = passage([annonce('c')], { francais: { c: texte('Trafic perturbé, bus de remplacement') } });
  assert.deepEqual([s.envoyees, s.precisions], [[], []]);
});

test('train stationne puis vraie perturbation : la perturbation prévient', () => {
  const passage = suivi();
  passage([annonce('a')], { francais: { a: texte('Panne - Train stationne') } });
  assert.deepEqual(passage([annonce('b')], { francais: { b: texte('Panne - Trafic perturbé') } }).envoyees, ['b']);
});
