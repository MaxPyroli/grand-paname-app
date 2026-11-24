// Mini-client Firestore pour Cloudflare Workers (REST + compte de service), sans firebase-admin.
// Il expose la partie de l'interface de firebase-admin que `functions/alertes-trafic.js` utilise :
//   db.doc(chemin).get() / .set(valeur)      db.collection(nom).get() / .add(valeur)      doc.ref.delete()
// Les dates (`Date`) et `SERVEUR_HORODATAGE` sont écrites comme des horodatages Firestore.
export const SERVEUR_HORODATAGE = { __serveurHorodatage: true };

const encodeur = new TextEncoder();
const b64url = (octets) => btoa(String.fromCharCode(...new Uint8Array(octets))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// ── Conversion valeurs JS ⟷ valeurs Firestore ───────────────────────────────────────────────────
export function versFirestore(v, maintenant = new Date()) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v === SERVEUR_HORODATAGE || (v && v.__serveurHorodatage)) return { timestampValue: maintenant.toISOString() };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(x => versFirestore(x, maintenant)) } };
  if (typeof v === 'object') return { mapValue: { fields: champs(v, maintenant) } };
  throw new Error('Valeur non prise en charge : ' + typeof v);
}
export function champs(objetJs, maintenant = new Date()) {
  const f = {};
  for (const [k, v] of Object.entries(objetJs)) if (v !== undefined) f[k] = versFirestore(v, maintenant);
  return f;
}
export function depuisFirestore(v) {
  if (!v || 'nullValue' in v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(depuisFirestore);
  if ('mapValue' in v) return objet(v.mapValue.fields);
  return null;
}
export function objet(fields = {}) {
  const o = {};
  for (const [k, v] of Object.entries(fields)) o[k] = depuisFirestore(v);
  return o;
}

// ── Authentification : jeton OAuth du compte de service (JWT signé RS256 avec WebCrypto) ─────────
async function jeton(compte, fetchFn) {
  const maintenant = Math.floor(Date.now() / 1000);
  const entete = b64url(encodeur.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const charge = b64url(encodeur.encode(JSON.stringify({
    iss: compte.client_email, scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token', iat: maintenant, exp: maintenant + 3600,
  })));
  const pem = compte.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const cle = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = b64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cle, encodeur.encode(`${entete}.${charge}`)));
  const r = await fetchFn('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${entete}.${charge}.${signature}` }),
  });
  if (!r.ok) throw new Error(`Jeton Google refusé (HTTP ${r.status})`);
  return (await r.json()).access_token;
}

// ── Client ────────────────────────────────────────────────────────────────────────────────────────
export function creerFirestore(compte, fetchFn = fetch) {
  const racine = `https://firestore.googleapis.com/v1/projects/${compte.project_id}/databases/(default)/documents`;
  let acces = null;
  const appeler = async (methode, url, corps) => {
    acces = acces || await jeton(compte, fetchFn);
    const r = await fetchFn(url, { method: methode, headers: { Authorization: `Bearer ${acces}`, 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`Firestore ${methode} refusé (HTTP ${r.status})`);
    return methode === 'DELETE' ? {} : r.json();
  };
  const refDe = (chemin) => ({ delete: () => appeler('DELETE', `${racine}/${chemin}`) });
  return {
    doc: (chemin) => ({
      get: async () => {
        const d = await appeler('GET', `${racine}/${chemin}`);
        return { exists: d !== null, data: () => (d ? objet(d.fields) : undefined) };
      },
      set: (valeur) => appeler('PATCH', `${racine}/${chemin}`, { fields: champs(valeur) }),
    }),
    collection: (nom) => ({
      add: (valeur) => appeler('POST', `${racine}/${nom}`, { fields: champs(valeur) }),
      get: async () => {
        const docs = []; let page = '';
        do {
          const d = await appeler('GET', `${racine}/${nom}?pageSize=300${page ? '&pageToken=' + encodeURIComponent(page) : ''}`);
          for (const x of (d && d.documents) || []) docs.push({ ref: refDe(x.name.split('/documents/')[1]), data: () => objet(x.fields) });
          page = (d && d.nextPageToken) || '';
        } while (page);
        return { docs };
      },
    }),
  };
}
