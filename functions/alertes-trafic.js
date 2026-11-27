// Surveillance du trafic — logique commune (Cloud Function Firebase `functions/index.js` et programme manuel
// `scripts/surveillance-trafic.js`). Envoie une notification aux appareils qui suivent une ligne dont le trafic vient
// d'être interrompu ou perturbé.
//
// Fonctionnement :
//   1. lit toutes les perturbations du réseau (API « perturbations en masse » de PRIM) ;
//   2. garde celles qui sont EN COURS, de cause « perturbation » (ni travaux ni information) et de gravité
//      « bloquante » ou « perturbée » ;
//   3. les compare à celles déjà signalées (document Firestore `systeme/alertesTrafic`) : seules les NOUVELLES, ou
//      celles qui s'aggravent (perturbée → bloquante), sont examinées ; une mise à jour d'un incident déjà signalé sur
//      la ligne n'est renvoyée que si son état change (voir « Doublons ») ;
//   4. envoie, à chaque appareil qui suit au moins une des lignes concernées (champ `alertesLignes` de son document
//      `pushTokens`), UNE notification par nouvelle perturbation et par ligne suivie (regroupées au-delà de 5), via l'API Expo Push, canal « trafic ».
//
// Sécurité : en SIMULATION (reel = false) rien n'est envoyé et rien n'est écrit. Le premier passage (aucun état
// enregistré) enregistre l'état sans rien envoyer.

const URL_PERTURBATIONS = 'https://prim.iledefrance-mobilites.fr/marketplace/disruptions_bulk/disruptions/v2';
const URL_NAVITIA = 'https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia';
const URL_EXPO = 'https://exp.host/--/api/v2/push/send';

// Ce qui mérite une notification. Pour être plus ou moins sélectif, c'est ici.
const CAUSES_ALERTEES = ['PERTURBATION'];                   // pas TRAVAUX, pas INFORMATION
const GRAVITES_ALERTEES = { BLOQUANTE: 2, PERTURBEE: 1 };   // pas INFORMATION

// Réglage « Me prévenir pour » de l'app (champ `alertesNiveau` du jeton ; absent = 'standard') :
//   'toutes'         interruptions, perturbations et INFORMATIONS (les travaux ne sont envoyés à personne, voir plus bas)
//   'standard'       interruptions et perturbations
//   'interruptions'  seulement le trafic annoncé comme interrompu
const NIVEAUX = ['toutes', 'standard', 'interruptions'];

