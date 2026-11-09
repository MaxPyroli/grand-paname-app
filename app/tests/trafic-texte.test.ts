import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decouperSurligne, creerAnalyseStations } from '../traficTexte.ts';

const marques = (t: string, type: string, a?: any) => decouperSurligne(t, a).filter(s => s.type === type).map(s => s.texte);
const recolle = (t: string, a?: any) => decouperSurligne(t, a).map(s => s.texte).join('');

test('le découpage ne perd ni n\'ajoute aucun caractère', () => {
  for (const t of ['', 'Rien à signaler.', 'Du lundi 21 septembre au vendredi 02 octobre, de 22h10 à 23h00, entre Père-Lachaise et Barbès - Rochechouart.']) {
    assert.equal(recolle(t), t);
    assert.equal(recolle(t, creerAnalyseStations(['Barbès - Rochechouart'])), t);
  }
});

test('périodes : une date par morceau', () => {
  assert.deepEqual(marques('Du lundi 21 septembre au vendredi 02 octobre', 'quand'), ['lundi 21 septembre', 'vendredi 02 octobre']);
  assert.deepEqual(marques('du 12 au 23 octobre', 'quand'), ['12', '23 octobre']);
});

test('horaires et rythmes', () => {
  assert.deepEqual(marques('de 10h00 à 16h00', 'quand'), ['10h00', '16h00']);
  assert.deepEqual(marques('Fermé en semaine', 'quand'), ['en semaine']);
  assert.ok(marques('dès 21:15', 'quand').includes('21:15'));
});

test('dates numériques : un nombre seul n\'est pas une date', () => {
  assert.deepEqual(marques('Vendredi 23/10', 'quand'), ['Vendredi 23/10']);
  assert.deepEqual(marques('Il y a 12 trains', 'quand'), []);
});

test('tronçon : deux stations repérées par la forme', () => {
  assert.deepEqual(marques('entre Père-Lachaise et Barbès - Rochechouart', 'station'), ['Père-Lachaise', 'Barbès - Rochechouart']);
});

test('avec la liste de la ligne, seuls les vrais noms de stations restent', () => {
  const a = creerAnalyseStations(['Barbès - Rochechouart', 'Père Lachaise']);
  const t = 'Trafic interrompu entre Grande Couronne et Barbès - Rochechouart.';
  const st = marques(t, 'station', a);
  assert.ok(st.some(s => s.includes('Barbès')));
  assert.ok(!st.some(s => s.includes('Grande')));
});

test('abréviations : « Paris St-Lazare » correspond à « Paris Saint-Lazare »', () => {
  const a = creerAnalyseStations(['Paris Saint-Lazare']);
  assert.equal(a.estStation('Paris St-Lazare'), true);
  assert.equal(a.estStation('Versailles'), false);
});

test('recherche directe : majuscule obligatoire, noms d\'un seul mot court ignorés', () => {
  const a = creerAnalyseStations(['Châtelet', 'Pont']);
  const t = 'Arrêt à Châtelet, le châtelet est fermé, Pont ouvert';
  const trouves = a.trouver(t).map(([d, f]) => t.slice(d, f));
  assert.deepEqual(trouves, ['Châtelet', 'Pont']);
  assert.deepEqual(creerAnalyseStations(['Pa']).trouver('Pa ici'), []);
});

test('une date reste une date même si elle contient un nom de station', () => {
  const a = creerAnalyseStations(['Mars']);
  const segs = decouperSurligne('le 5 mars Mars', a);
  assert.equal(segs.find(s => s.texte.includes('mars'))?.type, 'quand');
});
