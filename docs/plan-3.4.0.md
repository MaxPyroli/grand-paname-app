# Plan de la version 3.4.0 — brouillon à valider

Statut : proposition de l'agent, rédigée le 2026-10-01, à corriger avec l'utilisateur avant tout développement. Rien de ce qui suit n'est construit. Les points « mesuré » viennent d'essais réels sur l'API ; le reste est une proposition ou une déduction.

## 1. Ce que contient déjà la 3.4.0 (branche `3.4.0`)

- Scanner Navigo (bêta) et barre à 5 onglets, repris de l'ancienne branche `4.0.0` (voir le journal).
- Animations des icônes de la barre de navigation.
- Entrée de changelog « 3.4.0 » (date « En préparation »).

## 2. Objectif de la grosse mise à jour

Faire de l'onglet **Trafic** (aujourd'hui « Bientôt disponible ») un vrai espace **Lignes**, avec trois contenus liés :

1. **Info trafic** : l'état de chaque ligne et les perturbations en cours.
2. **Fiche horaires d'une ligne** : les horaires de passage d'une ligne, arrêt par arrêt, dans chaque sens.
3. **Itinéraire (parcours) d'une ligne** : la liste ordonnée des arrêts d'une ligne, par direction, avec les correspondances.

## 3. Ce qui existe déjà dans l'app et peut être réutilisé

- `fetchEtatLigne` (`NativeSchedules.tsx`) : état d'une ligne (ok / perturbée / arrêtée) depuis les perturbations Navitia, avec cache de 60 s. Aujourd'hui limité au câble C1.
- Pastilles de lignes (couleurs, texte contrasté), icônes de modes, gabarit des volets (`PanelLayout`), cartes (`panelCardStyle`), fondus, bandeau d'état défilant (`BandeauEtat`).
- Spécification de l'ancienne application web (fiche mémoire « Référence horaires Python », § 16, 17, 24) : filtre des statuts actifs, liste anti-spam (ascenseurs, tarifs…), score de gravité (interrompu 50 / dévié ou perturbé 20 / information 10), nettoyage du texte, « radar » des 7 jours (une alerte à plus de 7 jours est ignorée).

## 4. Données : ce qui a été mesuré sur l'API (Navitia / PRIM)

| Besoin | Ce qui marche | Contraintes mesurées |
|---|---|---|
| Perturbations d'UNE ligne | `lines/{id}/line_reports` (utilisé aujourd'hui) | une requête par ligne |
| Perturbations de TOUT le réseau | `line_reports` au niveau racine : renvoie seulement la liste des régions (inutilisable) ; `coverage/idfm/...` : erreur « unknown type: coverage » | pas de requête globale simple trouvée ; à chercher (autre point d'entrée PRIM « messages d'information / perturbations en masse », ou filtrer par mode avec `lines?filter=…` puis une requête par ligne) |
| Parcours d'une ligne | `lines/{id}/routes?depth=2` : 9 variantes de parcours pour le métro 1 | 359 Ko pour une ligne (géométrie incluse) : à alléger (`disable_geojson`, `depth=1`) |
| Horaires d'une ligne | `lines/{id}/route_schedules` | **17,7 Mo** pour une ligne : inutilisable tel quel ; il faut cibler un parcours, un arrêt, une durée courte et désactiver la géométrie |
| Liste des lignes par mode | `lines?filter=physical_mode.id=…` (fonctionne, voir la recherche d'arrêts) | quelques centaines de lignes pour les modes lourds, plus d'un millier avec les bus |

Conclusion : l'info trafic de toutes les lignes se fera en **deux temps** (liste des lignes mises en cache, puis état de chaque ligne à la demande ou par lots) ; les fiches horaires doivent être **petites et ciblées** (un parcours, un arrêt, une plage horaire).

## 5. Découpage proposé (chaque étape est livrable et testable seule)

1. **Étape 1 — Info trafic des lignes lourdes** : page Trafic = liste des lignes (RER, Transilien/Train, Métro, Tram, Câble) par mode, pastille de couleur + état (normal / perturbé / interrompu), tri par gravité, rafraîchissement par tirage, cache. Détail d'une perturbation au toucher (texte nettoyé, dates, anti-spam).
2. **Étape 2 — Parcours d'une ligne** : toucher une ligne → itinéraire par direction (liste ordonnée des arrêts, correspondances en pastilles, arrêt actuel mis en évidence), ouvrir un arrêt depuis la liste.
3. **Étape 3 — Fiche horaires d'une ligne** : pour un arrêt de la ligne et un sens, les prochains passages et les premiers/derniers départs ; lien depuis le parcours.
4. **Étape 4 — Finitions** : lignes favorites (accès rapide), état de la ligne affiché dans les horaires d'un arrêt (comme aujourd'hui pour le C1), recherche d'une ligne, bus (si l'usage le justifie).
5. **Plus tard (hors 3.4.0 ?)** : notifications de perturbations sur les lignes favorites (l'outil d'envoi existe, il faudrait un envoi automatique côté serveur).

## 6. Questions à trancher avec l'utilisateur

1. **Périmètre des modes** : seulement RER, Transilien, Métro, Tram, Câble pour la 3.4.0, ou aussi les bus (plus d'un millier de lignes, donc un autre mode de navigation : recherche) ?
2. **Forme de la page Trafic** : liste de toutes les lignes avec leur état (vue d'ensemble « tout va bien ? »), ou seulement les lignes perturbées (plus court), avec un interrupteur ?
3. **Fiches horaires** : « fiche horaires » = tableau des horaires d'un arrêt pour une ligne et un sens (prochains passages, premiers et derniers), ou l'équivalent d'une fiche papier complète (tous les horaires de la journée à chaque arrêt) ?
4. **Itinéraires** : « itinéraires des lignes » = le parcours de la ligne (liste des arrêts dans l'ordre), ou aussi un calculateur de trajet d'un point A à un point B ? (Le calculateur est un chantier beaucoup plus gros.)
5. **Où vit tout ça** : dans l'onglet Trafic renommé « Lignes », ou une page séparée ? Les lignes lourdes apparaissent aussi dans le volet des horaires d'un arrêt : lien à prévoir vers la fiche de la ligne ?
6. **Calendrier** : tout dans la 3.4.0, ou livrer l'étape 1 d'abord (3.4.0) et les fiches/itinéraires ensuite (3.5) ?

## 7. Risques

- Charge réseau et temps de réponse de l'API (une requête par ligne) : prévoir le cache, les lots et l'annulation.
- Qualité des textes de perturbation (souvent bruités) : le nettoyage de l'ancienne app est à porter et à tester sur des cas réels.
- Poids des réponses horaires (17,7 Mo) : toute requête doit être ciblée.
- Taille du chantier : c'est le plus gros de l'app depuis la 3.2 ; il faut le livrer par étapes testées sur le téléphone, sans lancer les trois contenus d'un coup.
- Les 3 700 lignes d'`App.tsx` rendent chaque ajout plus risqué : prévoir de mettre le nouveau code dans des fichiers à part (pas dans `App.tsx`).
