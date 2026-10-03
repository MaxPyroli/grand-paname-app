// Surveillance du trafic : envoie une notification aux appareils qui suivent une ligne dont le trafic vient d'être
// interrompu ou fortement perturbé. Prévu pour tourner toutes les 5 minutes (voir .github/workflows/surveillance-trafic.yml).
//
// Fonctionnement :
//   1. lit toutes les perturbations du réseau (API « perturbations en masse » de PRIM) ;
//   2. garde celles qui sont EN COURS, de cause « perturbation » (ni travaux ni information) et de gravité
//      « bloquante » ou « perturbée » ;
//   3. les compare à celles déjà signalées (document Firestore `systeme/alertesTrafic`) : seules les NOUVELLES, ou
//      celles qui s'aggravent (perturbée → bloquante), déclenchent une notification ;
//   4. envoie, à chaque appareil qui suit au moins une des lignes concernées (champ `alertesLignes` de son document
//      `pushTokens`), UNE notification (regroupée s'il y a plusieurs lignes), via l'API Expo Push, canal « trafic ».
//
// Sécurité : par défaut c'est une SIMULATION (rien n'est envoyé, rien n'est écrit). L'envoi réel demande
// ENVOI_REEL=1. Le premier passage (aucun état enregistré) enregistre l'état sans rien envoyer.
//
// Variables d'environnement :
//   PRIM_API_KEY                  clé de l'API PRIM (ou EXPO_PUBLIC_NAVITIA_KEY)
//   FIREBASE_SERVICE_ACCOUNT      contenu JSON du compte de service (ou FIREBASE_SERVICE_ACCOUNT_PATH = chemin du fichier)
//   ENVOI_REEL=1                  envoie vraiment et enregistre l'état
//
// Usage local :  node surveillance-trafic.js          (simulation)
//                ENVOI_REEL=1 node surveillance-trafic.js

const path = require('path');

const URL_PERTURBATIONS = 'https://prim.iledefrance-mobilites.fr/marketplace/disruptions_bulk/disruptions/v2';
const URL_NAVITIA = 'https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia';
const URL_EXPO = 'https://exp.host/--/api/v2/push/send';

// Ce qui mérite une notification. Pour être plus ou moins sélectif, c'est ici.
const CAUSES_ALERTEES = ['PERTURBATION'];                   // pas TRAVAUX, pas INFORMATION
const GRAVITES_ALERTEES = { BLOQUANTE: 2, PERTURBEE: 1 };   // pas INFORMATION

const LIBELLE_MODE = { Metro: 'Métro', RapidTransit: 'RER', LocalTrain: 'Transilien', Tramway: 'Tram' };

