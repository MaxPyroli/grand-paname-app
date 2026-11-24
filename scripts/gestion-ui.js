// Outil de gestion Grand Paname : un seul serveur local, deux onglets (Statistiques, Notifications) et un filtre
// « version stable / dev / toutes » qui s'applique aux deux.
//
// Lancement : double-clic sur `Gestion-Grand-Paname.bat`, ou  node --env-file=../app/.env gestion-ui.js --ouvrir
// puis la page s'ouvre sur http://localhost:4747
//
// Chaque onglet est l'ancien outil, inchangé (stats-ui.js et notifications-ui.js), monté sous /stats/ et /notifications/.
// Sécurité : le serveur n'écoute que sur cet ordinateur (127.0.0.1) ; chaque onglet garde son code secret généré au démarrage.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const stats = require('./stats-ui');
const notifications = require('./notifications-ui');

const PORT = Number(process.env.PORT) || 4747;
const HTML_PATH = path.join(__dirname, 'gestion-ui.html');

const serveur = http.createServer((req, res) => {
  // Protection contre le « DNS rebinding » : on n'accepte que localhost.
  const hote = (req.headers.host || '').split(':')[0];
  if (hote !== 'localhost' && hote !== '127.0.0.1') { res.writeHead(403); return res.end('Interdit'); }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(fs.readFileSync(HTML_PATH, 'utf8'));
  }
  const montes = [['/stats/', stats], ['/notifications/', notifications]];
  for (const [prefixe, module] of montes) {
    if (url.pathname.startsWith(prefixe)) {
      req.url = '/' + url.pathname.slice(prefixe.length) + url.search;
      return module.gerer(req, res);
    }
  }
  res.writeHead(404); res.end('Introuvable');
});

serveur.listen(PORT, '127.0.0.1', () => {
  const adresse = `http://localhost:${PORT}`;
  console.log(`Gestion Grand Paname : ${adresse}  (Ctrl+C pour arrêter)`);
  if (process.argv.includes('--ouvrir')) exec(`start "" "${adresse}"`);
});
