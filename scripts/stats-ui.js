// Interface locale pour suivre les statistiques de Grand Paname dans le navigateur : alertes trafic, appareils
// enregistrés, versions de l'app, envois de notifications.
//
// Lancement : double-clic sur `Voir-les-stats.bat`, ou  node --env-file=../app/.env stats-ui.js --ouvrir
// puis la page s'ouvre sur http://localhost:4748
//
// LECTURE SEULE : rien n'est écrit dans Firebase. Aucun jeton de notification n'est envoyé à la page (seulement des
// totaux). Le serveur n'écoute que sur cet ordinateur (127.0.0.1) et chaque demande de données exige un code secret
// généré au démarrage et placé dans la page.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const admin = require('firebase-admin');
const { agreger } = require('./stats-donnees');

const PORT = Number(process.env.PORT_STATS) || 4748;
const SECRET = crypto.randomBytes(16).toString('hex');
const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.join(__dirname, '..', 'firebase-service-account.json');
const HISTORIQUE_PATH = path.join(__dirname, 'historique-notifications.json');
const HTML_PATH = path.join(__dirname, 'stats-ui.html');
const URL_NAVITIA = 'https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia';

let db = null;
let erreurFirebase = null;
try {
  admin.initializeApp({ credential: admin.credential.cert(require(SERVICE_ACCOUNT_PATH)) });
  db = admin.firestore();
} catch (e) {
  erreurFirebase = `Impossible de charger le compte de service Firebase (${SERVICE_ACCOUNT_PATH}).`;
}

// Noms des lignes (« Métro 8 » plutôt que l'identifiant), lus une fois ; sans clé ou en cas d'échec : identifiants bruts.
let nomsLignes = null;
async function chargerNomsLignes() {
  if (nomsLignes) return nomsLignes;
  const cle = process.env.PRIM_API_KEY || process.env.EXPO_PUBLIC_NAVITIA_KEY;
  if (!cle) return null;
  try {
    const filtre = ['Metro', 'RapidTransit', 'LocalTrain', 'Tramway', 'SuspendedCableCar', 'Funicular'].map(m => `physical_mode.id=physical_mode:${m}`).join(' or ');
    const r = await fetch(`${URL_NAVITIA}/lines?filter=${encodeURIComponent(filtre)}&count=200&depth=0&disable_geojson=true&disable_disruption=true`, { headers: { apiKey: cle } });
    if (!r.ok) return null;
    const MODES = { 'physical_mode:Metro': 'Métro', 'physical_mode:RapidTransit': 'RER', 'physical_mode:LocalTrain': 'Transilien', 'physical_mode:Tramway': 'Tram', 'physical_mode:SuspendedCableCar': 'Câble', 'physical_mode:Funicular': 'Funiculaire' };
    nomsLignes = new Map(((await r.json()).lines || []).map(l => [l.id, { code: l.code || l.name, mode: MODES[l.physical_modes && l.physical_modes[0] && l.physical_modes[0].id] || '' }]));
    return nomsLignes;
  } catch { return null; }
}

const enMs = t => (t && t.toMillis ? t.toMillis() : t instanceof Date ? +t : typeof t === 'number' ? t : null);

async function calculerStats() {
  if (!db) throw new Error(erreurFirebase);
  const depuis = new Date(Date.now() - 30 * 86_400_000);
  const [jetons, bilans, noms] = await Promise.all([
    db.collection('pushTokens').get(),
    db.collection('statsAlertes').where('at', '>=', depuis).orderBy('at').get(),
    chargerNomsLignes(),
  ]);
  let historique = [];
  try { historique = JSON.parse(fs.readFileSync(HISTORIQUE_PATH, 'utf8')); } catch { /* pas d'historique local */ }
  return agreger({
    // Le jeton lui-même n'est jamais recopié.
    appareils: jetons.docs.map(d => { const x = d.data(); return { platform: x.platform, appVersion: x.appVersion, updatedAt: enMs(x.updatedAt), alertesLignes: x.alertesLignes || [] }; }),
    passages: bilans.docs.map(d => { const x = d.data(); return { ...x, at: enMs(x.at) }; }),
    historique,
    nomsLignes: noms,
  });
}

const serveur = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const repondre = (code, type, corps) => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(corps); };
  if (req.method !== 'GET') return repondre(405, 'text/plain', 'Lecture seule');
  if (url.pathname === '/') return repondre(200, 'text/html; charset=utf-8', fs.readFileSync(HTML_PATH, 'utf8').replace('__SECRET__', SECRET));
  if (url.pathname === '/api/stats') {
    if (url.searchParams.get('code') !== SECRET) return repondre(403, 'text/plain', 'Code invalide');
    try { return repondre(200, 'application/json', JSON.stringify(await calculerStats())); }
    catch (e) { return repondre(500, 'application/json', JSON.stringify({ erreur: e.message })); }
  }
  repondre(404, 'text/plain', 'Introuvable');
});

serveur.listen(PORT, '127.0.0.1', () => {
  const adresse = `http://localhost:${PORT}`;
  console.log(`Statistiques Grand Paname : ${adresse}  (Ctrl+C pour arrêter)`);
  if (process.argv.includes('--ouvrir')) exec(`start "" "${adresse}"`);
});
