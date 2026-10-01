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
- **En-tête** : icône 26 px + titre 24 px (`PANEL_TITLE_SIZE`) sur une ligne de 32 px (`PANEL_TITLE_LINE`), sous-titre 13 px Light, marge basse 6 px. Action à droite : `PanelPillAction` (pastille 32 px, alignée sur le titre ; état actif = fond accent).
- **Cartes** : `panelCardStyle` (rayon 20, bordure `borderCard`, ombre douce) + `panelChipStyle` (puce 42 px, icône accent sur `iconGareBg`). Hauteur fixe 72 px pour les listes réorganisables.
- **État vide** : `PanelEmptyState` (icône 44 px, titre 17 px, description 14 px).
- **Liste** : début à 16 px sous l'en-tête (`FONDU_HAUT`) ; fondu des bords par masque de dégradé (`MaskedView`) aux longueurs standard ci-dessous.
- **Fondus de défilement (toute l'app)** : 16 px en haut (`FONDU_HAUT`), 40 px en bas (`FONDU_BAS`), constantes de `app/Fade.tsx` ; ne jamais passer une hauteur propre à un écran. Le fondu se pose APRÈS la liste dans le code (avant, la liste le recouvre). La liste commence à `FONDU_HAUT` du haut pour que le premier élément reste net au repos.
- Le volet des horaires (bottom sheet) descend sous la barre de nav : la barre y a un flou natif dont la cible est le volet seul.

## 5 quater. Pages plein écran (Paramètres)

- Fond opaque (`bg`) ; glisse depuis le bas avec le ressort commun (raideur 120, amortissement 15, masse 0,5), se ferme en 260 ms.
- En-tête = `PanelHeader` : icône 26 px accent, titre 24 px, action `PanelPillAction` « Fermer » à droite ; pas de ligne de séparation dessous.
- Contenu en cartes (`settingsCard`) : rayon 20, bordure `borderCard`, padding 16, ombre douce, précédées d'un titre de section en capitales.
- Interrupteurs : 44 × 26, pastille blanche 20 ; actif = fond accent, inactif = `dragBar`.

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

- **Façon de faire** : ressort commun (raideur 120, amortissement 15, masse 0,5) pour tout ce qui arrive/part (volet des horaires, barre de recherche au clavier, page des Paramètres). Courbe `cubic-bezier(0.22, 1, 0.36, 1)` 450 ms pour les tiroirs. Fondu pour ce qui porte un flou de la carte.

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
