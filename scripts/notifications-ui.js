// Petit outil local pour envoyer des notifications push, avec une interface
// dans le navigateur (remplace `node send-notification.js "Titre" "Message"`).
//
// Lancement : double-clic sur `Envoyer-une-notification.bat`, ou
//   node notifications-ui.js
// puis la page s'ouvre sur http://localhost:4747
//
// Prérequis (les mêmes que send-notification.js) :
//   - firebase-service-account.json à la racine du repo (ne JAMAIS le commiter)
//   - `npm install` dans ce dossier scripts/ (firebase-admin)
//
// Sécurité : le serveur n'écoute que sur cet ordinateur (127.0.0.1) et chaque
// action exige un code secret généré au démarrage et placé dans la page, pour
// qu'un autre site ouvert dans ton navigateur ne puisse pas déclencher d'envoi.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const admin = require('firebase-admin');
const { choisirDoublons } = require('./doublons');

const PORT = Number(process.env.PORT) || 4747;
const SECRET = crypto.randomBytes(16).toString('hex');
const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  || path.join(__dirname, '..', 'firebase-service-account.json');
const HISTORIQUE_PATH = path.join(__dirname, 'historique-notifications.json');
const HTML_PATH = path.join(__dirname, 'notifications-ui.html');

// `id` = channelId côté Android (voir app/notifications.ts).
const CATEGORIES = {
  trafic:  { id: 'trafic',  nom: 'Info Trafic',   emoji: '🚦' },
  maj:     { id: 'maj',     nom: 'Mises à jour',  emoji: '⬆️' },
  default: { id: 'default', nom: 'Autres',        emoji: '🔔' },
};

let db = null;
let erreurFirebase = null;
try {
  const serviceAccount = require(SERVICE_ACCOUNT_PATH);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  db = admin.firestore();
} catch (e) {
  erreurFirebase = `Impossible de charger le compte de service Firebase (${SERVICE_ACCOUNT_PATH}).`;
}

// ── Historique ────────────────────────────────────────────────────────────────

function lireHistorique() {
  try { return JSON.parse(fs.readFileSync(HISTORIQUE_PATH, 'utf8')); } catch { return []; }
}
function ajouterHistorique(entree) {
  const h = lireHistorique();
  h.unshift(entree);
  fs.writeFileSync(HISTORIQUE_PATH, JSON.stringify(h.slice(0, 100), null, 2), 'utf8');
}

// ── Appareils (Firestore) ─────────────────────────────────────────────────────

const millis = x => x.updatedAt?.toMillis?.() || 0;

// `nettoyer` : supprime les anciens jetons d'un MÊME téléphone. L'app enregistre
// une empreinte du téléphone (`deviceKey`, voir app/notifications.ts) ; quand
// plusieurs lignes la partagent (réinstallation, nouveau jeton), on ne garde que
// la plus récente. Les anciennes lignes sans empreinte ne peuvent pas être
// regroupées : voir `appareilsInactifs`.
async function listerAppareils({ nettoyer = false } = {}) {
  if (!db) throw new Error(erreurFirebase);
  const snap = await db.collection('pushTokens').get();
  let docs = snap.docs.map(d => ({ ref: d.ref, x: d.data() })).filter(d => d.x.token);
  let supprimes = 0;

  if (nettoyer) {
    const aSupprimer = choisirDoublons(docs, millis);
    if (aSupprimer.size > 0) {
      await Promise.all([...aSupprimer].map(d => d.ref.delete()));
      supprimes = aSupprimer.size;
      docs = docs.filter(d => !aSupprimer.has(d));
    }
  }

  const appareils = docs.map(({ x }) => ({
    token: x.token,
    plateforme: x.platform || '?',
    version: x.appVersion || '?',
    maj: x.updatedAt?.toDate?.()?.toISOString() || null,
    identifie: !!x.deviceKey,
  }));
  appareils.sort((a, b) => (b.maj || '').localeCompare(a.maj || ''));
  return { appareils, supprimes };
}

// Appareils qui n'ont pas ouvert l'app depuis `jours` jours (ou jamais).
async function appareilsInactifs(jours) {
  if (!db) throw new Error(erreurFirebase);
  const limite = Date.now() - jours * 24 * 3600 * 1000;
  const snap = await db.collection('pushTokens').get();
  return snap.docs.filter(d => millis(d.data()) < limite);
}

