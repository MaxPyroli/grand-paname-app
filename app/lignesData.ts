export function normaliserGare(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type GeoLigne = {
  labels: [string, string];
  mots_1: string[];
  term_1: string[];
  mots_2: string[];
  term_2: string[];
};

// Fallback strict : n'intervient que quand TOPOLOGIE_LIGNES ne trouve pas de
// correspondance (gare/destination absente des routes, nom API abrégé...).
// mots_1/mots_2 ne listent donc plus que les mots-clés de terminus, pas les
// gares intermédiaires (déjà couvertes par TOPOLOGIE_LIGNES).
export const GEOGRAPHIE_RER: Record<string, GeoLigne> = {
  A: {
    labels: ['⇦ OUEST (Cergy / Poissy / St-Germain)', '⇨ EST (Marne-la-Vallée / Boissy)'],
    mots_1: ['CERGY','POISSY','GERMAIN'],
    term_1: ['HAUT','POISSY','GERMAIN'],
    mots_2: ['MARNE','BOISSY','CHESSY','DISNEY'],
    term_2: ['CHESSY','BOISSY'],
  },
  B: {
    labels: ['⇩ SUD (St-Rémy / Robinson)', '⇧ NORD (Roissy / Mitry)'],
    mots_1: ['REMY','RÉMY','ROBINSON'],
    term_1: ['REMY','RÉMY','ROBINSON'],
    mots_2: ['GAULLE','MITRY','AÉROPORT'],
    term_2: ['GAULLE','MITRY'],
  },
  C: {
    labels: ['⇦ OUEST (Versailles / Pontoise)', '⇨ SUD/EST (Massy / Dourdan / Étampes)'],
    mots_1: ['INVALIDES','VERSAILLES','QUENTIN','PONTOISE','AUSTERLITZ'],
    term_1: ['VERSAILLES','QUENTIN','PONTOISE','AUSTERLITZ'],
    mots_2: ['MASSY','DOURDAN','ETAMPES','ÉTAMPES','BRETIGNY','BRÉTIGNY'],
    term_2: ['DOURDAN','ETAMPES','ÉTAMPES','MASSY','BRÉTIGNY'],
  },
  D: {
    labels: ['⇩ SUD (Melun / Corbeil)', '⇧ NORD (Creil)'],
    mots_1: ['MELUN','CORBEIL','MALESHERBES'],
    term_1: ['MELUN','CORBEIL','MALESHERBES'],
    mots_2: ['CREIL','GOUSSAINVILLE','ORRY','GARE DE LYON'],
    term_2: ['CREIL','ORRY','GOUSSAINVILLE'],
  },
  E: {
    labels: ['⇦ OUEST (Nanterre)', '⇨ EST (Chelles / Tournan)'],
    mots_1: ['NANTERRE','HAUSSMANN'],
    term_1: ['NANTERRE','HAUSSMANN'],
    mots_2: ['CHELLES','TOURNAN'],
    term_2: ['CHELLES','TOURNAN'],
  },
  H: {
    labels: ['⇧ NORD (Pontoise / Persan / Creil)', '⇩ PARIS NORD'],
    mots_1: ['PONTOISE','PERSAN','LUZARCHES','CREIL'],
    term_1: ['PONTOISE','PERSAN','LUZARCHES','CREIL'],
    mots_2: ['PARIS','NORD'],
    term_2: ['PARIS','NORD'],
  },
  J: {
    labels: ['⇦ OUEST (Mantes / Gisors / Ermont)', '⇨ PARIS ST-LAZARE'],
    mots_1: ['MANTES','JOLIE','GISORS','ERMONT','VERNON'],
    term_1: ['MANTES','GISORS','ERMONT','VERNON'],
    mots_2: ['PARIS','LAZARE'],
    term_2: ['PARIS','LAZARE'],
  },
  K: {
    labels: ['⇧ NORD (Crépy-en-Valois)', '⇩ PARIS NORD'],
    mots_1: ['CREPY','CRÉPY'],
    term_1: ['CREPY','CRÉPY'],
    mots_2: ['PARIS','NORD'],
    term_2: ['PARIS','NORD'],
  },
  L: {
    labels: ['⇦ OUEST (Versailles / St-Nom / Cergy)', '⇨ PARIS ST-LAZARE'],
    mots_1: ['VERSAILLES','NOM','CERGY','HAUT'],
    term_1: ['VERSAILLES','NOM','HAUT'],
    mots_2: ['PARIS','LAZARE'],
    term_2: ['PARIS','LAZARE'],
  },
  N: {
    labels: ['⇦ OUEST (Rambouillet / Dreux / Mantes)', '⇨ PARIS MONTPARNASSE'],
    mots_1: ['RAMBOUILLET','DREUX','MANTES','JOLIE'],
    term_1: ['RAMBOUILLET','DREUX','MANTES'],
    mots_2: ['PARIS','MONTPARNASSE'],
    term_2: ['PARIS','MONTPARNASSE'],
  },
  P: {
    labels: ['⇨ EST (Meaux / Provins / Coulommiers)', '⇦ PARIS EST'],
    mots_1: ['MEAUX','CHATEAU','CHÂTEAU','FERTE','FERTÉ','PROVINS','COULOMMIERS'],
    term_1: ['MEAUX','CHÂTEAU','PROVINS','COULOMMIERS','FERTÉ'],
    mots_2: ['PARIS','EST'],
    term_2: ['PARIS','EST'],
  },
  R: {
    labels: ['⇩ SUD (Montereau / Montargis)', '⇧ PARIS GARE DE LYON'],
    mots_1: ['MONTEREAU','MONTARGIS','MELUN'],
    term_1: ['MONTEREAU','MONTARGIS'],
    mots_2: ['PARIS','LYON','BERCY'],
    term_2: ['PARIS','LYON'],
  },
  U: {
    labels: ['⇩ SUD (La Verrière)', '⇧ NORD (La Défense)'],
    mots_1: ['VERRIERE','VERRIÈRE'],
    term_1: ['VERRIERE','VERRIÈRE'],
    mots_2: ['DEFENSE','DÉFENSE'],
    term_2: ['DEFENSE','DÉFENSE'],
  },
  V: {
    labels: ['⇦ OUEST (Versailles-Chantiers)', '⇨ EST (Massy-Palaiseau)'],
    mots_1: ['VERSAILLES','CHANTIERS'],
    term_1: ['VERSAILLES'],
    mots_2: ['MASSY','PALAISEAU'],
    term_2: ['MASSY'],
  },
};

// Routes construites à partir d'un tronçon central commun (tronc) et de branches
// par terminus, pour éviter de répéter les gares centrales dans chaque route.
// direction 0 (idxTerm < idxDep) = vers le terminus banlieue = p1 = labels[0]
// direction 1 (idxTerm > idxDep) = vers Paris           = p2 = labels[1]
// Les fragments sont pré-normalisés : majuscules, sans accents, sans ponctuation.

// branches amont (terminus → tronc) + tronc
function amontVersTronc(tronc: string[], amont: string[][]): string[][] {
  return amont.map(b => [...b, ...tronc]);
}
// tronc + branches aval (tronc → terminus)
function troncVersAval(tronc: string[], aval: string[][]): string[][] {
  return aval.map(b => [...tronc, ...b]);
}
// combine chaque branche amont avec chaque branche aval de part et d'autre du tronc
// (produit cartésien complet : peu importe si toutes les combinaisons circulent
// réellement, calculerDirectionRelative ne compare que des index dans une même
// route, et l'ordre amont→tronc→aval est valable quelle que soit la branche)
function traversee(amont: string[][], tronc: string[], aval: string[][]): string[][] {
  const routes: string[][] = [];
  for (const a of amont) {
    for (const b of aval) {
      routes.push([...a, ...tronc, ...b]);
    }
  }
  return routes;
}

export const TOPOLOGIE_LIGNES: Record<string, { routes: string[][] }> = {
  A: {
    // Ouest → Est : 3 branches ouest (St-Germain / Cergy / Poissy), tronc central, 2 branches est (Boissy / Chessy)
    routes: traversee(
      [
        ['SAINT GERMAIN EN LAYE','PECQ','VESINET CENTRE','CHATOU','RUEIL','NANTERRE VILLE','NANTERRE UNIVERSITE'],
        ['CERGY LE HAUT','CERGY SAINT CHRISTOPHE','CERGY PREFECTURE','NEUVILLE UNIVERSITE','CONFLANS','ACHERES VILLE','MAISONS LAFFITTE','SARTROUVILLE','HOUILLES'],
        ['POISSY','ACHERES GRAND','MAISONS LAFFITTE','SARTROUVILLE','HOUILLES'],
      ],
      ['NANTERRE PREFECTURE','DEFENSE','ETOILE','AUBER','CHATELET','GARE DE LYON','NATION','VINCENNES'],
      [
        ['FONTENAY SOUS BOIS','NOGENT SUR MARNE','JOINVILLE','SAINT MAUR CRETEIL','PARC DE SAINT MAUR','CHAMPIGNY','VARENNE','SUCY','BOISSY'],
        ['VAL DE FONTENAY','NEUILLY PLAISANCE','BRY SUR MARNE','NOISY LE GRAND','NOISY CHAMPS','NOISIEL','LOGNES','TORCY','BUSSY','VAL D EUROPE','CHESSY'],
      ],
    ),
  },
  B: {
    // Sud → Nord : 2 branches sud (St-Rémy / Robinson), tronc central, 2 branches nord (Mitry / CDG)
    routes: traversee(
      [
        ['SAINT REMY','COURCELLE','GIF SUR YVETTE','HACQUINIERE','BURES','ORSAY VILLE','GUICHET','LOZERE','VILLEBON','PALAISEAU','MASSY PALAISEAU','VERRIERES','BACONNETS','FONTAINE MICHALON','ANTONY','CROIX DE BERNY','PARC DE SCEAUX'],
        ['ROBINSON','FONTENAY AUX ROSES','SCEAUX'],
      ],
      ['BOURG LA REINE','BAGNEUX','ARCUEIL CACHAN','LAPLACE','GENTILLY','CITE UNIVERSITAIRE','DENFERT','PORT ROYAL','LUXEMBOURG','SAINT MICHEL','CHATELET','GARE DU NORD','LA PLAINE','COURNEUVE','LE BOURGET','DRANCY','BLANC MESNIL','AULNAY'],
      [
        ['SEVRAN LIVRY','VERT GALANT','VILLEPARISIS','MITRY'],
        ['SEVRAN BEAUDOTTES','VILLEPINTE','PARC DES EXPOSITIONS','AEROPORT CDG','CHARLES DE GAULLE'],
      ],
    ),
  },
  C: {
    // Ouest/Nord → Sud/Est : 3 branches ouest, tronc central, 3 branches sud/est
    routes: traversee(
      [
        ['PONTOISE','AUMONE','LIESSE','PIERRELAYE','MONTIGNY BEAUCHAMP','FRANCONVILLE','CERNAY','ERMONT EAUBONNE','GRATIEN','EPINAY SUR SEINE','GENNEVILLIERS','GRESILLONS','SAINT OUEN','CLICHY','PEREIRE LEVALLOIS','PORTE MAILLOT','FOCH','HENRI MARTIN','BOULAINVILLIERS','KENNEDY'],
        ['SAINT QUENTIN EN YVELINES','CYR','VERSAILLES CHANTIERS','VIROFLAY','CHAVILLE','MEUDON','ISSY','VAL DE SEINE','GARIGLIANO','JAVEL'],
        ['VERSAILLES CHATEAU RIVE GAUCHE','PORCHEFONTAINE','VIROFLAY','CHAVILLE','MEUDON','ISSY','VAL DE SEINE','GARIGLIANO','JAVEL'],
      ],
      ['CHAMP DE MARS','ALMA','INVALIDES','MUSEE D ORSAY','SAINT MICHEL','AUSTERLITZ','BIBLIOTHEQUE','IVRY','VITRY','ARDOINES','CHOISY'],
      [
        ['VILLENEUVE LE ROI','ABLON','ATHIS MONS','JUVISY','SAVIGNY','EPINAY SUR ORGE','SAINTE GENEVIEVE','MICHEL SUR ORGE','BRETIGNY','MAROLLES','BOURAY','LARDY','CHAMARANDE','ETRECHY','ETAMPES','SAINT MARTIN D ETAMPES'],
        ['LES SAULES','ORLY VILLE','PONT DE RUNGIS','LA FRATERNELLE','ANTONY','VERRIERES','MASSY PALAISEAU'],
        ['VILLENEUVE LE ROI','ABLON','ATHIS MONS','JUVISY','SAVIGNY','EPINAY SUR ORGE','SAINTE GENEVIEVE','MICHEL SUR ORGE','BRETIGNY','NORVILLE','ARPAJON','EGLY','BREUILLET','CHERON','SERMAISE','DOURDAN','LA FORET'],
      ],
    ),
  },
  D: {
    // Terminus sud en premier → Paris → Creil en dernier : 3 branches sud vers un tronc unique
    routes: amontVersTronc(
      ['VILLENEUVE SAINT GEORGES','TRIAGE','POMPADOUR','VERT DE MAISONS','ALFORTVILLE','MAISONS ALFORT','GARE DE LYON','CHATELET','GARE DU NORD','STADE DE FRANCE','SAINT DENIS','PIERREFITTE','GARGES','VILLIERS LE BEL','GOUSSAINVILLE','NOUES','LOUVRES','SURVILLIERS','BORNE BLANCHE','ORRY','CHANTILLY','CREIL'],
      [
        ['MELUN','MEE','CESSON','SAVIGNY LE TEMPLE','LIEUSAINT','COMBS LA VILLE','BOUSSY SAINT ANTOINE','BRUNOY','YERRES','MONTGERON'],
        ['MALESHERBES','BOIGNEVILLE','GIRONVILLE','MAISSE','BOUTIGNY','FERTE ALAIS','BALLANCOURT','MENNECY','MOULIN GALANT','CORBEIL','EVRY','GRAND BOURG','RIS ORANGIS','VIRY CHATILLON','JUVISY','VIGNEUX'],
        ['CORBEIL','BRAS DE FER','COURCOURONNES','ORANGIS BOIS','GRIGNY','VIRY CHATILLON','JUVISY','VIGNEUX'],
        ['MELUN','VOSVES','BOISSISE','PONTHIERRY','FARGEAU','COUDRAY MONTCEAUX','PLESSIS CHENET','VILLABE','ESSONNES ROBINSON','CORBEIL','EVRY','GRAND BOURG','RIS ORANGIS','VIRY CHATILLON','JUVISY','VIGNEUX'],
      ],
    ),
  },
  E: {
    // Ouest → Est : tronc unique côté ouest, 2 branches est (Chelles / Tournan)
    routes: troncVersAval(
      ['NANTERRE LA FOLIE','DEFENSE','PORTE MAILLOT','HAUSSMANN','MAGENTA','GARE DE L EST','ROSA PARKS','PANTIN','NOISY LE SEC'],
      [
        ['BONDY','RAINCY VILLEMOMBLE','GAGNY','CHENAY GAGNY','CHELLES GOURNAY'],
        ['ROSNY BOIS PERRIER','ROSNY SOUS BOIS','VAL DE FONTENAY','NOGENT LE PERREUX','BOULLEREAUX CHAMPIGNY','VILLIERS SUR MARNE','YVRIS NOISY LE GRAND','EMERAINVILLE PONTAULT','ROISSY EN BRIE','OZOIR','GRETZ','TOURNAN'],
      ],
    ),
  },
  H: {
    // 4 branches nord → tronc unique → Paris Nord
    // + navette Pontoise↔Creil (via Valmondois/Persan-Beaumont/Boran) indépendante de Paris
    routes: [
      ...amontVersTronc(
        ['EPINAY VILLETANEUSE','SAINT DENIS','GARE DU NORD'],
        [
          ['PONTOISE','AUMONE','LIESSE','PIERRELAYE','MONTIGNY','FRANCONVILLE','CERNAY','ERMONT EAUBONNE','CHAMP DE COURSES','ENGHIEN','ORMESSON'],
          ['PERSAN BEAUMONT','CHAMPAGNE SUR OISE','ISLE ADAM PARMAIN','VALMONDOIS','MERIEL','MERY SUR OISE','FREPILLON','BESSANCOURT','TAVERNY','VAUCELLES','SAINT LEU','GROS NOYER SAINT PRIX','ERMONT HALTE','ERMONT EAUBONNE','CHAMP DE COURSES','ENGHIEN','ORMESSON'],
          ['PERSAN BEAUMONT','NOINTEL MOURS','PRESLES COURCELLES','MONTSOULT MAFFLIERS','BOUFFEMONT','DOMONT','ECOUEN EZANVILLE','SARCELLES SAINT BRICE','GROSLAY','DEUIL MONTMAGNY'],
          ['LUZARCHES','SEUGY','VIARMES','BELLOY','VILLAINES','MONTSOULT MAFFLIERS','BOUFFEMONT','DOMONT','ECOUEN EZANVILLE','SARCELLES SAINT BRICE','GROSLAY','DEUIL MONTMAGNY'],
        ],
      ),
      ['PONTOISE','SAINT OUEN L AUMONE','EPLUCHES','PONT PETIT','CHAPONVAL','AUVERS SUR OISE','VALMONDOIS','ISLE ADAM PARMAIN','CHAMPAGNE SUR OISE','PERSAN BEAUMONT','BRUYERES SUR OISE','BORAN SUR OISE','PRECY SUR OISE','SAINT LEU D ESSERENT','CREIL'],
    ],
  },
  J: {
    // 4 branches ouest → Paris St-Lazare (tronc réduit au terminus, pas de section centrale partagée)
    routes: amontVersTronc(
      ['SAINT LAZARE'],
      [
        ['ERMONT EAUBONNE','SANNOIS','ARGENTEUIL','STADE','COLOMBES','BOIS COLOMBES','ASNIERES'],
        ['GISORS','CHARS','BOISSY L AILLERIE','OSNY','PONTOISE','AUMONE','ERAGNY','CONFLANS SAINTE HONORINE','HERBLAY','FRETTE ISLE ADAM','CORMEILLES','VAL D ARGENTEUIL','ARGENTEUIL'],
        ['MANTES LA JOLIE','MANTES STATION','LIMAY','ISSOU PORCHEVILLE','GARGENVILLE','JUZIERS','MEULAN HARDRICOURT','THUN LE PARADIS','VAUX SUR SEINE','TRIEL SUR SEINE','CHANTELOUP LES VIGNES','ANDRESY','MAURECOURT','FIN D OISE','CONFLANS SAINTE HONORINE','HERBLAY','FRETTE ISLE ADAM','CORMEILLES','VAL D ARGENTEUIL','ARGENTEUIL'],
        ['VERNON GIVERNY','EVREUX','BUEIL','BREVAL','BONNIERES','ROSNY SUR SEINE','MANTES LA JOLIE','MANTES STATION','EPONE MEZIERES','AUBERGENVILLE','MUREAUX','VERNOUILLET VERNEUIL','VILLENNES SUR SEINE','POISSY','MAISONS LAFFITTE','SARTROUVILLE','HOUILLES'],
      ],
    ),
  },
  K: {
    // Terminus nord en premier → Paris Nord en dernier (branche unique)
    routes: [['CREPY EN VALOIS','ORMOY VILLERS','NANTEUIL LE HAUDOUIN','PLESSIS BELLEVILLE','DAMMARTIN JUILLY','THIEUX NANTOUILLET','COMPANS','MITRY CLAYE','AULNAY SOUS BOIS','GARE DU NORD']],
  },
  L: {
    // 3 branches ouest → tronc → Paris St-Lazare
    routes: amontVersTronc(
      ['BECON LES BRUYERES','ASNIERES','CLICHY LEVALLOIS','CARDINET','SAINT LAZARE'],
      [
        ['VERSAILLES RIVE DROITE','MONTREUIL','VIROFLAY RIVE DROITE','CHAVILLE RIVE DROITE','SEVRES VILLE D AVRAY','SAINT CLOUD','VAL D OR','SURESNES','PUTEAUX','DEFENSE','COURBEVOIE'],
        ['SAINT NOM LA BRETECHE FORET','ETANG LA VILLE','MARLY LE ROI','LOUVECIENNES','BOUGIVAL','LA CELLE SAINT CLOUD','VAUCRESSON','GARCHES MARNES LA COQUETTE','SAINT CLOUD','VAL D OR','SURESNES','PUTEAUX','DEFENSE','COURBEVOIE'],
        ['CERGY LE HAUT','CERGY SAINT CHRISTOPHE','CERGY PREFECTURE','NEUVILLE UNIVERSITE','FIN D OISE','ACHERES VILLE','MAISONS LAFFITTE','SARTROUVILLE','HOUILLES','NANTERRE UNIVERSITE','LA GARENNE COLOMBES','LES VALLEES'],
      ],
    ),
  },
  N: {
    // 3 branches ouest → tronc → Paris Montparnasse
    routes: amontVersTronc(
      ['SAINT CYR','VERSAILLES CHANTIERS','VIROFLAY RIVE GAUCHE','CHAVILLE RIVE GAUCHE','SEVRES RIVE GAUCHE','BELLEVUE','MEUDON','CLAMART','VANVES MALAKOFF','MONTPARNASSE'],
      [
        ['DREUX','MARCHEZAIS BROUE','HOUDAN','TACOIGNIERES','ORGERUS BEHOUST','GARANCIERES LA QUEUE','MONTFORT L AMAURY','VILLIERS NEAUPHLE','PLAISIR GRIGNON','VILLEPREUX LES CLAYES','FONTENAY LE FLEURY'],
        ['MANTES LA JOLIE','EPONE MEZIERES','NEZEL AULNAY','MAULE','MAREIL SUR MAULDRE','BEYNES','PLAISIR LES CLAYES','VILLEPREUX LES CLAYES','FONTENAY LE FLEURY'],
        ['RAMBOUILLET','LE PERRAY','LES ESSARTS LE ROI','COIGNIERES','LA VERRIERE','TRAPPES','SAINT QUENTIN EN YVELINES'],
      ],
    ),
  },
  P: {
    // 3 branches est → Paris Est (tronc réduit au terminus) + navette Ferté-Milon↔Meaux indépendante
    routes: [
      ...amontVersTronc(
        ['GARE DE L EST'],
        [
          ['CHATEAU THIERRY','CHEZY SUR MARNE','NOGENT L ARTAUD','NANTEUIL SAACY','FERTE SOUS JOUARRE','CHANGIS SAINT JEAN','TRILPORT','MEAUX','ESBLY','LAGNY THORIGNY','VAIRES TORCY','CHELLES GOURNAY'],
          ['COULOMMIERS','MOUROUX','FAREMOUTIERS POMMEUSE','GUERARD','MORTCERF','MARLES EN BRIE','TOURNAN'],
          ['PROVINS','CHAMPBENOIST','SAINTE COLOMBE SEPTVEILLES','LONGUEVILLE','NANGIS','MORMANT','VERNEUIL L ETANG','MORTCERF','MARLES EN BRIE','TOURNAN'],
        ],
      ),
      ['FERTE MILON','MAREUIL SUR OURCQ','CROUY SUR OURCQ','LIZY SUR OURCQ','ISLES ARMENTIERES CONGIS','TRILPORT','MEAUX'],
    ],
  },
  R: {
    // 2 branches sud → tronc → Paris Gare de Lyon + navette Montereau↔Melun indépendante
    routes: [
      ...amontVersTronc(
        ['MORET VENEUX LES SABLONS','THOMERY','FONTAINEBLEAU AVON','BOIS LE ROI','MELUN','GARE DE LYON'],
        [
          ['MONTEREAU','SAINT MAMMES'],
          ['MONTARGIS','FERRIERES FONTENAY','DORDIVES','SOUPPES CHATEAU LANDON','BAGNEAUX SUR LOING','NEMOURS SAINT PIERRE','BOURRON MARLOTTE','MONTIGNY SUR LOING'],
        ],
      ),
      ['MONTEREAU','LA GRANDE PAROISSE','VERNOU SUR SEINE','CHAMPAGNE SUR SEINE','VULAINES SUR SEINE','HERICY','FONTAINE LE PORT','CHARTRETTES','LIVRY SUR SEINE','MELUN'],
    ],
  },
  U: {
    // Terminus sud (La Verrière) en premier → La Défense en dernier
    routes: [['LA VERRIERE','TRAPPES','SAINT QUENTIN EN YVELINES','SAINT CYR','VERSAILLES CHANTIERS','CHAVILLE RIVE DROITE','SEVRES VILLE D AVRAY','SAINT CLOUD','SURESNES','PUTEAUX','DEFENSE']],
  },
  V: {
    // Ouest → Est : Versailles-Chantiers en premier, Massy-Palaiseau en dernier
    routes: [['VERSAILLES CHANTIERS','PETIT JOUY LES LOGES','JOUY EN JOSAS','VAUBOYEN','BIEVRES','IGNY','MASSY PALAISEAU']],
  },
};
