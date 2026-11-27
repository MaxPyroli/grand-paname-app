# Guide graphique — Grand Paname

Référence de cohérence visuelle. À lire avant d'ajouter ou de modifier un élément d'interface, et à compléter à chaque décision de design. Les valeurs viennent du code (`app/theme.ts`, `app/App.tsx`) ; en cas d'écart, le code fait foi et ce guide doit être corrigé.

**Verre dépoli : voir la section 5 bis (variables de référence, validées par l'utilisateur le 2026-09-30).**

Statut : rédigé le 2026-09-30 à partir du code et des décisions prises avec l'utilisateur pendant la 3.3.3. Les points marqués « à valider » n'ont pas été vus sur téléphone.

## 1. Principes

- L'app doit paraître native Android : pas de cartes flottantes décoratives sans raison, gestes attendus (glisser pour fermer), animations qui suivent le doigt.
- La carte reste l'élément central. Les surfaces qui la recouvrent (barre de recherche, en-tête, barre de nav, volet des horaires, tiroirs) sont soit flottantes et arrondies, soit collées à un bord.
- Une seule source de couleurs : `useColors()` (`app/theme.ts`). Jamais de couleur en dur pour un fond ou un texte d'interface, sauf cas listés ici.
- Fonctionner en trois thèmes : clair, sombre, sombre OLED. Toute nouvelle couleur doit être vérifiée dans les trois.
- Le texte de l'app est en français, ton simple et direct.

## 2. Couleurs (`app/theme.ts`)

| Rôle | Clair | Sombre | OLED |
|---|---|---|---|
| Fond (`bg`) | #ffffff | #010e26 | #000000 |
| Fond flottant (`bgFloat`) | blanc 92 % | #010e26 97 % | noir 97 % |
| Fond discret (`bgSubtle`) | #f1f2f6 | #07213f | #050505 |
| Fond carte (`bgCard`) | #ffffff | #031a3a | #000000 |
| Texte (`text`) | #25303b | #ddeeff | idem sombre |
| Texte secondaire (`textSub`) | #7f8c8d | #6e99cc | idem sombre |
| Accent (`accent`) | #3498db | #5ab3f5 | idem sombre |
| Pastille active (`pillCenter`) | #DDEEFF | #0a2d64 | #0a0a0a |

- L'accent sert aux actions (« Modifier », flèches, contours d'état actif). Le rouge est réservé aux problèmes de trafic ; l'or `#F2B705` à l'étoile de favori.
- Les couleurs de lignes (métro, RER, etc.) viennent des données, jamais du thème.

## 3. Typographie

- Police : famille GrandParis (Light, Regular, Medium, Bold), chargée dans `App.tsx`.
- Titres de volet et de page (Favoris, Info trafic, Paramètres) : GrandParis-Bold 24 sur une ligne de 32 (`PANEL_TITLE_SIZE`). Sous-titres : Light 13. Titres de sections des Paramètres : Bold 12 en capitales, espacement 0,8. Libellés de barre de nav : Medium 10. Actions textuelles : Medium 14.
- Texte principal `c.text`, secondaire `c.textSub`. Jamais de gris fixe.

## 4. Formes et espacements

**Échelle des coins arrondis** (choisir dans cette liste, ne pas en inventer) :
| Usage | Rayon |
|---|---|
| Pastille / bouton d'action (hauteur 32) | 16 (demi-hauteur, « pilule ») |
| Curseur interne d'un sélecteur (thème) | 13 |
| Puce d'icône d'une carte (42 × 42) | 15 |
| Sélecteur de thème (piste) | 16 |
| Pastille statut GPS | 16 |
| **Cartes des volets et des Paramètres** (`PANEL_CARD_RADIUS`) | **20** |
| En-tête, pastille « mise à jour » | 20 |
| Bulle des paramètres | 22 (ronde, 44 × 44) |
| Tiroirs (côté carte seulement) | 28 |
| Barre de recherche, barre de navigation | 30 |
| Modales (fenêtres) | 18 |
Règle : plus l'élément est grand et flottant, plus le rayon est grand ; un élément de la même famille garde le même rayon.

