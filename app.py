import streamlit as st
from datetime import datetime, timedelta
import re
import time
import pytz
import os
from PIL import Image
import base64
import json
from streamlit_js_eval import streamlit_js_eval, get_geolocation
import streamlit.components.v1 as components

from utils import get_img_as_base64, normaliser_mode, clean_code_line, format_html_time, get_all_changelogs, analyser_importance_arret, synthetiser_alerte, calculer_direction_relative
from api_idfm import demander_api, demander_lignes_arret, demander_arrets_proches, demander_coordonnees_arret, demander_info_trafic
from settings import APP_NAME, APP_VERSION, APP_CODENAME, APP_SUBTITLE, API_KEY, BASE_URL, HIERARCHIE, GEOGRAPHIE_RER
from sidebar import initialiser_favoris, afficher_sidebar
from ui import afficher_titre_app, afficher_tuto_bienvenue, rendre_installable, appliquer_style_global, afficher_popup_feur, afficher_cheval_express, generer_icones_html, afficher_bandeau_trafic
from moteur_live import afficher_tableau_live
from assistant_ia import ouvrir_assistant

# Initialisation des variables de session
if 'search_key' not in st.session_state:
    st.session_state.search_key = 0

ICONES_TITRE = generer_icones_html()

# ==========================================
#              CONFIGURATION
# ==========================================

try:
    icon_image = Image.open("assets/app_icon.png")
except FileNotFoundError:
    icon_image = "🚆"

# 1. CONFIGURATION
st.set_page_config(
    page_title="Grand Paname",
    page_icon=icon_image,
    layout="wide",
    initial_sidebar_state="collapsed", # 👈 Force la sidebar à être fermée au démarrage
    menu_items={
        'Get Help': None,
        'Report a bug': None,
        'About': None
    } # 👈 Ça supprime le contenu des 3 points !
)

# 2. APPLICATION DU STYLE
appliquer_style_global()
# 3. ACTIVATION DU MODE APPLICATION MOBILE (PWA)
rendre_installable()

# ==========================================
# 🪄 MAGIE : AUTO-FERMETURE DE LA SIDEBAR
# ==========================================
if st.session_state.get('fermer_sidebar', False):
    # On ferme juste la sidebar proprement, sans toucher au scroll !
    streamlit_js_eval(
        js_expressions="window.parent.document.querySelector('[data-testid=\"stSidebar\"] button').click()", 
        key=f"close_sb_{time.time()}"
    )
    st.session_state.fermer_sidebar = False
# ==========================================
#          FONCTIONS UTILITAIRES
# ==========================================
# 1. D'ABORD : La fonction qui lit le fichier (Indispensable qu'elle soit ici)
def get_svg_inline(file_path):
    # Lit le fichier SVG comme du texte pour l'injecter directement
    if not os.path.exists(file_path):
        return None
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            svg_content = f.read()
        
        # Nettoyage : On retire l'entête XML si elle existe pour éviter les bugs d'affichage
        svg_content = re.sub(r'<\?xml.*?\?>', '', svg_content)
        
        # Astuce magique : On force le SVG à utiliser la couleur du texte courant
        # On ajoute une classe pour pouvoir gérer sa taille en CSS
        if '<svg' in svg_content:
            svg_content = svg_content.replace('<svg', '<svg class="mode-icon-inline" fill="currentColor"', 1)
            
        return svg_content
    except Exception as e: 
        return None

# ==========================================
#              INTERFACE GLOBALE
# ==========================================
# --- RECUPERATION DE L'ICONE DU TITRE ---
img_app_b64 = get_img_as_base64("assets/app_icon.png")
if img_app_b64:
    icone_html = f'<img src="data:image/png;base64,{img_app_b64}" style="height: 1em; vertical-align: -0.1em; margin-right: 8px;">'
else:
    icone_html = "<span style='font-size: 1em; vertical-align: middle; margin-right: 8px;'>🚆</span>"

# --- TITRE GÉANT ---
if False: # 👈 Mis de côté au cas où (remplacer par True pour réactiver)
    afficher_titre_app(APP_NAME, APP_VERSION, APP_SUBTITLE, icone_html)

