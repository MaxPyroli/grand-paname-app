# Reprise de travail — état au 2026-11-09 (branche `3.4.0`)

Note écrite à la demande de l'utilisateur pour qu'une nouvelle conversation (autre interface, autre session) reprenne sans rien perdre. À lire AVANT `docs/journal-developpement.md` (très long : les entrées récentes sont en bas ; chercher « 2026-10-23 » et « Étape 1 »).

## 1. Où on en est

- Version publiée : **3.3.3** (étiquette GitHub `v3.3.3`, bundle de production signé archivé dans `archive\3.3.3\`). L'envoi sur le Play Console est une étape manuelle de l'utilisateur, non confirmée.
- Travail en cours : branche locale **`3.4.0`** (NON poussée sur GitHub). Dernier commit de travail : « Détail trafic : mesure des temps en développement… ». Arbre propre au moment de la note.
- `main` (GitHub) = 3.3.3 + UN seul commit ajouté le 2026-10-03 : la surveillance du trafic (`.github/workflows/surveillance-trafic.yml`, `scripts/surveillance-trafic.js`, une ligne dans `scripts/package.json`). Le reste de la 3.4.0 n'y est pas.
- Branche `4.0.0` (distante et locale) : ancienne réserve (Scanner Navigo), à trancher (archiver / supprimer) avec l'utilisateur, ne rien faire sans lui demander.
- Version de la 3.4.0 : `app.config.js`, `package.json`, `changelogs.ts` (entrée « 3.4.0 », date « En préparation ») ; **pas encore passée à 3.4.0** (le passage se fait à la sortie). Schéma du `versionCode` : (major×10000 + minor×100 + patch) × 10 + n° d'upload → 3.4.0 = 304000 (+ n). Contrôle des 4 endroits : fiche mémoire « Checklist bump de version ».

## 2. Ce que contient la 3.4.0 (déjà construit)

- Barre à 5 onglets, Scanner Navigo (bêta, réglage Paramètres > Avancé), pages latérales, animations d'icônes de la barre.
- **Info trafic** (volet Trafic), tout dans `app/` :
  - `traficApi.ts` (données et règles de classement), `TraficScreen.tsx` (liste), `TraficDetail.tsx` (détail d'une ligne), `AlertesTrafic.tsx` (choix des lignes à suivre, derrière la cloche), `traficTexte.ts` (contours autour des stations, dates, horaires), `symbolesLignes.ts` + `ligneIcons.ts` (symboles officiels des lignes, générés par `scripts/generer-icones-lignes.mjs` depuis `app/icons/lignes/`), `ListeFondue.tsx` (fondus de défilement), `PanelHeader.tsx` (composant `PanelIconAction`, `Transition`, `subtitleIcon`).
  - Liste : symboles par mode (« Train / RER » regroupé seulement ici), point d'état par ligne : rouge interrompu, orange perturbé, bleu info, **rond noir à centre jaune = travaux EN COURS**, rien pour les travaux prévus ; sous-titre « N lignes perturbées · M avec travaux » ; légende qui passe à la ligne.
  - Détail : cartes « EN COURS » puis « PLUS TARD », type en couleur + pastille de cause (Travaux / Incident / Info), période, titre, texte nettoyé avec contours arrondis (stations de la ligne, dates, horaires), point d'état à gauche du statut dans l'en-tête, en-tête à deux couches pilotées par l'animation d'ouverture.
  - Easter egg (secret, **ne pas le mettre dans le changelog**) : appui de 3 s sur le symbole du métro 14 → les lignes 15 à 18 sortent de derrière le 14.
  - Horaires d'un arrêt : correctif du câble C1 (carte et bandeau même sans aucun départ quand la ligne est à l'arrêt).
- **Alertes trafic** (côté serveur) : voir §5.

## 3. Décisions de l'utilisateur à respecter (classement)

Les règles viennent des CODES du serveur, pas du texte (sauf une exception étroite) :
1. Gravité « bloquante » posée sur la LIGNE → **interrompu**.
2. « bloquante » posée sur un ARRÊT (station fermée) → **perturbé**.
3. « perturbée » → **perturbé** (pas de « fortement perturbé », pas d'« arrêts non desservis » : tout est perturbé). Les trains supprimés restent perturbé.
4. Cause « information » (matchs, manifestations) → **info**, sauf gravité bloquante.
5. Exception étroite : un TITRE qui commence par « Trafic interrompu » (liste : « Traffic interrupted ») → interrompu.
6. Cause « TRAVAUX » en cours → état `travaux` dans la liste (point noir et jaune) ; un incident en direct prime sur les travaux ; les travaux prévus plus tard ne donnent aucun point. Dans le détail, chaque carte garde son type (ex. travaux « Trafic interrompu » en rouge avec la pastille « Travaux ») : écart assumé, à harmoniser si l'utilisateur le demande.
7. Deux catégories dans le détail seulement : « En cours » et « Plus tard » (pas de tri direct / travaux / informations). Les travaux de nuit sont « Plus tard » en journée (leurs périodes sont découpées nuit par nuit).
8. À terme : remplacer les points par des **icônes** (❌ interrompu, ⚠️ perturbé, ℹ️ info, 🚧 travaux) ; l'utilisateur fournira ou choisira les icônes. Demandera de garder la cause dominante par ligne dans `LigneTrafic`.

## 4. À VÉRIFIER SUR LE TÉLÉPHONE (rien de tout ça n'a été vu en vrai)

Animations du volet (en-tête à deux couches, ouverture d'une ligne, cartes de chargement sans ombre), point noir et jaune et légende, point à gauche du statut, contours des stations / dates / horaires (alignement), pause « parfois 1 seconde » à l'ouverture d'une ligne, symboles de lignes (rendu SVG, version foncée en mode sombre), easter egg du métro 14, écran des alertes (choix des lignes, demande de permission), Scanner Navigo avec un vrai passe, animations d'icônes de la barre, cache C1. En dernier recours pour les temps de chargement : lire dans `adb logcat -s ReactNativeJS` les lignes « [trafic] détail … réseau X ms, lecture JSON Y ms, analyse Z ms » (mesure ajoutée en développement).

## 5. Alertes trafic (surveillance côté serveur)

- Programme : `scripts/surveillance-trafic.js`, lancé par la tâche planifiée GitHub `Surveillance du trafic` (cron `*/5`, en pratique toutes les 3 à 4 heures vu les retards de GitHub ; passages réussis en simulation depuis le 2026-10-03). Dépôt public : ses journaux sont lisibles par tous, le programme n'y écrit aucun jeton.
- Secrets GitHub déjà créés : `PRIM_API_KEY`, `FIREBASE_SERVICE_ACCOUNT`. Variable `ALERTES_REELLES` NON créée → **simulation** (lit tout, n'envoie rien, n'écrit rien : le document d'état `systeme/alertesTrafic` n'est donc jamais écrit et chaque passage dit « Premier passage »). Pour passer en réel : créer la variable `ALERTES_REELLES` = `1` ; le premier passage réel enregistre l'état sans rien envoyer, les notifications partent à partir du suivant. Ne l'activer qu'avec l'accord explicite de l'utilisateur.
- Ce qui déclenche une alerte : cause `PERTURBATION` (ni travaux ni information), gravité `BLOQUANTE` ou `PERTURBEE`, en cours, nouvelle ou aggravée ; une notification par appareil (regroupée) ; canal `trafic` ; toucher → ouvre le détail de la ligne. Réglage dans `CAUSES_ALERTEES` / `GRAVITES_ALERTEES` du script. Pas d'horaires, pas de notification de fin, choix des lignes à la main.
- Côté app : le choix est gardé sur le téléphone (`@gp_alertes_lignes`) et dans le document `pushTokens/{jeton}` champ `alertesLignes`. Règles Firestore (lues) : `pushTokens` accepte création et mise à jour de n'importe quoi par n'importe qui, lecture et suppression interdites → durcissement possible (valider forme et taille).
- Outil d'envoi manuel (inchangé) : `scripts/notifications-ui.js` ; ne jamais envoyer de vraie notification sans demande explicite.

## 6. Reste à faire (ordre proposé)

1. L'utilisateur teste sur le téléphone (§4) et signale ce qui ne va pas.
2. Chantiers annoncés (« on peut attaquer ? » → oui, à lancer) : tests automatiques de la logique sans écran (`traficTexte`, classement, `surveillance-trafic`, symboles, dates) ; durcissement des règles Firestore (à ne publier qu'avec accord) ; remplacer le SDK Firebase par un appel réseau léger ; découper `App.tsx` (3 700+ lignes) morceau par morceau avec essai sur téléphone ; vérifier les mises à jour de correctifs Expo.
3. Plan 3.4.0 (`docs/plan-3.4.0.md`) : étape 1 presque finie (reste : recherche de bus, harmonisation point de liste / type du détail pour les travaux) ; étape 2 : fiche horaires d'une ligne à un arrêt (retards, suppressions, fréquence) ; étape 3 : itinéraire de la ligne sur la carte (≤ 3 flous natifs, mesure de fluidité) ; étape 4 : état de toutes les lignes lourdes dans les horaires d'un arrêt (même défaut que le C1 : une ligne sans départ n'a pas de carte), finitions, « Quoi de neuf ? » 3.4.0, guide graphique à compléter (volet Trafic : points, légende, détail, en-tête à deux couches) ; étape 5 : paquet de production (bump de version aux 4 endroits, build signé local, archivage `archive\3.4.0\`, étiquette, publication, mise au point des jetons).
4. Autres : décider du sort de la branche `4.0.0` ; pousser `3.4.0` seulement quand l'utilisateur le veut ; question « version » de Tally à rendre facultative.
5. Questions que l'utilisateur n'a pas tranchées : cache des détails 3 minutes (2 ou 5 ?) ; légende sur une seule ligne avec mots courts ?

## 7. Règles de travail et pièges

- Réponses courtes à l'utilisateur ; détails dans le journal. Ne pas citer « tsc » (dire seulement testé / pas testé sur téléphone). Jamais présenter une lecture de code comme un test sur appareil, ni un travail local comme publié.
- `app/changelogs.ts` : l'utilisateur le modifie lui-même, sa formulation fait foi ; ajouter des puces dans le même style au fil de l'eau, sans attendre qu'il le demande. Entrée 3.4.0 déjà présente (Scanner, Info trafic avec symboles, Alertes trafic, animations).
- Secrets : jamais dans les fichiers, le journal ou la mémoire (mot de passe du keystore collé dans une conversation : ne jamais le recopier). Pousser sur GitHub, déplacer une étiquette, publier, créer une variable ou un secret : uniquement avec accord explicite.
- Silence = accord sur un point d'interface (le noter sans dire « testé »).
- **Captures d'écran du téléphone** : toujours vérifier d'abord que l'app Grand Paname est au premier plan et l'écran allumé (`adb shell dumpsys window | grep mCurrentFocus`, `dumpsys power | grep mWakefulness`) ; une capture a déjà montré une conversation privée : ne pas s'en servir, la supprimer. Ne pas réveiller ni déverrouiller le téléphone sans demander.
- Commandes envoyées au shell : une barre oblique inverse doublée dans un script Python lancé par `bash` a produit un caractère « retour arrière » dans une expression régulière ; pour du code complexe, écrire le script dans un fichier (outil d'écriture) puis l'exécuter, et contrôler après coup.
- Fichiers générés : `app/modeIcons.ts` (icônes de modes, ajout `TRAIN_RER` fait à la main), `app/ligneIcons.ts` (régénérer avec `node scripts/generer-icones-lignes.mjs`).
- Flous : jamais plus de 3 flous natifs visibles sur la carte (plantage du WebView), voir fiche mémoire « Plafond de flou ».
- Ordinateur : Samsung Galaxy Book4 Edge (Windows ARM). Téléphone : Galaxy S25 Ultra (SM-S938B), application de développement `fun.grandpaname.app.dev`.

## 8. Commandes utiles

- Serveur de développement : `cd app` puis `npx expo start --dev-client` (port 8081 ; l'utilisateur en lance souvent un lui-même : vérifier avant d'en lancer un second).
- Relancer l'app sur le téléphone branché en USB : `scripts\Relancer-app-dev.bat` (active `adb reverse` puis ouvre le lien profond `exp+grand-paname://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081`). Si `adb devices` est vide : débloquer le téléphone, mode « Transfert de fichiers », Débogage USB activé (le désactiver puis le réactiver si besoin).
- Contrôle de types avant chaque commit : depuis `app`, `npx tsc --noEmit` (silencieux = ok).
- Essais de logique sans téléphone : scripts jetables Node (`node --env-file=app/.env --experimental-strip-types …`) qui copient la logique de `traficApi.ts` ; la clé API est dans `app/.env` (`EXPO_PUBLIC_NAVITIA_KEY`), ne pas l'afficher.
- Build de production signé et archivage : fiches mémoire « Build Android local sur Windows » et « Dossier d'archive des builds ».

## 9. Faits sur les données (détail dans le journal)

- Flux en masse des perturbations (PRIM `disruptions_bulk`, ~1,6 Mo décompressés, textes en ANGLAIS, aucune panne d'ascenseur) : sert à la liste et aux alertes. Détail d'une ligne : Navitia `lines/{id}/line_reports` (FRANÇAIS, 1,3-1,6 Mo, ~90 % de pannes d'ascenseur ignorées) : seule requête fiable testée ; alternatives plus légères rejetées (incomplètes ou plus lentes).
- Le serveur répond 429 si on envoie trop de requêtes d'un coup (réessais intégrés, préchargement limité à 3 lignes).
- Gravité fiable seulement pour « bloquante sur la ligne » (32 cas sur 32 confirmés) ; beaucoup de coupures de tronçon (travaux de nuit des RER, ligne J) sont codées « perturbée » : assumé.
- Le câble C1 est en mode Navitia `SuspendedCableCar` (pas `Funicular`) ; le funiculaire de Montmartre (« FUN ») n'a pas de symbole fourni (pastille de couleur en repli).

## 10. Mise à jour du 2026-11-24 (à lire avant le reste de ce fichier, qui date du 9)

- Cloudflare Worker en RÉEL (toutes les 2 minutes), surveillance GitHub arrêtée. Une notification par perturbation et par ligne suivie, avec détail ; l'app garde les alertes reçues et affiche « TERMINÉE » si la perturbation est finie au toucher.
- Outil de gestion unique : raccourci « Gestion Grand Paname » (stats + notifications, filtre stable / dev / toutes). L'étiquette stable / dev n'existe que dans les builds où l'app l'écrit (AAB 304001 inclus).
- AAB 3.4.0 : `archive\Grand-Paname-3.4.0.aab`, versionCode 304001 (changer le code à chaque nouvel AAB, voir mémoire). Dossier `Publication\` : icônes, notes de version, confidentialité.
- **Prévu pour le PROCHAIN build (version NON fixée, décision de l'utilisateur le 24/11 : on ne choisit pas encore le numéro)** : icône de notification en silhouette blanche (`app/assets/notification-icon.png`, déjà branchée dans `app.config.js`, absente de l'AAB 304001 : changement natif, visible seulement après un nouveau build).