**Espacements**
- Marge de flottement au bord de l'écran : 12 px (en-tête, bulle réglages ; tiroirs : 12 px sous le titre et 12 px au-dessus de la barre de nav).
- Marges horizontales : 16 px pour les cartes des Paramètres, 18 px dans les volets.
- Sous l'en-tête d'un volet : 6 px, puis la liste commence à 14 px.
- Hauteurs fixes : barre de nav 58 (à 16 du bas), barre de recherche 52, carte de favori 72 (écart 10), ligne de titre 32.
- Toujours passer par les constantes (`NAV_BAR_HEIGHT`, `NAV_BAR_BOTTOM`, `SEARCH_BAR_HEIGHT`, `PANEL_TITLE_LINE`, `PANEL_CARD_RADIUS`…) plutôt que de recopier des chiffres.

**Ombres**
- Cartes de liste et cartes des Paramètres : ombre native douce (`#1a2a4a`, décalage 2, opacité 0,07, rayon 6, élévation 2) — seulement sur fond OPAQUE.
- Surfaces translucides (verre) : jamais d'ombre native (elle traverse le fond) ; ombre CSS dessinée par la carte, voir section 5 bis.

## 5. Surfaces

- **Flottantes** (en-tête, réglages, recherche, barre de nav, pastilles d'état) : verre dépoli (`CoucheVerre` + `teinteVerre(isDark, c, true)`, teinte dense pour la lisibilité), arrondies, `overflow: hidden`, ombre légère. Tout nouvel élément posé sur la carte doit suivre cette règle. Le flou cible la carte seule (`BlurCarteContext`). Exception : la liste de résultats de recherche, opaque pour rester lisible.
- **Volet des horaires** : bottom sheet à deux positions plus l'état « icônes affichées, horaires fermés » ; se ferme en glissant vers le bas, la croix le ferme complètement.
- **Tiroirs Favoris / Trafic (téléphone)** : collés au bord de l'écran, largeur 82 %, arrondis côté carte seulement (28), 12 px sous le titre et 12 px au-dessus de la barre de nav. Effet verre dépoli léger : flou d'intensité 30 (clair et sombre) + voile (clair : blanc 30 % ; sombre : couleur `bgCard` du thème à 20 %, pour rester dans le bleu nuit de l'app), fine bordure côté carte (clair : blanc 35 % ; sombre : `borderCard`, jamais de bordure blanche en sombre, elle fait un halo). Animation en ressort amorti, fermeture au geste (le retour en place est ignoré si l'onglet a changé entre-temps). La barre de nav reste devant. Fermeture : tap sur la carte, glissement vers le bord, ou bouton retour. En écran large, le tiroir reste opaque et permanent (`responsive.ts`).
- **Voile sous un tiroir** : noir à 20 %, sur la carte uniquement. L'en-tête, la bulle réglages et la barre de nav ne sont jamais assombris.
- **Modales** : calque superposé (pas de `Modal` natif, sinon le flou ne marche pas), carte en verre dépoli (intensité 45) avec bordure claire.
- **Jamais d'ombre portée (`elevation`, `shadow*`) sur une surface translucide** : l'ombre se voit à travers et donne des bandes grises. Utiliser une fine bordure (`bordureVerre()`).
- Sur une surface en verre, **pas de fondu de couleur unie** (halo). Utiliser la teinte translucide `teinteVerre` (clair : blanc 60 % ; sombre : `bgCard` 30 %) ou couper net. Les fondus de bord de liste du tiroir Favoris utilisent cette teinte.

- **Barre de navigation** : trois entrées strictement identiques (pastille 64 × 32, icône 22, libellé 11 Medium). L'entrée active a une pastille `pillCenter` unique qui glisse en ressort d'une entrée à l'autre, une icône couleur et un libellé en gras. Ne jamais différencier une entrée des autres par sa taille ou sa couleur de pastille.

## 5 ter. Gabarit des volets (Favoris, Trafic et suivants)

Tout volet latéral se construit avec `PanelLayout` (`app/PanelLayout.tsx`) : en-tête (`PanelHeader`), actions, contenu, pied. Ne jamais recopier des styles.
- **En-tête** : icône 26 px + titre 24 px (`PANEL_TITLE_SIZE`) sur une ligne de 32 px (`PANEL_TITLE_LINE`), sous-titre 13 px Light, marge basse 6 px. Action à droite : `PanelPillAction` (pastille 32 px, alignée sur le titre ; état actif = fond accent). Action à icône seule : `PanelIconAction` (pastille ronde 32 px, icône de 18 px couleur accent, fond `pillCenter` ; sans `onPress` elle ne réagit pas au toucher) — première utilisation : la cloche des alertes du volet Trafic.
- **Cartes** : `panelCardStyle` (rayon 20, bordure `borderCard`, ombre douce) + `panelChipStyle` (puce 42 px, icône accent sur `iconGareBg`). Hauteur fixe 72 px pour les listes réorganisables.
- **État vide** : `PanelEmptyState` (icône 44 px, titre 17 px, description 14 px).
- **Liste** : début à 16 px sous l'en-tête (`FONDU_HAUT`) ; fondu des bords par masque de dégradé (`MaskedView`) aux longueurs standard ci-dessous.
- **Fondus de défilement (toute l'app)** : 16 px en haut (`FONDU_HAUT`), 40 px en bas (`FONDU_BAS`), constantes de `app/Fade.tsx` ; ne jamais passer une hauteur propre à un écran. Le fondu se pose APRÈS la liste dans le code (avant, la liste le recouvre). La liste commence à `FONDU_HAUT` du haut pour que le premier élément reste net au repos.
- Le volet des horaires (bottom sheet) descend sous la barre de nav : la barre y a un flou natif dont la cible est le volet seul.

## 5 quater. Pages plein écran (Paramètres)
n- Paramètres (décisions du 27/11, voir docs/maquettes/parametres.html ; codé dans `app/reglages/`) : puces d’icône par famille — bleu : notifications et affichage ; or : découverte (tutoriel, historique) ; vert : aide (bug, contact) ; orange : avancé ; le rouge reste réservé au trafic. Icônes nouvelles dans le style existant (trait épais et point « station »). Textes sans tutoiement pour les avertissements. Pas de titres de section. Les réglages se construisent avec les composants de `app/reglages/composants.tsx` (PageReglages, Carte, LigneReglage, Interrupteur, Tuiles, Selecteur, ListeChoix, Avertissement) : ajouter un réglage = ajouter un élément, sans styles propres à l’écran. Sous-pages : glissement depuis la droite, bouton « Retour » et bouton retour du téléphone.

- Fond opaque (`bg`) ; glisse depuis le bas avec le ressort commun (raideur 120, amortissement 15, masse 0,5), se ferme en 260 ms.
- En-tête = `PanelHeader` : icône 26 px accent, titre 24 px, action `PanelPillAction` « Fermer » à droite ; pas de ligne de séparation dessous.
- Contenu en cartes (`Carte`, au gabarit des volets), sans titres de section. Les styles `settingsCard` ne servent plus qu’aux outils de débogage.
- Interrupteurs : 44 × 26, pastille blanche 20 ; actif = fond accent, inactif = `dragBar` (composant `Interrupteur`).

## 5 bis. Verre dépoli — variables de référence

État validé par l'utilisateur (« c'est le meilleur compromis »), à appliquer à tout nouvel élément posé sur la carte pour rester harmonisé. Le code fait foi : `VERRE_FLOU_ZONES`, `OPACITE_VERRE`, `CoucheVerre`, `teinteVerre` dans `app/App.tsx`, `setGlassRects` dans `app/MapWebView.tsx`, `app/verreWeb.ts`.

**Deux techniques de flou**
- **Dans la carte** (`'web'`) : rectangle `backdrop-filter: blur(8px)` dessiné par la carte (WebView), aux coordonnées de l'élément natif. Coût très faible, aucune limite de nombre. À utiliser pour tout élément FIXE (en-tête, bulle réglages, barre de nav, pastilles d'état).
- **Natif** (`'natif'`, `BlurView` dimezis) : à réserver aux éléments qui bougent au doigt (tiroirs). Intensité 22. Coûteux : il fait redessiner la carte à chaque image (53 % d'images saccadées avec 3 flous natifs permanents contre 7 % sans) et plus de 3 à la fois font planter la WebView. Règles : jamais monté en permanence, monté seulement pendant que l'élément est visible ; coupé pendant l'affichage des fenêtres « Nouveautés », « Bienvenue » et « Mise à jour » (elles ont leur propre flou qui cible toute l'app).
- Le flou fait dans la carte a 1 à 2 images de retard sur un élément natif en mouvement : ne JAMAIS déplacer un flou de la carte. Pour un élément mobile, animer seulement l'opacité (fondu, décalage invisible) : c'est le cas de la barre de recherche (fondu 110 ms, changement de place, fondu 180 ms) et de la pastille « mise à jour » (fondu 300 ms à l'apparition, 200 ms à la disparition).

**Opacité de la teinte** (`OPACITE_VERRE`, [clair, sombre], teinte blanche en clair, `bgCard` en sombre)
| Élément | Clair | Sombre |
|---|---|---|
| En-tête | 45 % | 50 % |
| Bulle des paramètres | 45 % | 50 % |
| Barre de navigation | 45 % | 50 % |
| Pastilles d'état | 45 % | 50 % |
| Barre de recherche | 60 % | 62 % |
| Tiroirs | 68 % | 72 % |
Sans flou (interrupteur de debug coupé, ou flou suspendu) : +20 points, plafonné à 95 %. Piège : un flou natif est dessiné PAR-DESSUS le fond de son conteneur, la teinte doit donc être une couche au-dessus du flou (déjà fait dans `CoucheVerre`).

**Reflet** : dégradé blanc (clair 30 % → 0, sombre 8 % → 0, de haut en bas) sur toutes les surfaces en verre.

**Bordure** : 1 px, blanc 60 % en clair, `borderCard` en sombre (`bordureVerre()`). Pas d'ombre native (`elevation`, `shadow*` à 0).

**Ombres** (`box-shadow` dessinée par la carte, uniquement à l'extérieur du contour) : barre de nav `0 7px 16px rgba(0,0,0,0.26)` (portée vers le bas ; `boxShadow` NATIF sur la barre elle-même, donc présente quel que soit l'arrière-plan, carte comme volet des horaires ; ne traverse pas le fond translucide) ; en-tête et bulle `0 -2px 8px rgba(0,0,0,0.12)` (portée vers le haut) ; barre de recherche `0 2px 8px rgba(0,0,0,0.09)` ; tiroirs et pastilles : pas d'ombre (l'ombre d'un élément mobile traîne).

**Rayons** : en-tête 20, bulle 22, barre de nav 30, barre de recherche 30, pastille « mise à jour » 20, pastille statut GPS 16, tiroirs 28 côté carte.

**Interrupteur de debug « Flou (verre dépoli) »** (réglages) : coupe tout le flou pour comparer la fluidité ; compteur de fps dans l'encadré « Infos de debug ». Mesure : `scripts/bench-fluidite.sh`.

## 6. Icônes

- Les onglets ont une version contour (inactif) et une version couleur (actif), même palette que le logo.
- Icônes de modes de transport : images `MODE_ICONS`, teintées (`#25303b` en clair, `#ddeeff` en sombre) dans les listes, 18 px ; alignées verticalement avec l'étoile de favori.
- Sur la carte, les icônes d'arrêts sont dessinées sur un canvas (pas de marqueurs DOM), pour la fluidité.

## 7. Animations et gestes

- **Barre de navigation** : à l'activation d'un onglet, son icône joue une courte animation propre (étoile qui tourne, maison qui rebondit, triangle qui se secoue, scanner d'où partent des ondes, point qui gonfle ; 400-650 ms, native, jamais au lancement).
- **Façon de faire** : ressort commun (raideur 120, amortissement 15, masse 0,5) pour tout ce qui arrive/part (volet des horaires, barre de recherche au clavier, page des Paramètres). Courbe `cubic-bezier(0.22, 1, 0.36, 1)` 450 ms pour les tiroirs. Fondu pour ce qui porte un flou de la carte.

- Pages plein écran des onglets extrêmes (Bientôt à gauche, Scanner à droite) : glissent depuis leur côté, comme les tiroirs, avec le ressort commun (raideur 120, amortissement 15, masse 0,5, à l'ouverture et à la fermeture : en passant de l'une à l'autre elles se suivent comme un carrousel), et recouvrent les tiroirs.
- Éléments qui portent un verre dans la carte (tiroirs, barre de recherche) : animation `timing` avec `Easing.bezier(0.22, 1, 0.36, 1)` (450 ms tiroirs) ; barre de recherche : ressort du volet des horaires (raideur 120, amortissement 15, masse 0,5), identique à la transition CSS de la carte, pour rester synchrones. Ailleurs : préférer les ressorts amortis (sans dépassement quand un vide pourrait apparaître) aux timings : tiroirs (raideur 220, amortissement 26), pastille de la barre de nav (300 / 22). Durées en timing : 180 à 220 ms pour les petits éléments (barre de recherche) ; l'animation de nettoyage du cache dure 1,4 s (exception ludique).
- Toujours `useNativeDriver: true` quand c'est possible.
- La barre de recherche se range vers le bas quand le volet des horaires **ou** un tiroir est ouvert ; le clavier la remonte.
- Retour haptique léger pour les actions marquantes (nettoyage du cache).
- Les éléments qui se ferment doivent pouvoir l'être au geste (glisser) en plus du bouton.

## 8. États du trafic

- Normal : rien à afficher (pas de bandeau).
- Perturbé : ⚠️, contour d'alerte sur la ligne, bandeau à texte défilant.
- Arrêt : ❌, même principe, teinte plus forte. Pas de halo pulsé (refusé).
- Câble C1 : ligne d'horaires dans le même style que les autres ; message « départ toutes les 30 s » dans le style standard.

## 9. Ce qui a été essayé et refusé

- Fondu par carte (opacité selon la position) sur le verre : « trop bizarre », retiré.
- Superposer aux tiroirs un voile ou une bordure blanche en thème sombre (gris / halo) : remplacé par la teinte du thème.
- Halo lumineux rouge pulsé sur une ligne à l'arrêt : lu comme une ligne doublée, retiré.
- Fondus de couleur unie sur un tiroir en verre : halo blanc, retirés.

## 10. À décider / à valider

- Teintes du verre en thème sombre et OLED (réglées à l'œil, non validées).
- Le retour prédictif (aperçu animé au geste retour) n'est pas implémenté.
- Faut-il appliquer le verre dépoli aux autres panneaux (volet des horaires, réglages) pour rester cohérent ?
- Un vrai fondu de bord de liste demanderait `@react-native-masked-view/masked-view` (module natif, rebuild).

## 11. Tenir ce guide à jour

Toute décision de design prise en conversation (taille, espacement, animation, couleur) est ajoutée ici, et le détail de la tâche va dans `docs/journal-developpement.md`.

## Paysage (décision du 2026-11-18)
- **Mêmes menus, même comportement en portrait et en paysage** : tiroirs Favoris / Trafic en verre qui glissent par-dessus la carte (gestes, voile, barre de nav identiques). Seule la disposition change : largeur d'un tiroir = 82 % de l'écran, plafonnée à 400 dp (`LARGEUR_MAX_TIROIR` dans `App.tsx`).
- L'ancienne « mise en page large » (tiroir permanent à côté de la carte, seuil de 650 dp, `responsive.ts`) est abandonnée : elle affichait des volets noirs vides en paysage et changeait tout le fonctionnement à la rotation.
- **Volet des horaires** : feuille du bas. Portrait : pleine largeur. Paysage : à DROITE, exactement à la position et à la largeur de la barre de recherche (qui se range quand il s'ouvre) ; la barre de navigation reste libre à gauche, la carte visible à gauche.
- **Barres du bas en paysage** : navigation (44 % de la largeur, 400 dp max) et recherche CÔTE À CÔTE sur la même ligne (`useGeometrieBarres` dans `responsive.ts`) ; en portrait, recherche au-dessus de la navigation (88 % de large).
- **Tiroirs en paysage** : 340 dp max, collés à leur bord, montent jusqu'en haut de l'écran ; celui de droite (Trafic) descend aussi jusqu'en bas (rien dessous), celui de gauche (Favoris) s'arrête au-dessus de la barre de navigation. L'en-tête (à gauche) ou la bulle des réglages (à droite) s'efface quand le tiroir de son côté est ouvert.
- Reste à harmoniser : Paramètres et fenêtres modales en paysage ; transition de la rotation.
- Rotation et verre dépoli (27/11) : le flou doit être là dès la première image de la nouvelle orientation. La carte le replace elle-même d’après les positions mémorisées ; pas de masquage ni de fondu, sauf pour une surface jamais vue dans cette orientation, qui apparaît en fondu doux (260 ms, ralenti en fin).
- Recherche de bus (27/11) : la barre part de l’endroit touché et monte avec le clavier ; jamais de saut. Titre et résultats en fondu.
- Flou d’une carte qui remonte dans la pile (27/11) : il arrive en fondu PENDANT que la carte remonte (20 ms puis 260 ms), jamais d’un coup.
- Balayage d’une notification interne (27/11) : au lâcher, la carte continue immédiatement à la vitesse du doigt (comme les volets) ; aucun arrêt, aucun redémarrage de l’animation.
- Alerte trafic app ouverte (27/11, remplace la copie rangée dans le volet) : uniquement la notification interne, rien côté téléphone.
- Catégories Android des alertes (27/11) : « Info Trafic : Information » (sans son), « Info Trafic : Perturbation », « Info Trafic : Interruption » (son et vibration). Une catégorie par niveau d’alerte des paramètres. Dans l’app, une alerte « Information » ne fait pas vibrer.
- Vibration des notifications internes (27/11) : une seule, à l’arrivée de l’alerte (même mise en attente) ; jamais quand une carte déjà reçue remonte dans la pile.
- Verre des notifications et fenêtres (27/11) : il floute toujours ce qui est réellement derrière. Toute nouvelle page plein écran posée au-dessus de l’app doit devenir la cible du flou tant qu’elle est affichée (comme les paramètres).

## Volet Info trafic (3.4.0)
- **Liste** : champ « Rechercher un bus » en haut (numéro, ex. 104 ou N32 ; résultats = pastille aux couleurs de la ligne + libellé + point d'état + état en toutes lettres), puis légende, puis une section par mode (Train / RER regroupés, Métro, Tram, Câble) avec les symboles officiels (version foncée en thème sombre). Pas de symbole officiel pour les bus : pastille aux couleurs de la ligne.
- **Points d'état** (sur le coin du symbole, liseré de la couleur du fond) : rouge = interrompu ; orange = perturbé ; bleu = information ; rond NOIR à centre JAUNE = travaux en cours ; rien = normal ou travaux prévus plus tard. Sous-titre « N lignes perturbées · M avec travaux ». La légende passe à la ligne si l'écran est étroit.
- **En-tête à deux couches** : « Info trafic » (liste) et l'en-tête de la vue (symbole + nom de la ligne, statut avec son point à gauche, bouton Retour) pilotés par la MÊME animation d'ouverture : la liste s'efface sur le premier tiers, la vue apparaît ensuite. Aucune bascule de texte à un instant précis.
- **Détail d'une ligne** : deux onglets « En cours · N » / « Plus tard · N » quand les deux existent (sinon un seul titre de section) ; les deux listes restent montées, le changement d'onglet glisse de 28 px avec un fondu (pas de reconstruction). Une carte = type en couleur (rouge interrompu, orange perturbé, bleu information) + pastille de cause (Incident / Info), période, titre, texte nettoyé avec contours arrondis autour des stations de la ligne, des dates et des horaires. **Travaux** : même signe que dans la liste (rond noir à centre jaune) et libellé « TRAVAUX » ; la gravité passe dans la pastille de droite, dans sa couleur.
- **Chargement** : squelette de trois cartes grises qui pulsent (sans ombre : l'élévation Android sous une couche qui s'efface donne un halo sale) ; le contenu apparaît en fondu. Lignes déjà vues : affichées tout de suite pendant 3 minutes.
- **Easter egg** (secret, jamais dans le changelog) : appui de 3 s sur le métro 14 → les lignes 15 à 18 sortent de derrière lui.


## Pop-up d'alerte trafic (décision du 2026-11-24)
- Quand une alerte sur l'une de MES lignes arrive pendant que l'app est ouverte, une petite carte glisse en haut de l'écran (`AlerteFlash.tsx`) : point de la couleur du type (rouge interrompu, orange perturbé), titre de la notification (« Métro 9 : trafic perturbé ») en Bold 14, texte de l'annonce en Regular 12 (2 lignes max), flèche ›. Carte OPAQUE (`bgCard`, bordure `borderCard`, rayon `PANEL_CARD_RADIUS`) : l'ombre native est donc permise.
- Elle remplace la bannière du système (app ouverte seulement ; la notification reste dans le volet et le son est joué). Toucher = ouvrir la ligne dans Info trafic (avec la carte « Terminée » si elle l'est) ; glisser vers le haut = fermer ; fermeture automatique après 7 s ; une nouvelle alerte prend la place de la précédente. Entrée au ressort commun (raideur 120, amortissement 15, masse 0,5).
- À valider sur téléphone : position sous la caméra, lisibilité en trois thèmes, comportement en paysage (largeur max 460).

## Lignes du Grand Paris Express (décision du 2026-11-26)
- Elles utilisent le MÊME menu de détail que les autres lignes (jamais d'écran à part : essayé, refusé, « tout dépasse ») : une carte « Information » avec les ouvertures prévues ; point bleu d'information sur leur symbole (`gpe.ts`).
- Rubrique Bus (2026-11-26) : les bus suivis en grille (mêmes cases que les autres modes, élargies si le numéro est long) entre le titre et le champ de recherche ; rien si aucun bus suivi.
- Mention de mise à jour d une perturbation (2026-11-26) : discrète, 10 px Light, alignée à droite, opacité 0,7, « Mis à jour à 13:52 » (avec la date seulement si ce n est pas aujourd hui). À valider sur téléphone.

## Notifications internes : le moteur (décision du 2026-11-27)
- Tout message de l'app passe par `notifier()` (`notifs.ts`), affiché par `NotifCentre.tsx`. Plus de petit message Android (`ToastAndroid`) ni de pop-up à part pour ce qui s'adresse à l'utilisateur (restent en toast : outils de débogage). Exclus : bandeau du câble, « Quoi de neuf », fenêtre de mise à jour (pour l'instant).
- Trois formes : **carte** en haut (7 s, toucher = agir, flèche › si une action existe), **pilule** en haut, sous la carte s'il y en a une (2,5 s, icône colorée + une phrase ; en bas jusqu'au 2026-11-27, déplacées à la demande de l'utilisateur), **choix** en haut avec boutons pilules de 32 (reste jusqu'à la réponse).
- Les cartes en attente sont **empilées** (3 visibles au plus : décalées de 12 vers le bas, 5 % plus petites par rang, contenu masqué) ; seule celle de devant s'écoule et se balaie ; quand elle part, la suivante remonte et se dévoile ; une plus urgente pousse les autres au fond. Les pilules se suivent une à une ; une interruption passe devant ; même clé = remplace ; file de 5 au plus. Balayer vers le bord ferme ; le doigt posé arrête le minuteur.
- Style : carte de l'app (rayon des cartes, bordure 1 px), fond qui suit le thème (clair `bgCard`, sombre #0b2550, OLED #0d0d0d). Types : info (accent), succès vert, attention orange, erreur rouge, perturbé orange, interrompu rouge. Alerte trafic : symbole officiel + point d'état, bordure colorée à 55 % et UN léger halo (flou 18, étendue 1, 0,38 sombre / 0,28 clair) ; les autres ont une ombre neutre. Vibration pour les alertes seulement.
- Écartés pour l'alerte (« sort trop de la DA ») : voile dégradé, surtitre « ALERTE TRAFIC », grosse pastille pleine, bordure 2 px, battements, fort halo.
- Animation : Reanimated et gesture-handler (côté natif), ressort amortissement 18 / raideur 190 / masse 0,7 à l'entrée (lancée une image après le premier dessin), sortie 200 ms ; `renderToHardwareTextureAndroid` avec 24 px de marge pour que le halo ne soit pas rogné ni recalculé à chaque image.
- Les notifications internes passent au-dessus de tout (zIndex 30000, élévation 30), y compris paramètres et fenêtres.

## Surface commune des éléments par-dessus l'app (2026-11-27)
- Notifications ET fenêtres (« Quoi de neuf », mise à jour, visite guidée) : `app/surface.ts`. Surface opaque suivant le thème (clair `bgCard`, sombre #0b2550, OLED #0d0d0d), rayon `PANEL_CARD_RADIUS`, bordure 1 px `borderCard`. Les fenêtres n'ont plus de verre flouté (rayon 18 et bordure blanche abandonnés) : voile noir 45 % derrière, ombre ample (flou 28), boutons de 48 en pilule (rayon 24), texte sur accent noir en sombre et blanc en clair ; bouton secondaire sans bordure. Icône de titre = puce teintée 40, rayon 15.

## Verre des notifications et des fenêtres (décision du 2026-11-27, remplace la surface opaque du même jour)
- Notifications, pilules (dont le téléchargement de mise à jour, désormais une pilule du moteur avec rond tournant) et fenêtres (Quoi de neuf, mise à jour, visite guidée) : le VERRE DE L'EN-TÊTE (`surface.tsx`) : flou natif intensité 30, teinte 45 % (clair) / 50 % (sombre, OLED : noir), reflet en dégradé, bordure `bordureVerre` (alertes : bordure et halo colorés conservés).
- Flou NATIF obligatoire ici (le flou « dans la carte » ne voit pas les paramètres ni les volets) : UN SEUL à la fois pour les notifications (carte de devant, sinon la pilule) ; les cartes en attente et le flou coupé = teinte à 96 %. Voile des fenêtres 25 %. `renderToHardwareTextureAndroid` retiré (incompatible avec le flou) : fluidité à revérifier.

- Pilules (2026-11-27) : SOUS le titre de l'app, 8 sous l'en-tête, comme l'ancienne pastille de mise à jour ; quand une carte est affichée, sous la carte. Les cartes restent tout en haut.

## Tutoriel guidé (2026-11-27, remplace la visite à cartes)
- Étapes : bienvenue, chercher un arrêt (bouton « Me montrer avec Châtelet »), horaires, étoile, onglet Favoris, onglet Trafic, cloche des alertes, fin. On éclaire le VRAI élément : voile noir 62 % fait d'UNE vue à bordure plus large que l'écran autour d'un trou arrondi (le tracé SVG essayé était saccadé), qui glisse d'un élément à l'autre en 420 ms (courbe des tiroirs) ; la zone éclairée reste à 4 au moins des bords de l'écran (le reste n'est pas touchable), contour accent 2 px SANS lueur ni ombre (essayé : halos sales et coins clairs), bulle en verre (`surface.tsx`) au-dessus ou au-dessous, points d'avancement, « Passer » discret. Les étapes avancent quand le geste est fait ; « Suivant » seulement quand il n'y a rien à toucher.
- Pendant la saisie d'un arrêt : plus de voile, bulle réduite en haut. Élément introuvable : rien n'est bloqué et « Suivant » apparaît.
- La bulle se place du côté de l'élément où elle tient, sinon par-dessus en bas de l'écran (`placerBulle`, testé). Elle s'efface (140 ms) et ne réapparaît (240 ms) qu'à sa nouvelle place, une fois l'élément immobile. Positions mesurées par rapport au calque du tutoriel (annule le décalage qui avait fait abandonner le halo en 3.2). Calque à zIndex 25000, sous les notifications.
- L'autorisation des notifications est demandée à l'étape des alertes passée (ou à la fin / au « Passer »), plus au tout premier lancement. Réservé d'office aux nouveaux ; « Revoir le tutoriel » dans les liens des paramètres, masqué en mode dev (le Débogage a déjà « Rejouer le tutoriel »).
- Carte en OLED (2026-11-27, demande « fond bien sombre ») : sepia(0.9) hue-rotate(180deg) saturate(1.8) brightness(1) contrast(1.12), fond de la carte et du chargement #000000, pastilles d'arrêts #0a0a0a.
- Carte en sombre classique, RETENU le 2026-11-27 (le réglage gris « dénotait du thème bleu ») : contrast(0.8) sepia(0.8) hue-rotate(180deg) saturate(3.5) brightness(0.7) contrast(1.15), fond mesuré #020d22 (proche du fond des écrans) ; la première version (#0a1934) n'était pas assez sombre. Pour teinter un fond presque noir, il faut le relever AVANT la teinte.
- Ancien essai : Carte en sombre (2026-11-27) : sepia(0.9) hue-rotate(180deg) saturate(1.8) brightness(1.45) contrast(0.88). Pour régler les clairs sans noircir la carte, jouer sur le contraste, pas seulement la luminosité.
- Paramètres, page principale (27/11) : « Quoi de neuf » est une carte pleine largeur (notes de la dernière version dépliables sur place, repliées à chaque ouverture, puis « Voir toutes les notes de version »). Dessous, trois tuiles égales sur une rangée, icône au-dessus du texte : tutoriel, bug, contact.
- Contenu dépliable dans les paramètres (27/11) : composant `Depliant` ; la hauteur est animée avec le ressort commun (la suite de la page accompagne), le contenu apparaît en fondu et la flèche se retourne en même temps.