// ── Dates (l'API donne l'heure de Paris, le serveur est en UTC) ─────────────────────────────────────────────────
const FORMAT_PARIS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Paris', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});
function decalageParis(t) {
  const p = Object.fromEntries(FORMAT_PARIS.formatToParts(new Date(t)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
}
function dateNavitia(s) {
  const commeUtc = Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(9, 11), +s.slice(11, 13), +s.slice(13, 15));
  return commeUtc - decalageParis(commeUtc);
}

// ── Détection ──────────────────────────────────────────────────────────────────────────────────────────────────
// Perturbations à signaler en ce moment : Map idPerturbation → { id, gravite, lignes: Map idLigne → ligne }.
// Une perturbation posée sur un ARRÊT (arrêt non desservi, train arrêté en station) compte, mais pour la ligne elle
// n'est « qu'une perturbation » même si sa gravité est bloquante ; posée sur la ligne entière, elle garde sa gravité.
function alertesActuelles(bulk, maintenant = Date.now()) {
  const parId = new Map((bulk.disruptions || []).map(p => [p.id, p]));
  const alertes = new Map();
  for (const l of bulk.lines || []) {
    for (const o of l.impactedObjects || []) {
      const surLaLigne = o.type === 'line';
      if (!surLaLigne && o.type !== 'stop_point') continue;
      for (const id of o.disruptionIds || []) {
        const p = parId.get(id);
        if (!p || !CAUSES_ALERTEES.includes(p.cause) || !GRAVITES_ALERTEES[p.severity]) continue;
        const periodes = p.applicationPeriods || [];
        if (!periodes.some(x => dateNavitia(x.begin) <= maintenant && maintenant <= dateNavitia(x.end))) continue;
        const a = alertes.get(id) || { id, gravite: p.severity, lignes: new Map() };
        const connue = a.lignes.get(l.id);
        a.lignes.set(l.id, {
          id: l.id, code: l.shortName, mode: l.mode,
          niveau: (connue && connue.niveau === 'interrompu') || (surLaLigne && p.severity === 'BLOQUANTE') ? 'interrompu' : 'perturbe',
        });
        alertes.set(id, a);
      }
    }
  }
  return alertes;
}

// Parmi les alertes actuelles, celles qui n'ont pas déjà été signalées (ou qui s'aggravent).
// `dejaSignalees` : objet { idPerturbation: gravité }.
function nouvellesAlertes(alertes, dejaSignalees) {
  return [...alertes.values()].filter(a => {
    const avant = dejaSignalees[a.id];
    return avant === undefined || GRAVITES_ALERTEES[a.gravite] > GRAVITES_ALERTEES[avant];
  });
}

function libelleLigne(l) {
  return `${LIBELLE_MODE[l.mode] || 'Ligne'} ${(l.code || '').replace(/^(\d+)B$/i, '$1 bis')}`.trim();
}

// ── Messages ───────────────────────────────────────────────────────────────────────────────────────────────────
// Pour un appareil qui suit `suivies` (ids de lignes) : une seule notification qui regroupe les nouvelles alertes.
// `francais` : Map idPerturbation → { titre, etiquette } (texte français de Navitia), facultatif.
function composerMessage(nouvelles, suivies, francais = new Map()) {
  const concernees = new Map();   // idLigne → { ligne, alerte }
  for (const a of nouvelles) {
    for (const l of a.lignes.values()) {
      if (!suivies.includes(l.id)) continue;
      const deja = concernees.get(l.id);
      if (!deja || (l.niveau === 'interrompu' && deja.ligne.niveau !== 'interrompu')) concernees.set(l.id, { ligne: l, alerte: a });
    }
  }
  if (concernees.size === 0) return null;
  const liste = [...concernees.values()];
  if (liste.length === 1) {
    const { ligne, alerte } = liste[0];
    const fr = francais.get(alerte.id);
    const etat = (fr && fr.etiquette) ? fr.etiquette.toLowerCase() : ligne.niveau === 'interrompu' ? 'trafic interrompu' : 'trafic perturbé';
    return {
      title: `${libelleLigne(ligne)} : ${etat}`,
      body: (fr && fr.titre) || 'Touche pour voir le détail.',
      data: { type: 'trafic', ligneId: ligne.id },
    };
  }
  return {
    title: `${liste.length} de tes lignes sont perturbées`,
    body: liste.map(x => libelleLigne(x.ligne)).join(', '),
    data: { type: 'trafic', ligneId: liste[0].ligne.id },
  };
}

// ── Réseau ─────────────────────────────────────────────────────────────────────────────────────────────────────
function attendre(ms) { return new Promise(r => setTimeout(r, ms)); }

async function lireJson(url, cle, essais = 4) {
  for (let i = 0; i < essais; i++) {
    const r = await fetch(url, { headers: { apiKey: cle } });
    if (r.ok) return r.json();
    if (r.status !== 429 && r.status < 500) throw new Error(`HTTP ${r.status} sur ${url}`);
    await attendre(800 * (i + 1));
  }
  throw new Error(`Trop d'échecs sur ${url}`);
}

// Texte français des perturbations d'une ligne (titre + étiquette courte), par identifiant de perturbation.
async function textesFrancais(idLigne, cle) {
  const sortie = new Map();
  try {
    const d = await lireJson(`${URL_NAVITIA}/lines/${encodeURIComponent(idLigne)}/line_reports?count=200&depth=0`, cle);
    for (const x of d.disruptions || []) {
      const msg = canal => ((x.messages || []).find(m => m.channel && m.channel.name === canal && m.text) || {}).text;
      const titre = msg('titre') || msg('notification');
      if (titre) sortie.set(x.id, { titre: titre.replace(/<[^>]+>/g, '').trim(), etiquette: msg('cbiv') || '' });
    }
  } catch (e) {
    console.warn(`Texte français indisponible pour ${idLigne} : ${e.message}`);
  }
  return sortie;
}

async function envoyerExpo(messages) {
  const invalides = [];
  for (let i = 0; i < messages.length; i += 100) {
    const lot = messages.slice(i, i + 100);
    const r = await fetch(URL_EXPO, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(lot),
    });
    const json = await r.json();
    (json.data || []).forEach((t, k) => {
      if (t.status === 'error') {
        // Le message d'erreur d'Expo contient le jeton : on ne garde que le code (journaux publics).
        console.warn(`Envoi refusé (${t.details && t.details.error}).`);
        if (t.details && t.details.error === 'DeviceNotRegistered') invalides.push(lot[k].to);
      }
    });
  }
  return invalides;
}