# 🪄 CSS POUR TUER L'ESPACE DES 3 POINTS ET DE LA FLÈCHE
st.markdown("""
    <style>
    header[data-testid="stHeader"] { display: none !important; }
    [data-testid="stToolbar"] { display: none !important; }
    [data-testid="stDecoration"] { display: none !important; }
    footer { display: none !important; }
    section[data-testid="stMain"] { padding-top: 0 !important; }
    section.main { padding-top: 0 !important; }
    .stApp > div:first-child { padding-top: 0 !important; }
    .block-container { padding-top: 0 !important; margin-top: 0 !important; }
    [data-testid="stMainBlockContainer"] { padding-top: 0 !important; }
    </style>
""", unsafe_allow_html=True)

import streamlit.components.v1 as components
components.html("""<script>
(function(){
  var d=window.parent.document;
  function fix(){
    var s=d.querySelector('section[data-testid="stMain"]')||d.querySelector('section.main');
    if(s)s.style.setProperty('padding-top','0','important');
    var b=d.querySelector('[data-testid="stMainBlockContainer"]')||d.querySelector('.block-container');
    if(b)b.style.setProperty('padding-top','0','important');
  }
  fix();
  new window.parent.MutationObserver(fix).observe(d.body,{childList:true,subtree:true,attributes:true});
})();
</script>""", height=0, width=0)

initialiser_favoris()
afficher_sidebar()

# --- GESTION DE LA RECHERCHE ---
if 'selected_stop' not in st.session_state:
    st.session_state.selected_stop = None
    st.session_state.selected_name = None
if 'search_results' not in st.session_state:
    st.session_state.search_results = {}
if 'search_key' not in st.session_state:
    st.session_state.search_key = 0
if 'last_query' not in st.session_state:
    st.session_state.last_query = ""
if 'search_error' not in st.session_state:
    st.session_state.search_error = None

# 🔗 NOUVEAU : LECTURE DE L'URL AU DÉMARRAGE 🔗
if "gare" in st.query_params and st.session_state.selected_stop is None:
    stop_id_url = st.query_params["gare"]
    
    with st.spinner("Chargement de la gare partagée..."):
        # On demande à l'API comment s'appelle cette gare mystère
        data_gare = demander_api(f"stop_areas/{stop_id_url}")
        
        if data_gare and 'stop_areas' in data_gare and len(data_gare['stop_areas']) > 0:
            sa = data_gare['stop_areas'][0]
            nom = sa['name']
            ville = sa.get('administrative_regions', [{}])[0].get('name', '')
            
            # On recrée un joli nom avec la ville
            nom_complet = f"{nom.upper()} ({ville})" if ville else nom.upper()
            
            # On force la sélection
            st.session_state.selected_stop = stop_id_url
            st.session_state.selected_name = nom_complet
            # On n'a pas besoin de rerun, Streamlit va naturellement afficher la gare en descendant le code !
# --- GESTION DE LA RECHERCHE & GÉOLOCALISATION ---
if 'geoloc_active' not in st.session_state:
    st.session_state.geoloc_active = False

# 1. LA BARRE DE RECHERCHE ET LE BOUTON GÉOLOC (Version Natif)
search_query = ""
submitted = False
geo_clicked = False

if False: # 👈 Mis de côté au cas où
    with st.form("search_form"):
        search_query = st.text_input(
            "🔍 Rechercher un arrêt :", 
            placeholder="Ex: Noisiel, Saint-Lazare...",
            value=st.session_state.last_query, 
            key=f"search_input_{st.session_state.search_key}"
        )
        col_submit, col_geo = st.columns([0.65, 0.35], gap="small")
        with col_submit:
            submitted = st.form_submit_button("Rechercher", use_container_width=True)
        with col_geo:
            geo_clicked = st.form_submit_button("📍 Me localiser", use_container_width=True)

# Si le bouton "Me localiser" est cliqué, on active le mode géoloc
if geo_clicked:
    st.session_state.geoloc_active = True

# 2. LOGIQUE DE GÉOLOCALISATION (Via l'URL de l'App Mobile)
# On récupère les paramètres de l'adresse URL
parametres = st.query_params