// ── Envoi ─────────────────────────────────────────────────────────────────────

const jobs = new Map();

function decouper(arr, taille) {
  const out = [];
  for (let i = 0; i < arr.length; i += taille) out.push(arr.slice(i, i + taille));
  return out;
}
const attendre = ms => new Promise(r => setTimeout(r, ms));
const court = t => `${t.slice(0, 22)}…${t.slice(-6)}`;

async function lancerEnvoi(job, { categorie, titre, message, cible, token, simulation }) {
  const log = (texte, type = 'info') => job.lignes.push({ texte, type });
  try {
    const { appareils } = await listerAppareils({ nettoyer: true });
    const il_y_a_30_jours = Date.now() - 30 * 24 * 3600 * 1000;
    const destinataires = cible === 'un' ? appareils.filter(a => a.token === token)
      : cible === 'recents' ? appareils.filter(a => a.maj && new Date(a.maj).getTime() >= il_y_a_30_jours)
      : appareils;
    if (destinataires.length === 0) { log('Aucun appareil destinataire.', 'erreur'); job.termine = true; return; }
    const tokens = destinataires.map(a => a.token);

    if (simulation) {
      log(`SIMULATION : rien n'est envoyé. Cette notification partirait vers ${tokens.length} appareil(s) dans la catégorie « ${CATEGORIES[categorie].nom} ».`, 'ok');
      job.resume = { envoyes: 0, livres: 0, echecs: 0, simulation: true, destinataires: tokens.length };
      job.termine = true;
      return;
    }

    log(`Envoi à ${tokens.length} appareil(s)…`);
    const invalides = new Set();
    const ticketVersToken = new Map();
    let echecs = 0;

    for (const lot of decouper(tokens, 100)) {
      const messages = lot.map(to => ({
        to, title: titre, body: message, sound: 'default',
        channelId: CATEGORIES[categorie].id, priority: 'high',
        data: { categorie },
      }));
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Accept-encoding': 'gzip, deflate', 'Content-Type': 'application/json' },
        body: JSON.stringify(messages),
      });
      const json = await res.json();
      (json.data || []).forEach((t, i) => {
        if (t.status === 'error') {
          echecs++;
          log(`Erreur pour ${court(lot[i])} : ${t.message}`, 'erreur');
          if (t.details?.error === 'DeviceNotRegistered') invalides.add(lot[i]);
        } else if (t.id) {
          ticketVersToken.set(t.id, lot[i]);
        }
      });
    }

    // Un ticket "ok" dit seulement qu'Expo a transmis le message à Google ; la
    // vraie livraison ne se sait qu'avec les reçus, dispos quelques secondes après.
    let livres = 0;
    if (ticketVersToken.size > 0) {
      log('Vérification de la livraison (une quinzaine de secondes)…');
      await attendre(15000);
      for (const ids of decouper([...ticketVersToken.keys()], 300)) {
        const res = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
          method: 'POST',
          headers: { Accept: 'application/json', 'Accept-encoding': 'gzip, deflate', 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids }),
        });
        const recus = (await res.json()).data || {};
        for (const id of ids) {
          const tk = ticketVersToken.get(id);
          const r = recus[id];
          if (!r) { log(`Reçu introuvable pour ${court(tk)}`, 'erreur'); echecs++; }
          else if (r.status === 'error') {
            echecs++;
            log(`Échec de livraison pour ${court(tk)} : ${r.message}`, 'erreur');
            if (r.details?.error === 'DeviceNotRegistered') invalides.add(tk);
          } else { livres++; log(`Livré à ${court(tk)}`, 'ok'); }
        }
      }
    }

    if (invalides.size > 0) {
      log(`Nettoyage de ${invalides.size} appareil(s) qui n'existent plus…`);
      await Promise.all([...invalides].map(t => db.collection('pushTokens').doc(t).delete()));
    }

    job.resume = { envoyes: tokens.length, livres, echecs, simulation: false, destinataires: tokens.length };
    ajouterHistorique({
      date: new Date().toISOString(), categorie, titre, message,
      cible: cible === 'un' ? 'un appareil' : cible === 'recents' ? 'actifs (30 j)' : 'tous', destinataires: tokens.length, livres, echecs,
    });
    log('Terminé.', 'ok');
  } catch (e) {
    log(`Erreur : ${e.message}`, 'erreur');
  } finally {
    job.termine = true;
  }
}