const LIBELLE_MODE = { Metro: 'Métro', RapidTransit: 'RER', LocalTrain: 'Transilien', Tramway: 'Tram', Bus: 'Bus' };

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
function alertesActuelles(bulk, maintenant = Date.now(), avecInfos = false) {
  const parId = new Map((bulk.disruptions || []).map(p => [p.id, p]));
  const alertes = new Map();
  for (const l of bulk.lines || []) {
    for (const o of l.impactedObjects || []) {
      const surLaLigne = o.type === 'line';
      if (!surLaLigne && o.type !== 'stop_point') continue;
      for (const id of o.disruptionIds || []) {
        const p = parId.get(id);
        if (!p) continue;
        const perturbation = CAUSES_ALERTEES.includes(p.cause) && !!GRAVITES_ALERTEES[p.severity];
        const information = !perturbation && p.cause !== 'TRAVAUX' && (p.cause === 'INFORMATION' || p.severity === 'INFORMATION');
        if (!perturbation && !(avecInfos && information)) continue;
        const periodes = p.applicationPeriods || [];
        if (!periodes.some(x => dateNavitia(x.begin) <= maintenant && maintenant <= dateNavitia(x.end))) continue;
        const a = alertes.get(id) || { id, gravite: perturbation ? p.severity : 'INFORMATION', ...(perturbation ? {} : { information: true }), lignes: new Map() };
        const connue = a.lignes.get(l.id);
        a.lignes.set(l.id, {
          id: l.id, code: l.shortName, mode: l.mode,
          niveau: !perturbation ? 'info' : (connue && connue.niveau === 'interrompu') || (surLaLigne && p.severity === 'BLOQUANTE') ? 'interrompu' : 'perturbe',
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
    return avant === undefined || (GRAVITES_ALERTEES[a.gravite] || 0) > (GRAVITES_ALERTEES[avant] || 0);
  });
}

function libelleLigne(l) {
  return `${LIBELLE_MODE[l.mode] || 'Ligne'} ${(l.code || '').replace(/^(\d+)B$/i, '$1 bis')}`.trim();
}

// ── Doublons ───────────────────────────────────────────────────────────────────────────────────────────────────
// Décision de l'utilisateur (27/11/2026) : pas quinze notifications pour une perturbation qui évolue, sans en rater une
// autre. IDFM publie une NOUVELLE annonce à chaque mise à jour, mais elles gardent le même numéro d'incident
// (`disruption_id`). Pour un couple ligne + incident, on ne prévient à nouveau que si son ÉTAT change. Un autre numéro
// d'incident (ou pas de numéro) donne toujours sa propre notification.
const RANG_ETAT = { reprise: 0, mineur: 0.5, info: 1, perturbe: 1, tres: 2, interrompu: 3 };
const ATTENTE_TEXTE_MS = 4 * 60_000;          // une annonce sans texte attend le sien (sauf ligne interrompue)
const OUBLI_INCIDENT_MS = 3 * 3_600_000;      // incident sans annonce en cours depuis ce délai : oublié

// « reprise », « interrompu », « tres » (perturbé) ou « perturbe » ; d'après le titre et l'étiquette, pas le détail
// (il contient des « reprise estimée à 10h » qui ne sont pas des reprises).
function etatAnnonce(niveau, fr) {
  if (niveau === 'info') return 'info';
  const t = `${(fr && fr.etiquette) || ''} ${(fr && fr.titre) || ''}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/reprise|reprend/.test(t)) return 'reprise';
  if (niveau === 'interrompu' || /interrompu/.test(t)) return 'interrompu';
  if (/(tres|fortement) perturbe/.test(t)) return 'tres';
  // Petits ralentissements : rangés dans les informations. S'ils s'aggravent, l'état change et la perturbation part.
  if (/trains? stationne(nt)?|stationnement prolonge|vitesse reduite/.test(t)) return 'mineur';
  return 'perturbe';
}

// Les trois catégories de notifications Android de l'app (une par niveau d'alerte) :
//   information   informations, petits ralentissements, précisions sur un incident sans changement d'état
//   perturbation  perturbations, aggravations, reprises
//   interruption  trafic interrompu
function categorieAlerte(ligne, fr) {
  if (ligne.maj || ligne.niveau === 'info') return 'information';
  const etat = etatAnnonce(ligne.niveau, fr);
  return etat === 'mineur' ? 'information' : etat === 'interrompu' ? 'interruption' : 'perturbation';
}

// Ce qu'un appareil veut recevoir. `categories` : son app connaît les trois catégories (3.4.1 et suivantes). Les apps
// plus anciennes, qui n'ont pas de réglage, continuent de recevoir ce qu'elles recevaient (petits ralentissements
// compris, sans informations ni précisions).
function voulue(niveau, ligne, fr, categories = true) {
  if (!categories && niveau === 'standard') return !ligne.maj && ligne.niveau !== 'info';
  const categorie = categorieAlerte(ligne, fr);
  if (categorie === 'information') return niveau === 'toutes';
  return niveau !== 'interruptions' || categorie === 'interruption';
}

// Parmi les annonces nouvelles ou aggravées, ce qui mérite vraiment une notification.
// `memoire` : { « ligne|incident » : { etat, annonces: [ids], vu: ms } } ; `attente` : { idAnnonce : ms du premier passage }.
// Rend les annonces à envoyer (limitées aux lignes concernées), les nouvelles mémoire et attente, les annonces retenues
// (à ne PAS marquer comme signalées) et le nombre de mises à jour écartées.
function trierNouvelles({ nouvelles, alertes, francais = new Map(), suivies, memoire = {}, attente = {}, maintenant = Date.now() }) {
  const suite = {};
  for (const [cle, m] of Object.entries(memoire)) {
    const vu = m.annonces.some(id => alertes.has(id)) ? maintenant : m.vu;
    if (maintenant - vu <= OUBLI_INCIDENT_MS) suite[cle] = { ...m, vu };
  }
  const retenues = new Set(); const attenteSuite = {};
  const groupes = new Map();   // « ligne|incident » (ou « ligne|?annonce ») → candidats
  for (const a of nouvelles) {
    const fr = francais.get(a.id);
    const concernees = [...a.lignes.values()].filter(l => suivies.has(l.id));
    if (concernees.length === 0) continue;
    if (!(fr && fr.titre) && !concernees.some(l => l.niveau === 'interrompu')) {
      const depuis = attente[a.id] ?? maintenant;
      if (maintenant - depuis < ATTENTE_TEXTE_MS) { retenues.add(a.id); attenteSuite[a.id] = depuis; continue; }
    }
    for (const l of concernees) {
      const incident = (fr && fr.disruptionId) || '';
      // Les informations d'un incident se suivent à part de ses perturbations.
      const cle = `${l.id}|${l.niveau === 'info' ? 'info:' : ''}${incident || '?' + a.id}`;
      if (!groupes.has(cle)) groupes.set(cle, { incident, candidats: [] });
      const contenu = `${(fr && fr.titre) || ''} ${(fr && fr.detail) || ''}`.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 300);
      groupes.get(cle).candidats.push({ a, l, etat: etatAnnonce(l.niveau, fr), texte: !!(fr && fr.titre), contenu });
    }
  }

  const choisies = new Map();  // idAnnonce → annonce limitée aux lignes à notifier
  let ecartees = 0;
  for (const [cle, { incident, candidats }] of groupes) {
    // Plusieurs annonces du même incident en même temps : la plus grave, avec du texte de préférence.
    candidats.sort((x, y) => RANG_ETAT[y.etat] - RANG_ETAT[x.etat] || y.texte - x.texte);
    const meilleur = candidats[0];
    ecartees += candidats.length - 1;
    const avant = incident ? suite[cle] : undefined;
    let etat = meilleur.etat;
    let garde = false;
    if (avant && etat !== 'reprise' && RANG_ETAT[etat] < RANG_ETAT[avant.etat]) {
      // Une annonce plus légère ne vaut « amélioration » que si plus aucune annonce en cours ne porte l'état précédent.
      const encore = [...alertes.values()].some(a => {
        const fr = francais.get(a.id); const l = a.lignes.get(meilleur.l.id);
        return l && fr && fr.disruptionId === incident && RANG_ETAT[etatAnnonce(l.niveau, fr)] >= RANG_ETAT[avant.etat];
      });
      if (encore) { etat = avant.etat; garde = true; }
    }
    if (incident) {
      const annonces = [...new Set([...(avant ? avant.annonces : []), ...candidats.map(c => c.a.id)])].slice(-20);
      const texte = !garde && meilleur.texte ? meilleur.contenu : avant && avant.texte;
      suite[cle] = { etat, annonces, vu: maintenant, ...(texte ? { texte } : {}) };
    }
    let { a, l } = meilleur;
    if (avant && avant.etat === etat) {
      // Même état : nouvelle précision seulement si le texte a changé (jamais une annonce plus légère qui cohabite).
      if (garde || !meilleur.texte || meilleur.contenu === avant.texte) { ecartees++; continue; }
      l = { ...l, maj: true };
    }
    if (!choisies.has(a.id)) choisies.set(a.id, { ...a, lignes: new Map() });
    choisies.get(a.id).lignes.set(l.id, l);
  }
  return { aEnvoyer: [...choisies.values()], memoire: suite, attente: attenteSuite, retenues, ecartees };
}

// ── Messages ───────────────────────────────────────────────────────────────────────────────────────────────────
// Pour un appareil qui suit `suivies` (ids de lignes) : une seule notification qui regroupe les nouvelles alertes.
// `francais` : Map idPerturbation → { titre, etiquette } (texte français de Navitia), facultatif.
// UNE notification par nouvelle perturbation (après le tri des doublons) et par ligne suivie (« RER B : trafic interrompu »). Au-delà de
// MAX_PAR_PASSAGE notifications pour un même appareil en un passage, les autres sont regroupées en une seule.
const MAX_PAR_PASSAGE = 5;
const LONGUEUR_MAX_CORPS = 400;
// Titre de l'annonce, puis son détail (tronqué : une notification n'est pas un article).
function corpsNotification(fr) {
  if (!fr || !fr.titre) return '';   // pas de texte : pas de corps (plutôt qu'un « Touche pour voir le détail » générique)
  const texte = fr.detail ? `${fr.titre}\n${fr.detail}` : fr.titre;
  return texte.length <= LONGUEUR_MAX_CORPS ? texte : texte.slice(0, LONGUEUR_MAX_CORPS - 1).trimEnd() + '…';
}
function composerMessages(nouvelles, suivies, francais = new Map(), niveau = 'standard', categories = true) {
  const liste = [];   // { ligne, alerte }
  for (const a of nouvelles) {
    for (const l of a.lignes.values()) if (suivies.includes(l.id) && voulue(niveau, l, francais.get(a.id), categories)) liste.push({ ligne: l, alerte: a });
  }
  // Les plus graves d'abord (interruptions, puis perturbations), pour qu'elles ne soient jamais celles qu'on regroupe.
  const POIDS = { interruption: 2, perturbation: 1, information: 0 };
  const categorieDe = x => categorieAlerte(x.ligne, francais.get(x.alerte.id));
  liste.sort((x, y) => POIDS[categorieDe(y)] - POIDS[categorieDe(x)]);
  const un = ({ ligne, alerte }) => {
    const fr = francais.get(alerte.id);
    const etat = (fr && fr.etiquette) ? fr.etiquette.toLowerCase() : ligne.niveau === 'interrompu' ? 'trafic interrompu' : ligne.niveau === 'info' ? 'information' : 'trafic perturbé';
    const data = { type: 'trafic', ligneId: ligne.id, categorie: categorieAlerte(ligne, fr) };
    // L'annonce voyage avec la notification : l'app la garde en mémoire et peut l'afficher « terminée » si elle l'est au toucher.
    if (fr && fr.titre) data.perturbation = { id: alerte.id, titre: fr.titre, detail: (fr.detail || '').slice(0, 300), niveau: ligne.niveau };
    const corps = corpsNotification(fr);
    const remplace = fr && fr.disruptionId ? { tag: `trafic-${ligne.id}-${fr.disruptionId}` } : {};
    return { title: `${libelleLigne(ligne)} : ${etat}`, ...(corps ? { body: corps } : {}), ...remplace, data };
  };
  if (liste.length <= MAX_PAR_PASSAGE) return liste.map(un);
  const reste = liste.slice(MAX_PAR_PASSAGE - 1);
  return [
    ...liste.slice(0, MAX_PAR_PASSAGE - 1).map(un),
    {
      title: `${reste.length} autres perturbations sur tes lignes`,
      body: [...new Set(reste.map(x => libelleLigne(x.ligne)))].join(', '),
      data: { type: 'trafic', ligneId: reste[0].ligne.id, categorie: categorieDe(reste[0]) },
    },
  ];
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

// Les messages Navitia contiennent du HTML et des entités (« &#233; », « &lt; »).
const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function nettoyerTexte(brut) {
  return String(brut || '')
    .replace(/<\s*br\s*\/?>|<\/p>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&([a-z]+);/gi, (m, nom) => ENTITES[nom.toLowerCase()] ?? m)
    .replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n')
    .trim();
}

// Texte français des perturbations d'une ligne (titre + étiquette courte), par identifiant de perturbation.
async function textesFrancais(idLigne, cle) {
  const sortie = new Map();
  try {
    const d = await lireJson(`${URL_NAVITIA}/lines/${encodeURIComponent(idLigne)}/line_reports?count=200&depth=0`, cle);
    for (const x of d.disruptions || []) {
      const msg = canal => ((x.messages || []).find(m => m.channel && m.channel.name === canal && m.text) || {}).text;
      const titre = msg('titre') || msg('notification');
      const net = nettoyerTexte(titre || '');
      const detail = nettoyerTexte(msg('moteur') || msg('email') || msg('web') || msg('mobile') || '');
      sortie.set(x.id, {
        titre: net, detail: detail === net ? '' : detail, etiquette: msg('cbiv') || '',
        // Pour le journal des envois seulement : savoir ce qui reste stable d'une mise à jour d'un incident à l'autre.
        disruptionId: x.disruption_id || '', impactId: x.impact_id || '', majAnnonce: x.updated_at || '',
        periodes: (x.application_periods || []).slice(0, 4).map(p => `${p.begin}>${p.end}`),
      });
    }
  } catch (e) {
    console.warn(`Texte français indisponible pour ${idLigne} : ${e.message}`);
  }
  return sortie;
}

// Journal de ce qui a été ENVOYÉ (collection Firestore `journalAlertes`, lue par scripts/journal-alertes.js), pour
// comprendre les répétitions : une entrée par couple annonce + ligne envoyé à au moins un appareil. Aucun jeton ni rien
// sur les appareils, seulement leur nombre.
function entreesJournal(nouvelles, abonnes, francais, dejaSignalees) {
  const entrees = [];
  for (const a of nouvelles) {
    for (const l of a.lignes.values()) {
      const destinataires = abonnes.filter(x => x.suivies.includes(l.id) && voulue(x.niveau || 'standard', l, francais.get(a.id), !!x.categories)).length;
      if (destinataires === 0) continue;
      const fr = francais.get(a.id) || {};
      entrees.push({
        ligneId: l.id, ligne: libelleLigne(l), perturbationId: a.id, gravite: a.gravite, niveau: l.niveau,
        motifEnvoi: l.maj ? 'precision' : dejaSignalees[a.id] === undefined ? 'nouvelle' : 'aggravation',
        categorie: categorieAlerte(l, francais.get(a.id)),
        disruptionId: fr.disruptionId || '', impactId: fr.impactId || '', majAnnonce: fr.majAnnonce || '', periodes: fr.periodes || [],
        etiquette: fr.etiquette || '', titre: fr.titre || '', detail: (fr.detail || '').slice(0, 1500), destinataires,
      });
    }
  }
  return entrees;
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

// ── Observation des travaux ───────────────────────────────────────────────────────────────────────────────────
// Les travaux ne sont envoyés à PERSONNE. On note pendant quelques jours les nouvelles annonces (collection
// `journalTravaux`, lue par scripts/journal-travaux.js) pour décider ensuite s'ils méritent des notifications.
function travauxActuels(bulk, maintenant = Date.now()) {
  const parId = new Map((bulk.disruptions || []).map(p => [p.id, p]));
  const travaux = new Map();
  for (const l of bulk.lines || []) {
    for (const o of l.impactedObjects || []) {
      if (o.type !== 'line' && o.type !== 'stop_point') continue;
      for (const id of o.disruptionIds || []) {
        const p = parId.get(id);
        if (!p || p.cause !== 'TRAVAUX') continue;
        if (!(p.applicationPeriods || []).some(x => dateNavitia(x.begin) <= maintenant && maintenant <= dateNavitia(x.end))) continue;
        const t = travaux.get(id) || { id, gravite: p.severity, titre: nettoyerTexte(p.title).slice(0, 200), detail: nettoyerTexte(p.message).slice(0, 500), lignes: new Map() };
        t.lignes.set(l.id, libelleLigne({ mode: l.mode, code: l.shortName }));
        travaux.set(id, t);
      }
    }
  }
  return travaux;
}

// ── Passage complet ────────────────────────────────────────────────────────────────────────────────────────────
// `db` : Firestore (firebase-admin) ; `horodatage` : admin.firestore.FieldValue.serverTimestamp() ; `cle` : clé PRIM ;
// `reel` : envoyer et écrire pour de bon ; `journal` : où écrire les messages (jamais de jeton dedans).
// En réel, chaque passage laisse un petit bilan dans la collection Firestore `statsAlertes` (voir scripts/stats-alertes.js) :
// heure, perturbations vues, nouvelles, appareils abonnés, notifications envoyées, durée, erreur éventuelle.
async function executerSurveillance({ db, horodatage, cle, reel, journal = console.log, notifierDev = false }) {
  const debut = Date.now();
  const bilan = { at: new Date(debut), perturbations: 0, nouvelles: 0, abonnes: 0, envoyees: 0, jetonsPerimes: 0, premierPassage: false, erreur: null };
  try {
    await passer({ db, horodatage, cle, reel, journal, bilan, notifierDev });
  } catch (e) {
    bilan.erreur = String(e && e.message || e).slice(0, 200);
    throw e;
  } finally {
    bilan.dureeMs = Date.now() - debut;
    if (reel) {
      try { await db.collection('statsAlertes').add(bilan); } catch (e) { journal(`Bilan non enregistré : ${e.message}`); }
    }
  }
}

async function passer({ db, horodatage, cle, reel, journal, bilan, notifierDev }) {
  journal(reel ? 'MODE RÉEL : les notifications seront envoyées.' : 'MODE SIMULATION : rien ne sera envoyé ni écrit.');

  const bulk = await lireJson(URL_PERTURBATIONS, cle);
  const alertes = alertesActuelles(bulk, Date.now(), true);
  bilan.perturbations = alertes.size;
  journal(`${alertes.size} perturbation(s) à signaler en ce moment.`);

  const refEtat = db.doc('systeme/alertesTrafic');
  const etat = await refEtat.get();
  const avant = (etat.exists && etat.data()) || {};
  const dejaSignalees = { ...(avant.signalees || {}) };
  // Premier passage depuis que les informations sont suivies : celles déjà en cours ne sont pas « nouvelles ».
  if (etat.exists && !avant.suitInfos) for (const a of alertes.values()) if (a.information) dejaSignalees[a.id] ??= a.gravite;
  // Travaux : on observe les nouveaux (le premier passage ne fait que les repérer).
  const travaux = travauxActuels(bulk);
  const travauxNouveaux = avant.travauxVus ? [...travaux.values()].filter(t => !avant.travauxVus.includes(t.id)) : [];
  let tri = { memoire: avant.incidents || {}, attente: {}, retenues: new Set() };
  const enregistrerEtat = () => {
    const signalees = {};
    for (const a of alertes.values()) {
      // Une annonce retenue (texte attendu) garde son ancienne valeur : elle sera réexaminée au passage suivant.
      if (!tri.retenues.has(a.id)) signalees[a.id] = a.gravite;
      else if (dejaSignalees[a.id] !== undefined) signalees[a.id] = dejaSignalees[a.id];
    }
    return reel ? refEtat.set({ signalees, incidents: tri.memoire, attente: tri.attente, suitInfos: true, travauxVus: [...travaux.keys()], miseAJour: horodatage }) : Promise.resolve();
  };

  if (!etat.exists) {
    bilan.premierPassage = true;
    journal('Premier passage : état enregistré, aucune notification envoyée.');
    await enregistrerEtat();
    return;
  }

  if (reel && travauxNouveaux.length > 0) {
    try {
      await db.collection('journalTravaux').add({ at: new Date(), travaux: travauxNouveaux.slice(0, 40).map(t => ({ id: t.id, gravite: t.gravite, titre: t.titre, detail: t.detail, lignes: [...t.lignes.values()].slice(0, 20) })) });
    } catch (e) { journal(`Observation des travaux non enregistrée : ${e.message}`); }
  }

  const nouvelles = nouvellesAlertes(alertes, dejaSignalees);
  bilan.nouvelles = nouvelles.length;
  journal(`${nouvelles.length} nouvelle(s) ou aggravée(s).`);
  const trier = (francais, suivies) => trierNouvelles({ nouvelles, alertes, francais, suivies, memoire: avant.incidents || {}, attente: avant.attente || {} });
  if (nouvelles.length === 0) { tri = trier(new Map(), new Set()); await enregistrerEtat(); return; }

  const abonnes = (await db.collection('pushTokens').get()).docs
    .map(d => ({ ref: d.ref, token: d.data().token, suivies: d.data().alertesLignes || [], dev: d.data().variante === 'dev', niveau: NIVEAUX.includes(d.data().alertesNiveau) ? d.data().alertesNiveau : 'standard', categories: (d.data().canaux || 0) >= 2 }))
    // Les installations de DÉVELOPPEMENT (variante « dev », écrite par l'app) ne reçoivent pas les alertes réelles : elles
    // doublaient celles de la version stable sur le téléphone du développeur. `notifierDev` pour les inclure.
    .filter(a => a.token && a.suivies.length > 0 && (notifierDev || !a.dev));
  bilan.abonnes = abonnes.length;
  journal(`${abonnes.length} appareil(s) suivent au moins une ligne.`);

  // Les textes français ne sont demandés que pour les lignes réellement suivies par quelqu'un.
  const suivies = new Set(abonnes.flatMap(x => x.suivies));
  // Une information n'intéresse que les abonnés réglés sur « Toutes ».
  const suiviesInfos = new Set(abonnes.filter(x => x.niveau === 'toutes').flatMap(x => x.suivies));
  const lignesUtiles = new Set();
  for (const a of nouvelles) for (const l of a.lignes.values()) if ((a.information ? suiviesInfos : suivies).has(l.id)) lignesUtiles.add(l.id);
  const francais = new Map();
  for (const id of lignesUtiles) {
    for (const [k, v] of await textesFrancais(id, cle)) francais.set(k, v);
    await attendre(700);
  }

  tri = trierNouvelles({ nouvelles: nouvelles.filter(a => !a.information || [...a.lignes.keys()].some(id => suiviesInfos.has(id))), alertes, francais, suivies, memoire: avant.incidents || {}, attente: avant.attente || {} });
  if (tri.ecartees > 0) journal(`${tri.ecartees} mise(s) à jour sans changement d'état, non renvoyée(s).`);
  if (tri.retenues.size > 0) journal(`${tri.retenues.size} annonce(s) sans texte, en attente.`);

  const messages = [];
  for (const ab of abonnes) {
    for (const m of composerMessages(tri.aEnvoyer, ab.suivies, francais, ab.niveau, ab.categories)) {
      const discrete = ab.categories && m.data.categorie === 'information';
      messages.push({
        to: ab.token, ...(discrete ? {} : { sound: 'default' }), priority: discrete ? 'default' : 'high', ttl: 3600,
        channelId: ab.categories ? `trafic_${m.data.categorie}` : 'trafic', ...m,
      });
    }
  }
  for (const m of messages) journal(`→ ${m.title} | ${m.body || "(sans texte)"}`);

  if (reel && messages.length > 0) {
    const invalides = await envoyerExpo(messages);
    bilan.envoyees = messages.length - invalides.length;
    // UN seul document par passage (Cloudflare limite le nombre de requêtes par passage) ; son échec ne gêne rien.
    try {
      await db.collection('journalAlertes').add({ at: new Date(), alertes: entreesJournal(tri.aEnvoyer, abonnes, francais, dejaSignalees) });
    } catch (e) { journal(`Journal des envois non enregistré : ${e.message}`); }
    for (const t of invalides) {
      const doc = abonnes.find(a => a.token === t);
      if (doc) { await doc.ref.delete(); bilan.jetonsPerimes++; journal('Jeton périmé supprimé.'); }
    }
  }
  await enregistrerEtat();
}

module.exports = { alertesActuelles, nouvellesAlertes, composerMessages, libelleLigne, dateNavitia, executerSurveillance, etatAnnonce, trierNouvelles, travauxActuels, categorieAlerte };
