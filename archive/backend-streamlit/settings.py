import streamlit as st
import os

# ==========================================
#        IDENTITÉ DE L'APPLICATION
# ==========================================

APP_NAME = "Grand Paname"
APP_VERSION = "v2.3.2"
APP_CODENAME = "Beaufort 🧀"
APP_SUBTITLE = "Naviguez le Grand Paris, tout simplement."

# ==========================================
#              CONFIGURATION API
# ==========================================
# ⚠️ ATTENTION : Mets ta VRAIE clé entre les guillemets !
API_KEY = "d91efea0e226a55a14d71310d586bbb63c3bffa6568cb8a209649f73"

BASE_URL = "https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia"

# (Garde tout le reste de tes dictionnaires en dessous)

# ==========================================
#              CONSTANTES MÉTIER
# ==========================================
# (Garde tes dictionnaires HIERARCHIE, GEOGRAPHIE_RER etc. intacts juste en dessous !)
HIERARCHIE = {"RER": 1, "TRAIN": 2, "METRO": 3, "CABLE": 4, "TRAM": 5, "BUS": 6, "AUTRE": 99}

GEOGRAPHIE_RER = {
    "A": {
        "labels": ("⇦ OUEST (Cergy / Poissy / St-Germain)", "⇨ EST (Marne-la-Vallée / Boissy)"),
        "mots_1": ["CERGY", "POISSY", "GERMAIN", "RUEIL", "DEFENSE", "DÉFENSE", "NANTERRE", "VESINET", "MAISONS", "LAFFITTE", "PECQ", "ACHERES", "GRANDE ARCHE", "SARTROUVILLE"],
        "term_1": ["HAUT", "POISSY", "GERMAIN"],
        "mots_2": ["MARNE", "BOISSY", "TORCY", "NATION", "VINCENNES", "FONTENAY", "NOISY", "JOINVILLE", "VALLEE", "CHESSY", "DISNEY"],
        "term_2": ["CHESSY", "BOISSY"]
    },
    "B": {
        "labels": ("⇩ SUD (St-Rémy / Robinson)", "⇧ NORD (Roissy / Mitry)"),
        "mots_1": ["REMY", "RÉMY", "ROBINSON", "LAPLACE", "DENFERT", "CITE", "MASSY", "ORSAY", "BOURG", "CROIX", "GENTILLY", "ARCUEIL", "BAGNEUX"],
        "term_1": ["REMY", "RÉMY", "ROBINSON"],
        "mots_2": ["GAULLE", "MITRY", "NORD", "AULNAY", "BOURGET", "LA PLAINE", "CLAYE", "AÉROPORT"],
        "term_2": ["GAULLE", "MITRY"]
    },
    "C": {
        "labels": ("⇦ OUEST (Versailles / Pontoise)", "⇨ SUD/EST (Massy / Dourdan / Étampes)"),
        "mots_1": ["INVALIDES", "AUSTERLITZ", "VERSAILLES", "QUENTIN", "PONTOISE", "CHAMP", "EIFFEL", "CHAVILLE", "ERMONT", "JAVEL", "ALMA", "VELIZY", "BEAUCHAMP", "MONTIGNY", "ARGENTEUIL"],
        "term_1": ["VERSAILLES", "QUENTIN", "PONTOISE", "AUSTERLITZ"],
        "mots_2": ["MASSY", "DOURDAN", "ETAMPES", "ÉTAMPES", "MARTIN", "JUVISY", "BIBLIOTHEQUE", "ORLY", "RUNGIS", "BRETIGNY", "BRÉTIGNY", "CHOISY", "IVRY", "ATHIS", "SAVIGNY"],
        "term_2": ["DOURDAN", "ETAMPES", "ÉTAMPES", "MASSY", "BRÉTIGNY"]
    },
    "D": {
        "labels": ("⇩ SUD (Melun / Corbeil)", "⇧ NORD (Creil)"),
        "mots_1": ["MELUN", "CORBEIL", "MALESHERBES", "VILLENEUVE", "COMBS", "FERTE", "LIEUSAINT", "MOISSELLES", "JUVISY"],
        "term_1": ["MELUN", "CORBEIL", "MALESHERBES"],
        "mots_2": ["CREIL", "GOUSSAINVILLE", "ORRY", "VILLIERS", "STADE", "DENIS", "LOUVRES", "SURVILLIERS", "GARE DE LYON", "PARIS", "CHATELET", "NORD"],
        "term_2": ["CREIL", "ORRY", "GOUSSAINVILLE"]
    },
    "E": {
        "labels": ("⇦ OUEST (Nanterre)", "⇨ EST (Chelles / Tournan)"),
        "mots_1": ["HAUSSMANN", "LAZARE", "MAGENTA", "NANTERRE", "DEFENSE", "DÉFENSE", "ROSA"],
        "term_1": ["NANTERRE", "HAUSSMANN"],
        "mots_2": ["CHELLES", "TOURNAN", "VILLIERS", "GAGNY", "EMERAINVILLE", "ROISSY", "NOISY", "BONDY"],
        "term_2": ["CHELLES", "TOURNAN"]
    },
    "H": {
        "labels": ("⇧ NORD (Pontoise / Persan / Creil)", "⇩ PARIS NORD"),
        "mots_1": ["PONTOISE", "PERSAN", "BEAUMONT", "LUZARCHES", "CREIL", "MONTSOULT", "VALMONDOIS", "SARROUS", "SAINT-LEU", "SARCELLES", "BRICE"],
        "term_1": ["PONTOISE", "PERSAN", "LUZARCHES", "CREIL"],
        "mots_2": ["PARIS", "NORD"],
        "term_2": ["PARIS", "NORD"]
    },
    "J": {
        "labels": ("⇦ OUEST (Mantes / Gisors / Ermont)", "⇨ PARIS ST-LAZARE"),
        "mots_1": ["MANTES", "JOLIE", "GISORS", "ERMONT", "VERNON", "PONTOISE", "CONFLANS", "BOISSY", "MEULAN", "MUREAUX", "CORMEILLES", "ARGENTEUIL", "ISSOU"],
        "term_1": ["MANTES", "GISORS", "ERMONT", "VERNON"],
        "mots_2": ["PARIS", "LAZARE"],
        "term_2": ["PARIS", "LAZARE"]
    },
    "K": {
        "labels": ("⇧ NORD (Crépy-en-Valois)", "⇩ PARIS NORD"),
        "mots_1": ["CREPY", "CRÉPY", "DAMMARTIN"],
        "term_1": ["CREPY", "CRÉPY"],
        "mots_2": ["PARIS", "NORD"],
        "term_2": ["PARIS", "NORD"]
    },
    "L": {
        "labels": ("⇦ OUEST (Versailles / St-Nom / Cergy)", "⇨ PARIS ST-LAZARE"),
        "mots_1": ["VERSAILLES", "NOM", "BRETÈCHE", "CERGY", "NANTERRE", "MAISONS", "CLOUD", "SARTROUVILLE"],
        "term_1": ["VERSAILLES", "NOM", "HAUT"],       
        "mots_2": ["PARIS", "LAZARE"],
        "term_2": ["PARIS", "LAZARE"]
    },
    "N": {
        "labels": ("⇦ OUEST (Rambouillet / Dreux / Mantes)", "⇨ PARIS MONTPARNASSE"),
        "mots_1": ["RAMBOUILLET", "DREUX", "MANTES", "JOLIE", "PLAISIR", "SEVRES", "SÈVRES"],
        "term_1": ["RAMBOUILLET", "DREUX", "MANTES"],
        "mots_2": ["PARIS", "MONTPARNASSE"],
        "term_2": ["PARIS", "MONTPARNASSE"]
    },
    "P": {
        "labels": ("⇨ EST (Meaux / Provins / Coulommiers)", "⇦ PARIS EST"),
        "mots_1": ["MEAUX", "CHATEAU", "CHÂTEAU", "THIERRY", "FERTE", "FERTÉ", "MILON", "PROVINS", "COULOMMIERS"],
        "term_1": ["MEAUX", "CHÂTEAU", "PROVINS", "COULOMMIERS", "FERTÉ"],
        "mots_2": ["PARIS", "EST"],
        "term_2": ["PARIS", "EST"]
    },
    "R": {
        "labels": ("⇩ SUD (Montereau / Montargis)", "⇧ PARIS GARE DE LYON"),
        "mots_1": ["MONTEREAU", "MONTARGIS", "MELUN"],
        "term_1": ["MONTEREAU", "MONTARGIS"],
        "mots_2": ["PARIS", "LYON", "BERCY"],
        "term_2": ["PARIS", "LYON"]
    },
    "U": {
        "labels": ("⇩ SUD (La Verrière)", "⇧ NORD (La Défense)"),
        "mots_1": ["VERRIERE", "VERRIÈRE", "TRAPPES"],
        "term_1": ["VERRIERE", "VERRIÈRE"],
        "mots_2": ["DEFENSE", "DÉFENSE"],
        "term_2": ["DEFENSE", "DÉFENSE"]
    },
    "V": {
        "labels": ("⇦ OUEST (Versailles-Chantiers)", "⇨ EST (Massy-Palaiseau)"),
        "mots_1": ["VERSAILLES", "CHANTIERS"],
        "term_1": ["VERSAILLES"],
        "mots_2": ["MASSY", "PALAISEAU"],
        "term_2": ["MASSY"]
    }
}

