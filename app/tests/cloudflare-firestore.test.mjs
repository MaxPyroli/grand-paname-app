import { test } from 'node:test';
import assert from 'node:assert/strict';
import { versFirestore, depuisFirestore, champs, objet, SERVEUR_HORODATAGE, creerFirestore } from '../../cloudflare/src/firestore.js';

test('conversion JS → Firestore → JS (types usuels)', () => {
  const d = new Date('2026-11-24T10:00:00.000Z');
  const valeur = { signalees: { d1: 'BLOQUANTE' }, nombre: 3, decimal: 1.5, ok: true, nul: null, liste: ['L1', 'L2'], quand: d };
  const retour = objet(champs(valeur));
  assert.deepEqual(retour.signalees, { d1: 'BLOQUANTE' });
  assert.equal(retour.nombre, 3); assert.equal(retour.decimal, 1.5); assert.equal(retour.ok, true); assert.equal(retour.nul, null);
  assert.deepEqual(retour.liste, ['L1', 'L2']);
  assert.equal(retour.quand.getTime(), d.getTime());
});

test('horodatage serveur et champs indéfinis', () => {
  const maintenant = new Date('2026-11-24T12:00:00.000Z');
  assert.deepEqual(versFirestore(SERVEUR_HORODATAGE, maintenant), { timestampValue: '2026-11-24T12:00:00.000Z' });
  assert.deepEqual(Object.keys(champs({ a: 1, b: undefined })), ['a']);
  assert.deepEqual(depuisFirestore({ arrayValue: {} }), []);
});

test('client : lecture d un document, collection paginée, écriture, ajout, suppression (faux réseau)', async () => {
  const { privateKey } = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', privateKey)).toString('base64');
  const compte = { project_id: 'projet-test', client_email: 'x@y.iam', private_key: `-----BEGIN PRIVATE KEY-----\n${pkcs8}\n-----END PRIVATE KEY-----\n` };
  const appels = [];
  const faux = async (url, opts = {}) => {
    appels.push(`${opts.method || 'GET'} ${String(url).replace(/^https:\/\/[^/]+/, '')}`);
    const rep = (code, corps) => ({ ok: code < 400, status: code, json: async () => corps });
    if (String(url).includes('oauth2')) return rep(200, { access_token: 'jeton-test' });
    if (opts.headers.Authorization !== 'Bearer jeton-test') return rep(401, {});
    if (String(url).endsWith('/systeme/alertesTrafic') && (opts.method || 'GET') === 'GET') return rep(200, { fields: { signalees: { mapValue: { fields: { d1: { stringValue: 'PERTURBEE' } } } } } });
    if (String(url).endsWith('/absent')) return rep(404, {});
    if (String(url).includes('/pushTokens') && !String(url).includes('pageToken')) return rep(200, { documents: [{ name: 'projects/p/databases/(default)/documents/pushTokens/a', fields: { token: { stringValue: 'T1' } } }], nextPageToken: 'suite' });
    if (String(url).includes('/pushTokens')) return rep(200, { documents: [{ name: 'projects/p/databases/(default)/documents/pushTokens/b', fields: { token: { stringValue: 'T2' } } }] });
    return rep(200, {});
  };
  const db = creerFirestore(compte, faux);
  const etat = await db.doc('systeme/alertesTrafic').get();
  assert.equal(etat.exists, true);
  assert.deepEqual(etat.data().signalees, { d1: 'PERTURBEE' });
  assert.equal((await db.doc('absent').get()).exists, false);
  const jetons = await db.collection('pushTokens').get();
  assert.deepEqual(jetons.docs.map(d => d.data().token), ['T1', 'T2']);
  await db.doc('systeme/alertesTrafic').set({ signalees: {}, miseAJour: SERVEUR_HORODATAGE });
  await db.collection('statsAlertes').add({ at: new Date(), envoyees: 1 });
  await jetons.docs[0].ref.delete();
  assert.ok(appels.some(a => a.startsWith('PATCH ') && a.endsWith('/systeme/alertesTrafic')));
  assert.ok(appels.some(a => a.startsWith('POST ') && a.endsWith('/statsAlertes')));
  assert.ok(appels.some(a => a.startsWith('DELETE ') && a.endsWith('/pushTokens/a')));
  assert.equal(appels.filter(a => a === 'POST /token').length, 1, 'un seul jeton demandé');
});