# ========================================================
# 🚀 INTERCEPTION DE LA BARRE DE RECHERCHE NATIVE ANDROID
# ========================================================
parametres = st.query_params

if "selectionned_stop_id" in parametres and "selectionned_stop_name" in parametres:
    # On injecte les données directement dans tes vraies variables
    stop_id = parametres["selectionned_stop_id"]
    st.session_state.selected_stop = stop_id
    st.session_state.selected_name = parametres["selectionned_stop_name"]

    # On nettoie l'adresse URL pour éviter les boucles de rechargement
    st.query_params.clear()
    st.query_params["gare"] = stop_id  # persiste pour les rechargements

    # On relance le moteur pour que le bloc ci-dessous capte la sélection
    st.rerun()

# Si l'app native a rechargé la page avec les coordonnées dans l'adresse
if "lat" in parametres and "lon" in parametres:
    lat = float(parametres["lat"])
    lon = float(parametres["lon"])
    
    with st.spinner("Recherche des arrêts à proximité..."):
        data_proches = demander_arrets_proches(lat, lon, rayon=1500)
    
    resultats_bruts = []
    if data_proches and 'places_nearby' in data_proches:
        for p in data_proches['places_nearby']:
            if 'stop_area' in p:
                sa = p['stop_area']
                nom = sa['name']
                ville = sa.get('administrative_regions', [{}])[0].get('name', '')
                distance = int(p.get('distance', 0))
                rang, _ = analyser_importance_arret(sa)
                
                label = f"{nom} ({ville}) - à {distance}m" if ville else f"{nom} - à {distance}m"
                
                resultats_bruts.append({
                    'label': label,
                    'id': sa['id'],
                    'rang': rang,
                    'distance': distance
                })
    
    if resultats_bruts:
        resultats_bruts.sort(key=lambda x: x['distance'])
        gares_lourdes = [r for r in resultats_bruts if r['rang'] <= 3][:10]
        arrets_legers = [r for r in resultats_bruts if r['rang'] > 3][:10]
        
        opts = {}
        for r in gares_lourdes:
            opts[f"🚇 {r['label']}"] = r['id']
        for r in arrets_legers:
            opts[f"🚌 {r['label']}"] = r['id']
        
        st.session_state.search_results = opts
        
        st.query_params.clear()
        st.rerun() # 🚀 ON REMET LE MOTEUR EN ROUTE ICI !
    else:
        st.warning("⚠️ Aucune gare trouvée dans un rayon de 1,5km.")
        st.query_params.clear()

# Si tu viens juste de cliquer sur le bouton (avant que l'app native recharge la page)
elif geo_clicked:
    st.info("🛰️ Cible verrouillée, demande des coordonnées au téléphone...")

if submitted and search_query:
    # --- 1. FERMETURE DU CLAVIER MOBILE (Le retour !) ---
    # Cette commande JS enlève le focus du champ texte, ce qui ferme le clavier Android/iOS
    streamlit_js_eval(js_expressions="document.activeElement.blur()", key=f"blur_{time.time()}")

    # --- SUITE DU CODE EXISTANT ---
    st.session_state.last_query = search_query 
    st.session_state.search_error = None

    # --- 🥚 DEBUT EASTER EGG : QUOI-FEUR (MODE DIALOGUE) 🥚 ---
    trigger_word = re.sub(r'[^\w\s]', '', search_query.lower().strip())
    # ...
    
    if trigger_word in ["quoi", "feur", "coiffure"]:
        # On appelle la fonction décorée avec @st.dialog
        afficher_popup_feur(trigger_word)
        
        # On arrête le script ici pour ne pas lancer la recherche API derrière
        st.stop()
    # --- FIN EASTER EGG ---

    with st.spinner("Recherche des arrêts..."):
        data = demander_api(f"places?q={search_query}")
        resultats_bruts = []
        
        if data and 'places' in data:
            for p in data['places']:
                if 'stop_area' in p:
                    sa = p['stop_area']
                    nom = sa['name']
                    ville = sa.get('administrative_regions', [{}])[0].get('name', '')
                    # 🔢 LA CORRECTION EST ICI : On force en "int" (nombre entier)
                    distance = int(p.get('distance', 0))
                    
                    # ✨ L'analyse magique
                    rang, _ = analyser_importance_arret(sa)
                    
                    # On garde le nom normal, sans forcer les majuscules
                    nom_affiche = nom
                    
                    label = f"{nom_affiche} ({ville})" if ville else f"{nom_affiche}"
                    
                    resultats_bruts.append({
                        'label': label,
                        'id': sa['id'],
                        'rang': rang
                    })
        
        if resultats_bruts:
            # ✨ On laisse l'API Navitia faire son tri textuel naturel (pertinence > hiérarchie)
            opts = {r['label']: r['id'] for r in resultats_bruts}
            st.session_state.search_results = opts
        else:
            st.session_state.search_results = {}
            st.session_state.search_error = "⚠️ Aucun résultat trouvé. Essayez un autre nom."
    st.session_state.search_key += 1
    st.rerun()