// ── Programme principal ────────────────────────────────────────────────────────────────────────────────────────
async function main() {
  const cle = process.env.PRIM_API_KEY || process.env.EXPO_PUBLIC_NAVITIA_KEY;
  if (!cle) throw new Error('PRIM_API_KEY manquante.');
  const reel = process.env.ENVOI_REEL === '1';
  console.log(reel ? 'MODE RÉEL : les notifications seront envoyées.' : 'MODE SIMULATION : rien ne sera envoyé ni écrit.');

  const admin = require('firebase-admin');
  const compte = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.join(__dirname, '..', 'firebase-service-account.json'));
  admin.initializeApp({ credential: admin.credential.cert(compte) });
  const db = admin.firestore();

  const bulk = await lireJson(URL_PERTURBATIONS, cle);
  const alertes = alertesActuelles(bulk);
  console.log(`${alertes.size} perturbation(s) à signaler en ce moment.`);

  const refEtat = db.doc('systeme/alertesTrafic');
  const etat = await refEtat.get();
  const enregistrerEtat = () => {
    const signalees = {};
    for (const a of alertes.values()) signalees[a.id] = a.gravite;
    return reel ? refEtat.set({ signalees, miseAJour: admin.firestore.FieldValue.serverTimestamp() }) : Promise.resolve();
  };

  if (!etat.exists) {
    console.log('Premier passage : état enregistré, aucune notification envoyée.');
    await enregistrerEtat();
    return;
  }

  const nouvelles = nouvellesAlertes(alertes, etat.data().signalees || {});
  console.log(`${nouvelles.length} nouvelle(s) ou aggravée(s).`);
  if (nouvelles.length === 0) { await enregistrerEtat(); return; }

  const abonnes = (await db.collection('pushTokens').get()).docs
    .map(d => ({ ref: d.ref, token: d.data().token, suivies: d.data().alertesLignes || [] }))
    .filter(a => a.token && a.suivies.length > 0);
  console.log(`${abonnes.length} appareil(s) suivent au moins une ligne.`);

  // Les textes français ne sont demandés que pour les lignes réellement suivies par quelqu'un.
  const lignesUtiles = new Set();
  for (const a of nouvelles) for (const l of a.lignes.values()) if (abonnes.some(x => x.suivies.includes(l.id))) lignesUtiles.add(l.id);
  const francais = new Map();
  for (const id of lignesUtiles) {
    for (const [k, v] of await textesFrancais(id, cle)) francais.set(k, v);
    await attendre(700);
  }

  const messages = [];
  for (const ab of abonnes) {
    const m = composerMessage(nouvelles, ab.suivies, francais);
    if (m) messages.push({ to: ab.token, sound: 'default', channelId: 'trafic', priority: 'high', ttl: 3600, ...m });
  }
  // Pas de jeton dans les journaux : le dépôt est public, les journaux d'exécution de GitHub le sont aussi.
  for (const m of messages) console.log(`→ ${m.title} | ${m.body}`);

  if (reel && messages.length > 0) {
    const invalides = await envoyerExpo(messages);
    for (const t of invalides) {
      const doc = abonnes.find(a => a.token === t);
      if (doc) { await doc.ref.delete(); console.log('Jeton périmé supprimé.'); }
    }
  }
  await enregistrerEtat();
}

module.exports = { alertesActuelles, nouvellesAlertes, composerMessage, libelleLigne, dateNavitia };

if (require.main === module) {
  main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
