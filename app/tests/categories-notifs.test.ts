import { test } from 'node:test';
import assert from 'node:assert/strict';
import { soucisNotifs, texteSouci, categoriesDuNiveau } from '../categoriesNotifs.ts';

const canaux = (information: number, perturbation: number, interruption: number) => [
  { id: 'trafic_information', importance: information }, { id: 'trafic_perturbation', importance: perturbation }, { id: 'trafic_interruption', importance: interruption },
];

test('rien à signaler quand tout est réglé comme à l installation (Information sans son)', () => {
  assert.deepEqual(soucisNotifs('toutes', true, canaux(4, 6, 6)), []);
});

test('une catégorie désactivée n est signalée que si le niveau choisi en a besoin', () => {
  assert.deepEqual(soucisNotifs('toutes', true, canaux(2, 6, 6)), [{ genre: 'desactivee', categorie: 'information' }]);
  assert.deepEqual(soucisNotifs('standard', true, canaux(2, 6, 6)), []);
  assert.deepEqual(soucisNotifs('interruptions', true, canaux(2, 2, 6)), []);
  assert.deepEqual(categoriesDuNiveau('interruptions'), ['interruption']);
});

test('interruption ou perturbation passée en silencieux : signalée ; notifications de l app coupées : seul message', () => {
  assert.deepEqual(soucisNotifs('standard', true, canaux(4, 6, 4)), [{ genre: 'silencieuse', categorie: 'interruption' }]);
  assert.deepEqual(soucisNotifs('toutes', false, canaux(2, 2, 2)), [{ genre: 'app' }]);
});

test('catégories pas encore créées : rien ; textes avec le nom exact de la catégorie', () => {
  assert.deepEqual(soucisNotifs('toutes', true, []), []);
  assert.match(texteSouci({ genre: 'desactivee', categorie: 'information' }), /« Info Trafic : Information » est désactivée/);
});