// ── Serveur HTTP ──────────────────────────────────────────────────────────────

function envoyerJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function lireCorps(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 100_000) { reject(new Error('trop gros')); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); } });
  });
}

const serveur = http.createServer(async (req, res) => {
  // Protection contre le "DNS rebinding" : on n'accepte que localhost.
  const hote = (req.headers.host || '').split(':')[0];
  if (hote !== 'localhost' && hote !== '127.0.0.1') { res.writeHead(403); return res.end('Interdit'); }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/') {
    const html = fs.readFileSync(HTML_PATH, 'utf8')
      .replace('__SECRET__', SECRET)
      .replace('__CATEGORIES__', JSON.stringify(Object.values(CATEGORIES)))
      .replace('__ERREUR_FIREBASE__', JSON.stringify(erreurFirebase));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(html);
  }

  if (url.pathname.startsWith('/api/')) {
    if (req.headers['x-secret'] !== SECRET) return envoyerJson(res, 403, { erreur: 'Code secret invalide (recharge la page).' });
    try {
      if (req.method === 'GET' && url.pathname === '/api/appareils') {
        return envoyerJson(res, 200, await listerAppareils({ nettoyer: true }));
      }
      if (req.method === 'GET' && url.pathname === '/api/inactifs') {
        const jours = Math.max(7, Number(url.searchParams.get('jours')) || 60);
        return envoyerJson(res, 200, { jours, nombre: (await appareilsInactifs(jours)).length });
      }
      if (req.method === 'POST' && url.pathname === '/api/nettoyer') {
        const b = await lireCorps(req);
        const jours = Math.max(7, Number(b.jours) || 60);
        const aSupprimer = await appareilsInactifs(jours);
        await Promise.all(aSupprimer.map(d => d.ref.delete()));
        return envoyerJson(res, 200, { supprimes: aSupprimer.length });
      }
      if (req.method === 'GET' && url.pathname === '/api/historique') {
        return envoyerJson(res, 200, { historique: lireHistorique() });
      }
      if (req.method === 'GET' && url.pathname.startsWith('/api/envoi/')) {
        const job = jobs.get(url.pathname.split('/').pop());
        return job ? envoyerJson(res, 200, job) : envoyerJson(res, 404, { erreur: 'Envoi inconnu.' });
      }
      if (req.method === 'POST' && url.pathname === '/api/envoyer') {
        const b = await lireCorps(req);
        const titre = String(b.titre || '').trim();
        const message = String(b.message || '').trim();
        if (!CATEGORIES[b.categorie]) return envoyerJson(res, 400, { erreur: 'Catégorie inconnue.' });
        if (!titre || !message) return envoyerJson(res, 400, { erreur: 'Le titre et le message sont obligatoires.' });
        if (titre.length > 80 || message.length > 300) return envoyerJson(res, 400, { erreur: 'Titre (80) ou message (300) trop long.' });
        if (b.cible === 'un' && !b.token) return envoyerJson(res, 400, { erreur: 'Choisis un appareil.' });
        const id = crypto.randomBytes(6).toString('hex');
        const job = { id, lignes: [], termine: false, resume: null };
        jobs.set(id, job);
        lancerEnvoi(job, { categorie: b.categorie, titre, message, cible: b.cible, token: b.token, simulation: !!b.simulation });
        return envoyerJson(res, 200, { id });
      }
      return envoyerJson(res, 404, { erreur: 'Introuvable.' });
    } catch (e) {
      return envoyerJson(res, 500, { erreur: e.message });
    }
  }

  res.writeHead(404); res.end('Introuvable');
});

serveur.listen(PORT, '127.0.0.1', () => {
  const adresse = `http://localhost:${PORT}`;
  console.log(`Outil d'envoi de notifications : ${adresse}`);
  console.log('(Ctrl+C pour arrêter)');
  if (erreurFirebase) console.warn(erreurFirebase);
  if (process.argv.includes('--ouvrir')) {
    const cmd = process.platform === 'win32' ? `start "" "${adresse}"` : process.platform === 'darwin' ? `open "${adresse}"` : `xdg-open "${adresse}"`;
    exec(cmd);
  }
});