TOPOLOGIE_LIGNES = {
    "A": {
        "nom_aller": "⇨ EST (Marne-la-Vallée / Boissy)",
        "nom_retour": "⇦ OUEST (Cergy / Poissy / St-Germain)",
        "routes": [
            # 1. Axe classique : St-Germain <-> Boissy
            ["GERMAIN", "PECQ", "VESINET", "CHATOU", "RUEIL", "NANTERRE", "DEFENSE", "GAULLE", "AUBER", "CHATELET", "LYON", "NATION", "VINCENNES", "FONTENAY-SOUS", "NOGENT", "JOINVILLE", "MAUR", "CHAMPIGNY", "VARENNE", "SUCY", "BOISSY"],
            
            # 2. Axe classique : Cergy <-> Marne-la-Vallée
            ["CERGY", "NEUVILLE", "CONFLANS", "ACHERES", "MAISONS", "SARTROUVILLE", "HOUILLES", "NANTERRE", "DEFENSE", "GAULLE", "AUBER", "CHATELET", "LYON", "NATION", "VINCENNES", "VAL DE FONTENAY", "NEUILLY", "BRY", "NOISY", "LOGNES", "TORCY", "BUSSY", "EUROPE", "CHESSY"],
            
            # 3. Axe classique : Poissy <-> Marne-la-Vallée
            ["POISSY", "ACHERES", "MAISONS", "SARTROUVILLE", "HOUILLES", "NANTERRE", "DEFENSE", "GAULLE", "AUBER", "CHATELET", "LYON", "NATION", "VINCENNES", "VAL DE FONTENAY", "NEUILLY", "BRY", "NOISY", "LOGNES", "TORCY", "BUSSY", "EUROPE", "CHESSY"],
            
            # 4. Axe "Nuit/Travaux" : Cergy <-> Boissy (Au cas où !)
            ["CERGY", "NEUVILLE", "CONFLANS", "ACHERES", "MAISONS", "SARTROUVILLE", "HOUILLES", "NANTERRE", "DEFENSE", "GAULLE", "AUBER", "CHATELET", "LYON", "NATION", "VINCENNES", "FONTENAY-SOUS", "NOGENT", "JOINVILLE", "MAUR", "CHAMPIGNY", "VARENNE", "SUCY", "BOISSY"],
            
            # 5. Axe "Nuit/Travaux" : St-Germain <-> Marne-la-Vallée (Au cas où !)
            ["GERMAIN", "PECQ", "VESINET", "CHATOU", "RUEIL", "NANTERRE", "DEFENSE", "GAULLE", "AUBER", "CHATELET", "LYON", "NATION", "VINCENNES", "VAL DE FONTENAY", "NEUILLY", "BRY", "NOISY", "LOGNES", "TORCY", "BUSSY", "EUROPE", "CHESSY"]
        ]
    }, # <--- LA CORRECTION EST ICI : on ferme le dictionnaire de la ligne A avec "},"

    "B": {
        "nom_aller": "⇧ NORD (Aéroport CDG / Mitry)",
        "nom_retour": "⇩ SUD (St-Rémy / Robinson)",
        "routes": [
            # 1. Axe : St-Rémy <-> Mitry
            ["REMY", "COURCELLE", "GIF", "BURES", "ORSAY", "LOZERE", "PALAISEAU", "MASSY", "VERRIERES", "FONTAINE", "CROIX", "BOURG", "BAGNEUX", "ARCUEIL", "LAPLACE", "GENTILLY", "CITE UNIVERSITAIRE", "DENFERT", "ROYAL", "LUXEMBOURG", "MICHEL", "CHATELET", "EST", "NORD", "PLAINE", "COURNEUVE", "BOURGET", "DRANCY", "BLANC", "AULNAY", "SEVRAN LIVRY", "VERT GALANT", "VILLEPARISIS", "MITRY"],
            
            # 2. Axe : Robinson <-> Aéroport CDG
            ["ROBINSON", "FONTENAY", "SCEAUX", "BOURG", "BAGNEUX", "ARCUEIL", "LAPLACE", "GENTILLY", "CITE UNIVERSITAIRE", "DENFERT", "ROYAL", "LUXEMBOURG", "MICHEL", "CHATELET", "EST", "NORD", "PLAINE", "COURNEUVE", "BOURGET", "DRANCY", "BLANC", "AULNAY", "SEVRAN BEAUDOTTES", "VILLEPINTE", "PARC", "GAULLE"]
        ]
    },

    "C": {
        "nom_aller": "⇨ SUD/EST (Massy / Dourdan / Étampes)",
        "nom_retour": "⇦ OUEST (Versailles / Pontoise / St-Quentin)",
        "routes": [
            # 1. Axe Pontoise <-> Massy Palaiseau (via Pont de Rungis)
            ["PONTOISE", "AUMONE", "LIESSE", "PIERRELAYE", "MONTIGNY", "FRANCONVILLE", "CERNAY", "ERMONT", "GRATIEN", "EPINAY SUR SEINE", "GENNEVILLIERS", "GRESILLONS", "SAINT-OUEN", "CLICHY", "PEREIRE", "MAILLOT", "FOCH", "HENRI MARTIN", "BOULAINVILLIERS", "KENNEDY", "CHAMP DE MARS", "ALMA", "INVALIDES", "ORSAY", "MICHEL", "AUSTERLITZ", "BIBLIOTHEQUE", "IVRY", "VITRY", "ARDOINES", "CHOISY", "SAULES", "ORLY", "RUNGIS", "FRATERNELLE", "CHEMIN D'ANTONY", "VERRIERES", "MASSY PALAISEAU"],
            
            # 2. Axe St-Quentin <-> Étampes
            ["QUENTIN", "CYR", "VERSAILLES CHANTIERS", "PORCHEFONTAINE", "VIROFLAY", "CHAVILLE", "MEUDON", "ISSY", "VAL DE SEINE", "GARIGLIANO", "JAVEL", "CHAMP DE MARS", "ALMA", "INVALIDES", "ORSAY", "MICHEL", "AUSTERLITZ", "BIBLIOTHEQUE", "IVRY", "VITRY", "ARDOINES", "CHOISY", "VILLENEUVE LE ROI", "ABLON", "ATHIS", "JUVISY", "SAVIGNY", "EPINAY SUR ORGE", "GENEVIEVE", "MICHEL SUR ORGE", "BRETIGNY", "MAROLLES", "BOURAY", "LARDY", "CHAMARANDE", "ETRECHY", "ETAMPES"],

            # 3. Axe Versailles Château <-> Dourdan
            ["VERSAILLES CHATEAU", "PORCHEFONTAINE", "VIROFLAY", "CHAVILLE", "MEUDON", "ISSY", "VAL DE SEINE", "GARIGLIANO", "JAVEL", "CHAMP DE MARS", "ALMA", "INVALIDES", "ORSAY", "MICHEL", "AUSTERLITZ", "BIBLIOTHEQUE", "IVRY", "VITRY", "ARDOINES", "CHOISY", "VILLENEUVE LE ROI", "ABLON", "ATHIS", "JUVISY", "SAVIGNY", "EPINAY SUR ORGE", "GENEVIEVE", "MICHEL SUR ORGE", "BRETIGNY", "NORVILLE", "ARPAJON", "EGLY", "BREUILLET", "CHERON", "SERMAISE", "DOURDAN"],
            
            # 4. La boucle Sud (Massy -> Versailles Chantiers via la vallée de la Bièvre)
            ["JUVISY", "SAVIGNY", "EPINAY SUR ORGE", "GRAVIGNY", "PETIT VAUX", "MASSY PALAISEAU", "IGNY", "BIEVRES", "VAUBOYEN", "JOUY", "PETIT JOUY", "VERSAILLES CHANTIERS"]
        ]
    },

    "D": {
        "nom_aller": "⇩ SUD (Melun / Corbeil / Malesherbes)",
        "nom_retour": "⇧ NORD (Creil / Orry)",
        "routes": [
            # 1. Axe Nord <-> Sud (via Combs-la-Ville)
            ["CREIL", "CHANTILLY", "BORNE BLANCHE", "SURVILLIERS", "LOUVRES", "NOUES", "GOUSSAINVILLE", "VILLIERS LE BEL", "GONESSE", "GARGES", "PIERREFITTE", "DENIS", "STADE DE FRANCE", "NORD", "CHATELET", "LYON", "MAISONS ALFORT", "ALFORTVILLE", "VERT DE MAISONS", "POMPADOUR", "TRIAGE", "VILLENEUVE SAINT-GEORGES", "MONTGERON", "YERRES", "BRUNOY", "BOUSSY", "COMBS", "LIEUSAINT", "SAVIGNY LE TEMPLE", "CESSON", "MEE", "MELUN"],
            
            # 2. Axe Centre <-> Malesherbes (via le Plateau - Evry Courcouronnes)
            ["CREIL", "CHANTILLY", "BORNE BLANCHE", "SURVILLIERS", "LOUVRES", "NOUES", "GOUSSAINVILLE", "VILLIERS LE BEL", "GONESSE", "GARGES", "PIERREFITTE", "DENIS", "STADE DE FRANCE", "NORD", "CHATELET", "LYON", "MAISONS ALFORT", "ALFORTVILLE", "VERT DE MAISONS", "POMPADOUR", "TRIAGE", "VILLENEUVE SAINT-GEORGES", "VIGNEUX", "JUVISY", "VIRY", "GRIGNY", "ORANGIS BOIS", "COURCOURONNES", "BRAS DE FER", "CORBEIL", "MOULIN GALANT", "MENNECY", "BALLANCOURT", "FERTE ALAIS", "BOUTIGNY", "MAISSE", "BUNO", "GIRONVILLE", "MALESHERBES"],
            
            # 3. Axe Centre <-> Melun (via la Vallée - Evry Val de Seine)
            ["CREIL", "CHANTILLY", "BORNE BLANCHE", "SURVILLIERS", "LOUVRES", "NOUES", "GOUSSAINVILLE", "VILLIERS LE BEL", "GONESSE", "GARGES", "PIERREFITTE", "DENIS", "STADE DE FRANCE", "NORD", "CHATELET", "LYON", "MAISONS ALFORT", "ALFORTVILLE", "VERT DE MAISONS", "POMPADOUR", "TRIAGE", "VILLENEUVE SAINT-GEORGES", "VIGNEUX", "JUVISY", "VIRY", "RIS ORANGIS", "GRAND BOURG", "VAL DE SEINE", "CORBEIL", "ESSONNES ROBINSON", "VILLABE", "PLESSIS CHENET", "COUDRAY", "PONTHIERRY", "VOSVES", "MELUN"]
        ]
    },

    "E": {
        "nom_aller": "⇨ EST (Chelles / Tournan)",
        "nom_retour": "⇦ OUEST (Nanterre / Saint-Lazare)",
        "routes": [
            # 1. Branche Chelles-Gournay
            ["NANTERRE", "DEFENSE", "MAILLOT", "HAUSSMANN", "MAGENTA", "ROSA PARKS", "PANTIN", "NOISY", "BONDY", "RAINCY", "CHENAY", "CHELLES"],
            
            # 2. Branche Tournan
            ["NANTERRE", "DEFENSE", "MAILLOT", "HAUSSMANN", "MAGENTA", "ROSA PARKS", "PANTIN", "NOISY", "ROSNY BOIS PERRIER", "ROSNY SOUS BOIS", "VAL DE FONTENAY", "NOGENT", "BOULLEREAUX", "VILLIERS", "YVRIS", "EMERAINVILLE", "ROISSY", "OZOIR", "GRETZ", "TOURNAN"]
        ]
    },

    "H": {
        "nom_aller": "⇧ NORD (Pontoise / Persan / Creil)",
        "nom_retour": "⇩ PARIS NORD",
        "routes": [
            # 1. Branche Pontoise
            ["NORD", "DENIS", "EPINAY", "ENGHIEN", "CHAMP DE COURSES", "ERMONT EAUBONNE", "CERNAY", "FRANCONVILLE", "MONTIGNY", "PIERRELAYE", "LIESSE", "AUMONE", "PONTOISE"],
            # 2. Branche Persan via Valmondois
            ["NORD", "DENIS", "EPINAY", "ENGHIEN", "CHAMP DE COURSES", "ERMONT EAUBONNE", "ERMONT HALTE", "GROS NOYER", "SAINT-PRIX", "VAUCELLES", "TAVERNY", "BESSANCOURT", "FREPILLON", "MERY", "MERIEL", "VALMONDOIS", "ISLE-ADAM", "CHAMPAGNE", "PERSAN"],
            # 3. Branche Persan / Creil via Montsoult
            ["NORD", "DENIS", "EPINAY", "DEUIL", "GROSLAY", "SARCELLES", "ECOUEN", "DOMONT", "BOUFFEMONT", "MONTSOULT", "PRESLES", "NOINTEL", "PERSAN", "BRUYERES", "BORAN", "PRECY", "ESSERENT", "CREIL"],
            # 4. Branche Luzarches
            ["NORD", "DENIS", "EPINAY", "DEUIL", "GROSLAY", "SARCELLES", "ECOUEN", "DOMONT", "BOUFFEMONT", "MONTSOULT", "VILLAINES", "VIARMES", "SEUGY", "LUZARCHES"]
        ]
    },

    "J": {
        "nom_aller": "⇦ OUEST (Mantes / Gisors / Ermont)",
        "nom_retour": "⇨ PARIS ST-LAZARE",
        "routes": [
            # 1. Groupe IV : Ermont
            ["LAZARE", "ASNIERES", "BOIS COLOMBES", "COLOMBES", "STADE", "ARGENTEUIL", "SANNOIS", "ERMONT"],
            # 2. Groupe VI : Gisors
            ["LAZARE", "ARGENTEUIL", "VAL D'ARGENTEUIL", "CORMEILLES", "FRETTE", "HERBLAY", "CONFLANS SAINTE-HONORINE", "ERAGNY", "AUMONE", "PONTOISE", "OSNY", "BOISSY L'AILLERIE", "MONTGEROULT", "US", "SANTEUIL", "CHARS", "VILLETERTRE", "LIANCOURT", "CHAUMONT", "TRIE", "GISORS"],
            # 3. Groupe VI : Mantes via Conflans
            ["LAZARE", "ARGENTEUIL", "VAL D'ARGENTEUIL", "CORMEILLES", "FRETTE", "HERBLAY", "CONFLANS SAINTE-HONORINE", "FIN D'OISE", "MAURECOURT", "ANDRESY", "CHANTELOUP", "TRIEL", "VAUX", "THUN", "MEULAN", "JUZIERS", "GARGENVILLE", "ISSOU", "LIMAY", "MANTES STATION", "MANTES LA JOLIE"],
            # 4. Groupe V : Mantes / Vernon via Poissy
            ["LAZARE", "HOUILLES", "SARTROUVILLE", "MAISONS LAFFITTE", "POISSY", "VILLENNES", "VERNOUILLET", "CLAIRIERES", "MUREAUX", "AUBERGENVILLE", "EPONE", "MANTES STATION", "MANTES LA JOLIE", "ROSNY", "BONNIERES", "BREVAL", "BUEIL", "EVREUX", "VERNON"]
        ]
    },

    "K": {
        "nom_aller": "⇧ NORD (Crépy-en-Valois)",
        "nom_retour": "⇩ PARIS NORD",
        "routes": [
            ["NORD", "AULNAY", "MITRY", "COMPANS", "THIEUX", "DAMMARTIN", "PLESSIS", "NANTEUIL", "ORMOY", "CREPY"]
        ]
    },

    "L": {
        "nom_aller": "⇦ OUEST (Versailles / St-Nom / Cergy)",
        "nom_retour": "⇨ PARIS ST-LAZARE",
        "routes": [
            # 1. Versailles Rive Droite
            ["LAZARE", "CARDINET", "CLICHY", "ASNIERES", "BECON", "COURBEVOIE", "DEFENSE", "PUTEAUX", "SURESNES", "VAL D'OR", "CLOUD", "SEVRES", "CHAVILLE RIVE DROITE", "VIROFLAY RIVE DROITE", "MONTREUIL", "VERSAILLES RIVE DROITE"],
            # 2. Saint-Nom la Bretèche
            ["LAZARE", "CARDINET", "CLICHY", "ASNIERES", "BECON", "COURBEVOIE", "DEFENSE", "PUTEAUX", "SURESNES", "VAL D'OR", "CLOUD", "GARCHES", "VAUCRESSON", "CELLE", "BOUGIVAL", "LOUVECIENNES", "MARLY", "ETANG", "NOM LA BRETECHE"],
            # 3. Cergy le Haut
            ["LAZARE", "CARDINET", "CLICHY", "ASNIERES", "BECON", "VALLEES", "GARENNE", "NANTERRE UNIVERSITE", "HOUILLES", "SARTROUVILLE", "MAISONS LAFFITTE", "ACHERES VILLE", "FIN D'OISE", "NEUVILLE", "CERGY PREFECTURE", "SAINT-CHRISTOPHE", "CERGY LE HAUT"]
        ]
    },

    "N": {
        "nom_aller": "⇦ OUEST (Rambouillet / Dreux / Mantes)",
        "nom_retour": "⇨ PARIS MONTPARNASSE",
        "routes": [
            # 1. Dreux
            ["MONTPARNASSE", "VANVES", "CLAMART", "MEUDON", "BELLEVUE", "SEVRES RIVE GAUCHE", "CHAVILLE RIVE GAUCHE", "VIROFLAY RIVE GAUCHE", "VERSAILLES CHANTIERS", "CYR", "FONTENAY", "VILLEPREUX", "PLAISIR", "VILLIERS", "MONTFORT", "GARANCIERES", "ORGERUS", "TACOIGNIERES", "HOUDAN", "MARCHEZAIS", "DREUX"],
            # 2. Mantes-la-Jolie
            ["MONTPARNASSE", "VANVES", "CLAMART", "MEUDON", "BELLEVUE", "SEVRES RIVE GAUCHE", "CHAVILLE RIVE GAUCHE", "VIROFLAY RIVE GAUCHE", "VERSAILLES CHANTIERS", "CYR", "FONTENAY", "VILLEPREUX", "PLAISIR", "BEYNES", "MAREIL", "MAULE", "NEZEL", "EPONE", "MANTES LA JOLIE"],
            # 3. Rambouillet
            ["MONTPARNASSE", "VANVES", "CLAMART", "MEUDON", "BELLEVUE", "SEVRES RIVE GAUCHE", "CHAVILLE RIVE GAUCHE", "VIROFLAY RIVE GAUCHE", "VERSAILLES CHANTIERS", "CYR", "QUENTIN", "TRAPPES", "VERRIERE", "COIGNIERES", "ESSARTS", "PERRAY", "RAMBOUILLET"]
        ]
    },

    "P": {
        "nom_aller": "⇨ EST (Meaux / Provins / Coulommiers)",
        "nom_retour": "⇦ PARIS EST",
        "routes": [
            # 1. Meaux / Château Thierry
            ["EST", "CHELLES", "VAIRES", "LAGNY", "ESBLY", "MEAUX", "TRILPORT", "CHANGIS", "FERTE SOUS JOUARRE", "NANTEUIL", "NOGENT L'ARTAUD", "CHEZY", "CHATEAU THIERRY"],
            # 2. Coulommiers
            ["EST", "TOURNAN", "MARLES", "MORTCERF", "GUERARD", "FAREMOUTIERS", "MOUROUX", "COULOMMIERS"],
            # 3. Provins
            ["EST", "TOURNAN", "MARLES", "MORTCERF", "VERNEUIL", "MORMANT", "NANGIS", "LONGUEVILLE", "SAINTE-COLOMBE", "CHAMPBENOIST", "PROVINS"],
            # 4. La Ferté Milon (Navette depuis Meaux)
            ["MEAUX", "TRILPORT", "ISLES", "LIZY", "CROUY", "MAREUIL", "FERTE MILON"]
        ]
    },

    "R": {
        "nom_aller": "⇩ SUD (Montereau / Montargis)",
        "nom_retour": "⇧ PARIS GARE DE LYON",
        "routes": [
            # 1. Montereau via Moret
            ["LYON", "MELUN", "BOIS LE ROI", "FONTAINEBLEAU", "THOMERY", "MORET", "SAINT-MAMMES", "MONTEREAU"],
            # 2. Montargis
            ["LYON", "MELUN", "BOIS LE ROI", "FONTAINEBLEAU", "THOMERY", "MORET", "MONTIGNY", "BOURRON", "NEMOURS", "BAGNEAUX", "SOUPPES", "DORDIVES", "FERRIERES", "MONTARGIS"],
            # 3. Navette Melun-Montereau via Héricy
            ["MELUN", "LIVRY", "CHARTRETTES", "FONTAINE LE PORT", "HERICY", "VULAINES", "CHAMPAGNE", "VERNOU", "PAROISSE", "MONTEREAU"]
        ]
    },

    "U": {
        "nom_aller": "⇩ SUD (La Verrière)",
        "nom_retour": "⇧ NORD (La Défense)",
        "routes": [
            ["DEFENSE", "PUTEAUX", "SURESNES", "CLOUD", "SEVRES", "CHAVILLE", "VERSAILLES CHANTIERS", "CYR", "QUENTIN", "TRAPPES", "VERRIERE"]
        ]
    },

    "V": {
        "nom_aller": "⇦ OUEST (Versailles-Chantiers)",
        "nom_retour": "⇨ EST (Massy-Palaiseau)",
        "routes": [
            ["VERSAILLES CHANTIERS", "PETIT JOUY", "JOUY", "VAUBOYEN", "BIEVRES", "IGNY", "MASSY PALAISEAU"]
        ]
    }
}