# 4. AFFICHAGE DES RÉSULTATS (Valable pour recherche ET géoloc)
if st.session_state.search_results:
    opts = st.session_state.search_results
    
    if False: # 👈 Mis de côté au cas où
        choice = st.selectbox("Résultats trouvés :", list(opts.keys()))
        
        if choice and opts.get(choice) is not None:
            stop_id = opts[choice]
            if st.session_state.selected_stop != stop_id:
                st.session_state.selected_stop = stop_id
                nom_propre = choice.replace("🚇 ", "").replace("🚌 ", "")
                st.session_state.selected_name = nom_propre
                st.query_params["gare"] = stop_id
                st.rerun()

# ========================================================
#           AFFICHAGE LIVE OU ACCUEIL (TUTO)
# ========================================================

# 1. Si une gare est sélectionnée -> On affiche le tableau de bord
if st.session_state.selected_stop:
    if st.query_params.get("gare") != st.session_state.selected_stop:
        st.query_params["gare"] = st.session_state.selected_stop
    afficher_tableau_live(st.session_state.selected_stop, st.session_state.selected_name)

# 2. Sinon -> Tuto de Bienvenue (Construction sécurisée & Couleurs dynamiques)
elif not st.session_state.search_results:
    afficher_tuto_bienvenue()

# ==========================================
# 🐾 LA BULLE FLOTTANTE DE PANA (AVEC IMAGE !)
# ==========================================

# 1. On récupère ton image (assure-toi d'avoir une image carrée comme "pana.png" ou utilise ton app_icon)
img_pana_b64 = get_img_as_base64("assets/pana_icon.png") # Tu peux changer le nom du fichier ici !

# 2. On prépare le bout de CSS selon si l'image a été trouvée ou non
if img_pana_b64:
    fond_css = f"""
        background-image: url('data:image/png;base64,{img_pana_b64}') !important;
        background-size: cover !important;
        background-position: center !important;
        background-color: transparent !important;
        color: transparent !important; /* Cache le texte du bouton */
    """
else:
    # Plan B de secours si l'image n'est pas trouvée
    fond_css = """
        background-color: #ff9f43 !important;
        color: white !important;
    """

# 3. L'injection du style CSS
st.markdown(
    f"""
    <style>
    button[kind="primary"] {{
        position: fixed !important;
        bottom: 40px !important;
        right: 40px !important;
        width: 65px !important;
        height: 65px !important;
        border-radius: 50% !important;
        {fond_css}
        border: none !important;
        box-shadow: 0 4px 15px rgba(255, 159, 67, 0.4) !important;
        z-index: 9999 !important;
        transition: all 0.3s ease !important;
    }}
    
    button[kind="primary"]:hover {{
        transform: scale(1.1) !important;
        box-shadow: 0 6px 20px rgba(255, 159, 67, 0.6) !important;
    }}
    </style>
    """,
    unsafe_allow_html=True
)

# 4. Le bouton isolé dans un fragment pour éviter de recharger la page entière !
@st.fragment
def afficher_bouton_pana():
    if st.button(" ", type="primary", help="Discuter avec Pana"):
        ouvrir_assistant()

afficher_bouton_pana()
