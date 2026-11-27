import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ETAPES, etapeSuivante, gesteFait, retourNecessaire, placerBulle, type EtatApp } from '../tuto.ts';

const e = (d: Partial<EtatApp> = {}): EtatApp => ({ gareOuverte: false, gareEnFavori: false, onglet: 'accueil', vueTraficOuverte: false, ...d });

test('tuto : les étapes s enchaînent et la dernière ne dépasse pas', () => {
  assert.deepEqual(ETAPES.map(x => x.id), ['bienvenue', 'recherche', 'horaires', 'favori', 'favoris', 'trafic', 'alertes', 'fin']);
  assert.equal(etapeSuivante('recherche'), 'horaires');
  assert.equal(etapeSuivante('fin'), 'fin');
});

test('tuto : chaque étape à geste a une cible, et avance quand le geste est fait', () => {
  assert.ok(ETAPES.filter(x => x.attend === 'geste').every(x => x.cible));
  assert.equal(gesteFait('recherche', e()), false);
  assert.equal(gesteFait('recherche', e({ gareOuverte: true })), true);
  assert.equal(gesteFait('favori', e({ gareOuverte: true, gareEnFavori: true })), true);
  assert.equal(gesteFait('favoris', e({ onglet: 'favoris' })), true);
  assert.equal(gesteFait('trafic', e({ onglet: 'trafic' })), true);
  assert.equal(gesteFait('alertes', e({ onglet: 'trafic' })), false);
  assert.equal(gesteFait('alertes', e({ onglet: 'trafic', vueTraficOuverte: true })), true);
  assert.equal(gesteFait('horaires', e({ gareOuverte: true })), false);
});

test('tuto : on revient en arrière si ce qu il faut n est plus là', () => {
  assert.equal(retourNecessaire('horaires', e()), 'recherche');
  assert.equal(retourNecessaire('favori', e()), 'recherche');
  assert.equal(retourNecessaire('alertes', e({ onglet: 'accueil' })), 'trafic');
  assert.equal(retourNecessaire('favoris', e()), null);
});

test('tuto : la bulle reste dans l écran, y compris volet des horaires en grand', () => {
  // élément en haut → dessous ; en bas → dessus
  assert.deepEqual(placerBulle({ y: 40, h: 50 }, 800, 200, 40, 90), { top: 104 });
  assert.deepEqual(placerBulle({ y: 700, h: 52 }, 800, 200, 40, 90), { bottom: 114 });
  // volet à mi-hauteur → au-dessus
  assert.deepEqual(placerBulle({ y: 400, h: 310 }, 800, 200, 40, 90), { bottom: 414 });
  // volet en grand : plus de place ni dessus ni dessous → par-dessus, en bas
  assert.deepEqual(placerBulle({ y: 50, h: 660 }, 800, 200, 40, 90), { bottom: 90 });
});
