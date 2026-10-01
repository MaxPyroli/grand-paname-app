# Plan de projet — version 3.4.0

Statut : plan validé dans ses grandes lignes par l'utilisateur le 2026-10-02 (réponses aux six questions du premier brouillon). Les étapes sont à lancer une par une, chacune testée sur le téléphone avant la suivante. Les résultats « mesurés » viennent d'essais réels sur les API ; le reste est une proposition.

## 1. Déjà fait dans la 3.4.0 (branche `3.4.0`)

- Scanner Navigo (bêta) et barre à 5 onglets (repris de l'ancienne `4.0.0`), à tester avec un vrai passe.
- Animations des icônes de la barre de navigation (ondes de scan sur l'icône Scanner).
- Entrée « 3.4.0 » du changelog, tenue à jour au fil de l'eau.

## 2. Décisions de l'utilisateur pour l'info trafic et les lignes

1. **Volet Trafic = écran global** des **modes lourds** (RER, Transilien/Train, Métro, Tram, Câble) + une **recherche pour les bus**.
2. **Aperçu global « en un clin d'œil »**, façon Bonjour RATP : toutes les lignes lourdes d'un coup, l'état de chacune visible tout de suite.
3. **Fiche horaires d'une ligne à un arrêt** : toucher une ligne dans le volet des horaires d'un arrêt ouvre le détail des horaires (ou la fréquence par tranche horaire), les écarts avec l'horaire théorique (retards), les passages supprimés, etc.
4. **Itinéraire en aperçu sur la carte** : le tracé de la ligne avec ses arrêts et le sens de circulation, déclenché par ce même toucher sur la partie « horaires » d'une ligne.
5. **Tout cela vit dans les horaires** (pas de page séparée) ; l'onglet Trafic reste un volet.
6. **Tout est pour la 3.4.0**, construit par étapes testées.

## 3. Données (mesuré sur l'API PRIM / Navitia)

| Besoin | Source retenue | Mesure / contrainte |
|---|---|---|
| État de TOUTES les lignes | **API des perturbations en masse** : `marketplace/disruptions_bulk/disruptions/v2` (même clé) | 1 requête, ≈ 236 Ko compressé, 0,3 s ; 840 perturbations (gravité `BLOQUANTE` / `PERTURBEE` / `INFORMATION`, cause `TRAVAUX` / `PERTURBATION` / `INFORMATION`, période, titre, message HTML, message court) + 673 lignes impactées avec leur identifiant (`line:IDFM:C…`, identique à Navitia), leur mode et les identifiants des perturbations. Une ligne absente de la liste = trafic normal. |
| Liste des lignes lourdes (code, couleur, nom, id) | Navitia `lines?filter=physical_mode.id=…` par mode, mise en cache longue | `transport-data.json` ne sert pas : ce sont des tracés sans identifiant. |
| Détail d'une perturbation d'une ligne | idem bulk (déjà dans la réponse) | texte HTML à nettoyer (voir le portage de l'ancienne app, fiche mémoire § 16-17) |
| Parcours / tracé d'une ligne | Navitia `lines/{id}/routes` | 359 Ko pour une ligne avec géométrie (9 variantes pour le métro 1) : demander peu de champs, garder la géométrie du parcours choisi seulement. |
| Horaires d'une ligne à un arrêt (théorique et temps réel) | Navitia `stop_areas/{id}/departures` (déjà utilisé) avec l'heure théorique et l'heure prévue | à vérifier : champs retard, suppression, fréquence |
| Horaires complets d'une ligne | `route_schedules` | **17,7 Mo** pour une ligne : à proscrire sans ciblage (un parcours, un arrêt, une plage courte). |
| Perturbations par arrêt | bulk : objets impactés de type `stop_point` | ascenseurs, accès, etc. (anti-spam à porter) |

## 4. Étapes

Règle de conduite : une étape = une branche de commits sur `3.4.0`, un essai sur le téléphone, une puce de changelog, une entrée de journal. Le nouveau code va dans des fichiers à part, pas dans `App.tsx`.

### Étape 1 — Info trafic (aperçu global + détail + recherche de bus)
- **1.1 Données** : `app/traficApi.ts` (perturbations en masse avec cache de 60 s, liste des lignes lourdes en cache de plusieurs jours, calcul de l'état de chaque ligne, nettoyage des textes, anti-spam, « radar » des 7 jours).
- **1.2 Aperçu** : volet Trafic refait sur le gabarit commun : une section par mode (RER, Train, Métro, Tram, Câble), pastilles de lignes aux couleurs officielles, état par ligne (normal / perturbé / interrompu / travaux à venir), résumé en haut (« 3 lignes perturbées »), tirer pour actualiser, états de chargement et d'erreur.
- **1.3 Détail** : toucher une ligne → perturbations en cours (titre, cause, période, texte propre), regroupées par gravité.
- **1.4 Recherche de bus** : champ de recherche d'un numéro de ligne de bus (644 lignes impactées au total dans le flux ; les bus normaux apparaissent aussi), même détail.
- Critères de fin : l'aperçu s'affiche en moins de 2 s, état exact vérifié sur 5 lignes réelles (comparé à l'application d'Île-de-France Mobilités), pas de blocage de l'interface, thème clair et sombre, changelog.

### Étape 2 — Fiche horaires d'une ligne à un arrêt
- **2.1 Données** : horaires d'une ligne à un arrêt avec heure théorique / heure prévue, suppressions, perturbations de la ligne (réutilise l'étape 1) ; vérifier ce que l'API fournit réellement (retard, suppression, fréquence par tranche).
- **2.2 Écran** : toucher une ligne dans le volet des horaires → fiche (prochains passages, écart avec le théorique en minutes, passages supprimés, fréquence par tranche horaire quand elle existe, bandeau de perturbation de la ligne).
- Critères de fin : cas testés sur un RER, un métro, un tram et un bus ; pas de régression des horaires actuels.

### Étape 3 — Itinéraire de la ligne sur la carte
- **3.1 Données** : tracé et arrêts ordonnés par sens (peu de champs, géométrie du parcours choisi seulement).
- **3.2 Carte** : depuis la fiche d'une ligne, aperçu du tracé sur la carte avec ses arrêts, le sens de circulation et l'arrêt courant mis en évidence ; sortie propre (retour à la vue de l'arrêt).
- Critères de fin : aucun ralentissement perceptible de la carte (mesure avec le banc d'essai de fluidité), fonctionne sur les gros arrêts.

### Étape 4 — Finitions
- État de la ligne affiché dans les horaires d'un arrêt (comme le bandeau du câble C1 aujourd'hui, étendu à toutes les lignes lourdes), lignes favorites, polissage visuel (guide graphique), « Quoi de neuf ? » de la 3.4.0, mise à jour du guide graphique, essai complet.

### Étape 5 — Mise en paquet (comme la 3.3.3)
- Passage de la version à 3.4.0 (4 endroits), build de production signé, archivage, publication, étiquette GitHub, nettoyage des jetons si nécessaire.

## 5. Points à surveiller

- **Taille et rythme des réponses** : toujours mettre en cache, annuler les requêtes inutiles, ne jamais demander les horaires complets d'une ligne.
- **Qualité des textes** de perturbation (HTML, doublons, phrases parasites) : porter le nettoyage de l'ancienne application et le tester sur des cas réels.
- **Exactitude de l'état d'une ligne** : une perturbation d'un arrêt (ascenseur) ne doit pas colorer toute la ligne ; une perturbation à venir (travaux dans plusieurs semaines) ne doit pas afficher la ligne en panne aujourd'hui.
- **Fluidité** : 5 modes × plusieurs dizaines de pastilles ; vérifier la liste (virtualisation si besoin).
- **Carte** : le tracé d'une ligne ajoute des éléments dans la carte (WebView) ; respecter la règle des flous (jamais plus de 3 flous natifs) et la fluidité mesurée.
- **Taille du chantier** : c'est le plus gros de l'app depuis la 3.2 ; chaque étape doit être livrable seule.

## 6. Questions encore ouvertes (à trancher en cours de route)

1. Les travaux **à venir** (dans plus de 7 jours) apparaissent-ils dans l'aperçu ou seulement dans le détail d'une ligne ?
2. Le niveau « information » (ni retard ni coupure) colore-t-il la pastille ou reste-t-il dans le détail ?
3. Faut-il pouvoir **filtrer** l'aperçu (lignes perturbées seulement) ?
4. Le **Câble C1** reste-t-il traité à part (bandeau actuel) ou rentre-t-il dans le même système ?
