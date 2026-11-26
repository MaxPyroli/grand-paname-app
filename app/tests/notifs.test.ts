import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inserer, preparer, lireTitreAlerte, notifDAlerte, notifier, fermerNotif, toutFermer, lireFile, FILE_MAX, type Notif, type DemandeNotif } from '../notifs.ts';

const n = (cle: string, d: Partial<DemandeNotif> = {}): Notif => preparer({ cle, titre: cle, forme: 'carte', ...d });
const cles = (f: Notif[]) => f.map(x => x.cle);

test('notifs : durées par défaut selon la forme', () => {
  assert.deepEqual([preparer({ titre: 'a' }).duree, preparer({ titre: 'b', forme: 'carte' }).duree, preparer({ titre: 'c', forme: 'choix' }).duree], [2500, 7000, null]);
});

test('notifs : même clé remplace sur place, sans doublon', () => {
  const f = [n('a'), n('b')];
  const apres = inserer(f, n('b', { titre: 'nouveau' }));
  assert.deepEqual(cles(apres), ['a', 'b']);
  assert.equal(apres[1].titre, 'nouveau');
});

test('notifs : une interruption passe devant, le reste attend son tour', () => {
  let f = inserer([], n('perturbe', { type: 'perturbe' }));
  f = inserer(f, n('info'));
  f = inserer(f, n('coupure', { type: 'interrompu' }));
  assert.deepEqual(cles(f), ['coupure', 'perturbe', 'info']);
});

test('notifs : file limitée, les moins prioritaires en attente partent d abord', () => {
  let f = inserer([], n('affichee'));
  f = inserer(f, n('grave', { type: 'erreur' }));   // passe devant
  for (let i = 0; i < 8; i++) f = inserer(f, n('i' + i));
  assert.equal(f.length, FILE_MAX);
  assert.equal(f[0].cle, 'grave');
  assert.equal(f.at(-1)!.cle, 'i7');
});

test('notifs : haut et bas sont deux files indépendantes ; fermer fait avancer la file', () => {
  toutFermer();
  notifier({ forme: 'carte', titre: 'carte', cle: 'c' });
  notifier({ titre: 'pilule', cle: 'p' });
  notifier({ forme: 'choix', titre: 'choix', cle: 'q' });
  assert.deepEqual([cles(lireFile('haut')), cles(lireFile('bas'))], [['c', 'q'], ['p']]);
  fermerNotif('c');
  assert.deepEqual(cles(lireFile('haut')), ['q']);
  toutFermer();
});

test('notifs : alerte trafic → ligne, état et annonce', () => {
  assert.deepEqual(lireTitreAlerte('Métro 7 bis : trafic perturbé'), { mode: 'METRO', code: '7B', etat: 'Trafic perturbé' });
  assert.equal(lireTitreAlerte('3 autres perturbations sur tes lignes'), null);
  const d = notifDAlerte({ ligneId: 'L1', ligneTitre: 'RER A : trafic interrompu', titre: 'Panne à Poissy.', niveau: 'interrompu' }, () => {});
  assert.deepEqual([d.cle, d.type, d.titre, d.texte, d.ligne], ['alerte-L1', 'interrompu', 'Trafic interrompu', 'Panne à Poissy.', { mode: 'RER', code: 'A' }]);
});
