import streamlit as st
import os
import base64
import json
import re
from utils import get_img_as_base64
import datetime as dt
import random
from utils import get_img_as_base64, get_svg_inline, nettoyer_texte_details, determiner_type_perturbation
from api_idfm import demander_info_trafic
import streamlit.components.v1 as components

def afficher_titre_app(app_name, app_version, app_subtitle, icone_html):
    """Affiche le grand titre principal et injecte le mini-titre aligné à gauche."""
    
    # 🎨 1. LE CSS DU GRAND TITRE
    st.markdown("""
    <style>
    .titre-geant-custom {
        font-size: clamp(2rem, 11.5vw, 4rem) !important;
        font-weight: 900 !important;
        margin: 0 !important;
        padding: 0 !important;
        line-height: 1.1 !important;
        letter-spacing: -1.5px !important;
        display: flex !important;
        align-items: center !important;
        flex-wrap: wrap !important; 
        white-space: normal !important; 
    }
    .badge-geant-custom {
        font-size: clamp(0.9rem, 4vw, 1.1rem) !important;
        padding: 4px 12px !important;
        display: inline-block !important;
    }
    .sous-titre-geant-custom {
        color: #aaa !important;
        font-style: italic !important;
        font-size: clamp(1rem, 4vw, 1.15rem) !important;
    }
    </style>
    """, unsafe_allow_html=True)

    # 🧱 2. LE HTML (Grand titre + Modèle caché)
    st.markdown(f"""
    <div id="mini-header-template" style="display: none;">
        {icone_html} <span style="margin-left: 8px;">{app_name}</span>
    </div>

    <div id="titre-geant-container" style="margin-top: 10px; margin-bottom: 25px; text-align: left;">
        <div class="titre-geant-custom">
            {icone_html}<span>{app_name}</span>
        </div>
        <div style="margin-top: 12px; display: flex; align-items: center; flex-wrap: wrap; gap: 12px;">
            <span class='version-badge badge-geant-custom'>{app_version}</span>
            <span class="sous-titre-geant-custom">{app_subtitle}</span>
        </div>
    </div>
    """, unsafe_allow_html=True)
    
    # 🧠 3. LE SCRIPT ANTI-FANTÔMES 👻
    js_code = """
    <script>
    if(window.parent.gpMiniInterval) {
        clearInterval(window.parent.gpMiniInterval);
    }
    
    window.parent.gpMiniInterval = setInterval(() => {
        const d = window.parent.document;
        const h = d.querySelector('header[data-testid="stHeader"]');
        
        // 🪄 ASTUCE PRO : On prend toujours le DERNIER élément généré pour ignorer les fantômes de Streamlit
        const bList = d.querySelectorAll('#titre-geant-container');
        const b = bList.length > 0 ? bList[bList.length - 1] : null;
        
        let m = d.getElementById('gp-native-mini-header');
        
        if(h) {
            // Création de la coquille vide dans l'en-tête s'il n'existe pas
            if(!m) {
                m = d.createElement('div');
                m.id = 'gp-native-mini-header';
                m.style.cssText = 'position:absolute;left:60px;top:50%;transform:translateY(-80%);opacity:0;transition:all 0.3s cubic-bezier(0.2,0.8,0.2,1);display:flex;align-items:center;font-family:"Grand Paris",sans-serif;font-weight:900;font-size:1.6rem;color:var(--text-color);pointer-events:none;white-space:nowrap;text-shadow:0 2px 10px rgba(0,0,0,0.3);';
                h.appendChild(m);
            }
            
            // Mise à jour du contenu (Au cas où Streamlit aurait changé le modèle)
            const tList = d.querySelectorAll('#mini-header-template');
            const t = tList.length > 0 ? tList[tList.length - 1] : null;
            if(t && m.innerHTML !== t.innerHTML) {
                m.innerHTML = t.innerHTML;
            }
            
            // Logique d'affichage basée sur la position exacte
            if(m && b) {
                const rect = b.getBoundingClientRect();
                // 🎯 Dès que le BAS du grand titre passe sous les 70px (il entre dans le flou)
                if(rect.bottom < 70) {
                    m.style.opacity = '1';
                    m.style.transform = 'translateY(-50%)'; 
                } else {
                    m.style.opacity = '0';
                    m.style.transform = 'translateY(-80%)'; 
                }
            }
        }
    }, 100);
    </script>
    """
    import streamlit.components.v1 as components
    components.html(js_code, height=0, width=0)
    
def afficher_tuto_bienvenue():
    """Affiche les 3 cartes de tutoriel sur la page d'accueil."""
    html_content = "".join([
        '<div style="text-align: center; margin-top: 40px; margin-bottom: 40px; animation: float 3s ease-in-out infinite;">',
            '<span style="font-size: 50px;">👋</span>',
        '</div>',
        '<div style="text-align: center; margin-bottom: 30px;">',
            '<h3 style="color: var(--text-color); margin-bottom: 10px;">Bienvenue sur Grand Paname</h3>',
            '<p style="font-size: 1.1em; opacity: 0.8; color: var(--text-color);">Votre compagnon de voyage en Île-de-France.</p>',
        '</div>',
        '<div style="display: flex; flex-wrap: wrap; gap: 15px; justify-content: center; width: 100%;">',
            # CARTE 1
            '<div class="tuto-card">',
                '<div style="font-size: 24px; margin-bottom: 10px;">🔍</div>',
                '<div style="font-weight: bold; color: var(--text-color); margin-bottom: 5px;">Recherchez</div>',
                '<div style="font-size: 0.9em; opacity: 0.7; color: var(--text-color);">Entrez le nom de votre arrêt et sélectionnez-le dans la liste déroulante</div>',
            '</div>',
            # CARTE 2
            '<div class="tuto-card">',
                '<div style="font-size: 24px; margin-bottom: 10px;">⚡</div>',
                '<div style="font-weight: bold; color: var(--text-color); margin-bottom: 5px;">Temps Réel</div>',
                '<div style="font-size: 0.9em; opacity: 0.7; color: var(--text-color);">Vos prochains départs et votre info trafic sont actualisés en temps réel</div>',
            '</div>',
            # CARTE 3
            '<div class="tuto-card">',
                '<div style="font-size: 24px; margin-bottom: 10px;">⭐</div>',
                '<div style="font-weight: bold; color: var(--text-color); margin-bottom: 5px;">Favoris</div>',
                '<div style="font-size: 0.9em; opacity: 0.7; color: var(--text-color);">Cliquez sur l\'étoile pour sauvegarder votre arrêt et le retrouver lors de votre prochain trajet</div>',
            '</div>',
        '</div>'
    ])
    st.markdown(html_content, unsafe_allow_html=True)

def afficher_testeur_de_glassmorphism():
    """Un laboratoire intégré avec un VRAI fond pour voir le flou et le code CSS exact."""
    st.divider()
    st.subheader("🧪 Banc d'Essai : Couleurs & Glassmorphism")
    
    col_c, col_v = st.columns([0.4, 0.6])
    
    with col_c:
        st.write("**Réglages CSS :**")
        var_fond = st.selectbox(
            "Variable de fond :",
            ["--background-color", "--secondary-background-color"],
            help="Les variables que Streamlit change selon le thème."
        )
        
        alpha = st.slider("Opacité (Alpha) :", 0.0, 1.0, 0.5) 
        blur = st.slider("Flou (Blur) :", 0, 30, 15)
        
        texte_custom = st.text_input("Texte de test :", "C'est lisible ?")

    with col_v:
        # Le vrai code CSS qu'on va générer et afficher
        pourcentage = int(alpha * 100)
        code_css_valide = f"""background: color-mix(in srgb, var({var_fond}) {pourcentage}%, transparent) !important;
backdrop-filter: blur({blur}px) !important;
-webkit-backdrop-filter: blur({blur}px) !important;"""

        css_preview = f"""
        <div style="
            background: linear-gradient(45deg, #4158D0 0%, #C850C0 46%, #FFCC70 100%);
            padding: 40px;
            border-radius: 20px;
            box-shadow: inset 0 0 20px rgba(0,0,0,0.2);
            display: flex;
            justify-content: center;
            align-items: center;
        ">
            <div style="
                background: color-mix(in srgb, var({var_fond}) {pourcentage}%, transparent);
                backdrop-filter: blur({blur}px);
                -webkit-backdrop-filter: blur({blur}px);
                border: 1px solid color-mix(in srgb, var(--text-color) 20%, transparent);
                border-radius: 20px;
                padding: 40px;
                text-align: center;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                width: 100%;
            ">
                <h2 style="color: var(--text-color); margin-bottom: 10px; font-weight: 800;">Aperçu Réel</h2>
                <p style="color: var(--text-color); font-size: 1.2em; font-weight: bold;">
                    {texte_custom}
                </p>
                
                <div style="margin-top: 25px; text-align: left; background: rgba(0,0,0,0.4); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                    <div style="font-size: 0.7em; color: #aaa; margin-bottom: 5px; text-transform: uppercase; font-weight: bold;">Code CSS à copier :</div>
                    <pre style="margin: 0; padding: 0; background: transparent; border: none; overflow-x: auto;">
<code style="color: #4ade80; font-family: monospace; font-size: 0.85em; white-space: pre-wrap;">{code_css_valide}</code>
                    </pre>
                </div>

            </div>
        </div>
        """
        st.markdown(css_preview, unsafe_allow_html=True)
    
    st.info("""
    💡 **Astuce :** Trouve le réglage parfait où le texte reste lisible en mode **Clair ET Sombre**, puis copie le code vert directement dans tes fichiers `style.py` ou `assistant_ia.py` !
    """)

def charger_police_locale(file_path, font_name):
    if not os.path.exists(file_path):
        return
    try:
        with open(file_path, "rb") as f:
            data = f.read()
        b64 = base64.b64encode(data).decode()
        ext = file_path.split('.')[-1].lower()
        format_str = "opentype" if ext == "otf" else "truetype"
        # ICI : Le CSS pour déclarer la police (avec les doubles accolades {{ }})
        css = f"""
            <style>
            @font-face {{
                font-family: '{font_name}';
                src: url('data:font/{ext};base64,{b64}') format('{format_str}');
            }}
            html, body, [class*="css"] {{ font-family: '{font_name}', sans-serif; }}
            h1, h2, h3, h4, h5, h6, p, a, li, button, input, label, textarea, div, td, th {{
                font-family: '{font_name}', sans-serif !important;
            }}
            .station-title, .rail-dest, .bus-dest, .version-badge, .last-dep-label {{
                font-family: '{font_name}', sans-serif !important;
            }}
            .stMarkdown, .stButton, .stTextInput, .stSelectbox, .stExpander {{
                font-family: '{font_name}', sans-serif !important;
            }}
            button[data-testid="stSidebarCollapsedControl"] *,
            button[data-testid="stSidebarExpandedControl"] * {{
                font-family: "Material Symbols Rounded", sans-serif !important;
                font-weight: normal !important; font-style: normal !important;
                letter-spacing: normal !important; text-transform: none !important;
                white-space: nowrap !important; direction: ltr !important;
            }}
            </style>
        """
        st.markdown(css, unsafe_allow_html=True)
    except Exception:
        pass

def appliquer_style_global():
    # 1. On charge la police
    charger_police_locale("assets/GrandParis.otf", "Grand Paris")
    
    # 2. On injecte tout le CSS (sans f-string, donc sans risque de crash)
    st.markdown("""
    <style>
        /* --- CSS NINJA : VERSION SÉCURISÉE --- */
        div[data-testid="InputInstructions"] { display: none !important; }
        
        /* On cache les boutons "Deploy", "Share" et le menu "trois points" sans toucher au bouton Sidebar */
        [data-testid="stHeaderAction"], 
        #MainMenu { 
            display: none !important; 
        }
        
        /* 🪄 EFFET GLASSMORPHISM PROGRESSIF SUR L'EN-TÊTE (Version Douce) */
        header[data-testid="stHeader"] { 
            background: color-mix(in srgb, var(--background-color) 50%, transparent) !important;
            backdrop-filter: blur(12px) !important; /* Un flou un peu moins agressif */
            -webkit-backdrop-filter: blur(12px) !important;
            
            /* 🪄 On commence à dissiper le flou dès 40% de la hauteur pour un fondu parfait */
            -webkit-mask-image: linear-gradient(to bottom, black 40%, transparent 100%) !important;
            mask-image: linear-gradient(to bottom, black 40%, transparent 100%) !important;
            
            box-shadow: none !important;
            border-bottom: none !important;
        }
        
        /* On garde le reste des optimisations de fluidité */
        div[data-testid="stFragment"] { opacity: 1 !important; transform: none !important; transition: none !important; filter: none !important; }
        div.element-container { opacity: 1 !important; filter: none !important; }
        div[data-testid="stSpinner"] { display: none !important; }
        
        /* ------------------------------------------- */
        /* ✨ NOUVEAU : BORDS ARRONDIS SUR LA CARTE  */
        /* ------------------------------------------- */
        [data-testid="stDeckGlJsonChart"], 
        [data-testid="stDeckGlJsonChart"] > div,
        [data-testid="stDeckGlJsonChart"] canvas {
            border-radius: 12px !important;
            overflow: hidden !important;
            border: 1px solid rgba(128, 128, 128, 0.2) !important;
            pointer-events: none !important;
        }
        /* ------------------------------------------- */

        /* Animation Clignotement (Blink) */
        @keyframes blink-live { 0% { opacity: 1; } 50% { opacity: 0; } 100% { opacity: 1; } }
        .live-icon { display: inline-block; animation: blink-live 1.5s infinite step-start; margin: 0 4px; vertical-align: middle; font-size: 0.6em; }
        @keyframes blinker { 50% { opacity: 0; } }
        .blink { animation: blinker 1s linear infinite; font-weight: bold; }
        @keyframes yellow-pulse { 0% { border-color: #f1c40f; box-shadow: 0 0 5px rgba(241, 196, 15, 0.2); } 50% { border-color: #fff; box-shadow: 0 0 15px rgba(241, 196, 15, 0.6); } 100% { border-color: #f1c40f; box-shadow: 0 0 5px rgba(241, 196, 15, 0.2); } }
        @keyframes float { 0% { transform: translateY(0px); } 50% { transform: translateY(-6px); } 100% { transform: translateY(0px); } } 
        .cable-icon { display: inline-block; animation: float 3s ease-in-out infinite; }

        h1 { display: flex !important; align-items: center !important; flex-wrap: wrap !important; gap: 15px !important; margin-bottom: 0.5rem !important; font-size: 3.5rem !important; line-height: 1.1 !important; }
        .custom-loader { border: 2px solid rgba(255, 255, 255, 0.1); border-left-color: #3498db; border-radius: 50%; width: 14px; height: 14px; animation: spin 1s linear infinite; display: inline-block; vertical-align: middle; margin-right: 8px; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

        .text-red { color: #e74c3c; font-weight: bold; }
        .text-orange { color: #f39c12; font-weight: bold; }
        .text-green { color: #2ecc71; font-weight: bold; }
        .text-blue { color: #3498db; font-weight: bold; }
        
        .line-badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-weight: 900; color: white; text-align: center; min-width: 35px; margin-right: 12px; font-size: 16px; text-shadow: 0px 1px 2px rgba(0,0,0,0.3); box-shadow: 0 2px 4px rgba(0,0,0,0.2); flex-shrink: 0; }
        .footer-container { display: flex; align-items: center; margin-bottom: 8px; }
        .footer-icon { display: inline-flex !important; align-items: center !important; flex-shrink: 0 !important; margin-right: 10px; font-size: 14px; color: var(--text-color); opacity: 0.7; white-space: nowrap !important; }
        .footer-badge { font-size: 12px !important; padding: 2px 8px !important; min-width: 30px !important; margin-right: 5px !important; }
        .time-sep { color: #888; margin: 0 8px; font-weight: lighter; }
        
        .section-header { display: flex !important; align-items: center !important; margin-top: 25px; margin-bottom: 15px; padding-bottom: 8px; border-bottom: 2px solid rgba(128, 128, 128, 0.5); font-size: 20px; font-weight: bold; color: var(--text-color); letter-spacing: 1px; }
        
        /* ✨ 1. LE TITRE DE LA STATION (Dégradé Bleu comme avant) ✨ */
        .station-title { 
            font-size: 24px !important; 
            font-weight: 800 !important; 
            color: #ffffff !important; 
            text-align: center; 
            margin: 10px 0 20px 0; 
            text-transform: uppercase; 
            background: linear-gradient(90deg, #1e3c72 0%, #2a5298 100%) !important; 
            border: 1px solid rgba(255, 255, 255, 0.2) !important; 
            padding: 14px !important; 
            border-radius: 12px !important; 
            box-shadow: 0 8px 25px rgba(0,0,0,0.4) !important; 
        }
        
        .last-dep-box { border: 2px solid #f1c40f; border-radius: 10px; padding: 8px 10px; margin-top: 8px; margin-bottom: 8px; background-color: rgba(241, 196, 15, 0.1); animation: yellow-pulse 2s infinite; }
        .last-dep-label { display: block; font-size: 0.75em; text-transform: uppercase; font-weight: bold; color: #f1c40f; margin-bottom: 4px; letter-spacing: 1px; }
        .last-dep-box .rail-row, .last-dep-box .bus-row { border-top: none !important; padding-top: 0 !important; margin-top: 0 !important; }
        .last-dep-small-frame { border: 1px solid #f1c40f; border-radius: 4px; padding: 1px 5px; color: #f1c40f; font-weight: bold; }
        .last-dep-text-only { color: #f1c40f; font-weight: bold; }

        .version-badge { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 4px 12px; border-radius: 20px; font-size: 0.4em; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); margin-left: 0 !important; }
        .verified-badge { color: #3498db; font-size: 0.8em; margin-left: 5px; }

        @media (max-width: 480px) {
            .block-container { padding-top: 1rem !important; }
            .station-title, .station-title-pole { font-size: 20px; }
            h1 { font-size: 35px !important; gap: 10px !important; margin-top: 0 !important; }
            .version-badge { font-size: 0.45em !important; }
            .bus-row { flex-direction: column !important; align-items: flex-start !important; padding-top: 10px !important; padding-bottom: 10px !important; }
            .bus-dest { width: 100% !important; white-space: normal !important; margin-bottom: 6px !important; font-size: 16px !important; margin-right: 0 !important; }
            .bus-row > span:last-child { width: 100% !important; text-align: left !important; font-size: 0.9em !important; color: #ccc !important; }
            .rail-row { padding-top: 8px !important; padding-bottom: 8px !important; }
            .rail-dest { max-width: 65% !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }
            .time-sep { display: inline-block !important; margin: 0 5px !important; color: #666 !important; font-weight: lighter !important; }
        }
        
        div[data-testid="column"] { display: flex; align-items: center; }
        div[data-testid="column"] button { border: none; background: transparent; font-size: 1.5rem; padding: 0; }
        div[data-testid="column"] button:hover { color: #f1c40f; border: none; background: transparent; }
        
        .replacement-box { border: 2px dashed #e74c3c; border-radius: 10px; padding: 8px 10px; margin-top: 8px; margin-bottom: 8px; background-color: rgba(231, 76, 60, 0.1); }
        .replacement-label { display: block; font-size: 0.75em; text-transform: uppercase; font-weight: bold; color: #e74c3c; margin-bottom: 4px; letter-spacing: 1px; }
        .replacement-box .rail-row, .replacement-box .bus-row { border-top: none !important; padding-top: 0 !important; margin-top: 0 !important; }
        
        /* ============================================================== */
        /* ✨ CSS ICONES INLINE (100% NATIF & INCASSABLE) ✨              */
        /* ============================================================== */
        svg.mode-icon-inline,
        div[class^="sticky-glass-"] svg {
            height: 1.5em !important;
            width: auto !important;
            vertical-align: middle !important;
            color: var(--text-color) !important; /* L'icône prend la couleur de base du texte */
        }

        /* 🪄 L'ASTUCE : currentColor force le dessin à copier la couleur du texte (sans bug de variable !) */
        svg.mode-icon-inline path, 
        svg.mode-icon-inline rect,
        svg.mode-icon-inline circle,
        svg.mode-icon-inline polygon,
        div[class^="sticky-glass-"] svg path,
        div[class^="sticky-glass-"] svg rect,
        div[class^="sticky-glass-"] svg circle,
        div[class^="sticky-glass-"] svg polygon {
            fill: currentColor !important;
        }

        .fav-btn-container { width: 100%; }
        .fav-btn-container button { background-color: rgba(255, 255, 255, 0.05) !important; border: 1px solid rgba(255, 255, 255, 0.2) !important; color: #f1c40f !important; font-size: 16px !important; font-weight: 600 !important; height: 45px !important; border-radius: 8px !important; transition: background-color 0.2s, transform 0.1s !important; }
        .fav-btn-container button:hover { background-color: rgba(241, 196, 15, 0.15) !important; border-color: #f1c40f !important; }
        div[data-testid="column"]:has(.fav-btn-container) { display: flex; align-items: center; justify-content: flex-end; }
        
        div[data-testid="InputInstructions"], [data-testid="stHeaderAction"], .stApp > header { display: none !important; }
        iframe[title="streamlit_js_eval.streamlit_js_eval"], div:has(> iframe[title="streamlit_js_eval.streamlit_js_eval"]) { display: none !important; height: 0 !important; }

        [data-testid="stSidebar"] [data-testid="stVerticalBlock"] > [data-testid="stHorizontalBlock"]:not(:has([data-testid="stVerticalBlockBorderWrapper"])) { flex-direction: row !important; flex-wrap: nowrap !important; align-items: center !important; gap: 5px !important; width: 100% !important; }
        [data-testid="stSidebar"] [data-testid="stVerticalBlock"] > [data-testid="stHorizontalBlock"]:not(:has([data-testid="stVerticalBlockBorderWrapper"])) > [data-testid="column"]:first-child { flex: 1 1 auto !important; width: auto !important; min-width: 0px !important; overflow: hidden !important; }
        [data-testid="stSidebar"] [data-testid="stVerticalBlock"] > [data-testid="stHorizontalBlock"]:not(:has([data-testid="stVerticalBlockBorderWrapper"])) > [data-testid="column"]:last-child { flex: 0 0 42px !important; width: 42px !important; min-width: 42px !important; max-width: 42px !important; }
        button[key^="btn_fav_"] { width: 100% !important; height: 42px !important; text-align: left !important; padding-left: 10px !important; }
        button[key^="btn_fav_"] p, button[key^="btn_fav_"] div { white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; display: block !important; width: 100% !important; }
        button[key^="del_fav_"] { width: 100% !important; height: 42px !important; padding: 0 !important; margin: 0 !important; border: 1px solid rgba(231, 76, 60, 0.3) !important; background: rgba(231, 76, 60, 0.1) !important; display: flex !important; align-items: center !important; justify-content: center !important; }

        .traffic-ticker { overflow: hidden; white-space: nowrap; background: rgba(231, 76, 60, 0.1); border-radius: 8px; padding: 4px 0; margin-top: 4px; border-left: 3px solid #e74c3c; }
        .ticker-text { display: inline-block; padding-left: 100%; animation: ticker 20s linear infinite; color: #e74c3c; font-weight: bold; font-style: italic; font-size: 0.85em; }
        @keyframes ticker { 0% { transform: translate3d(0, 0, 0); } 100% { transform: translate3d(-100%, 0, 0); } }

        /* ⚠️ STYLE PERTURBÉ : Limite de taille et Scrollbar (RER D) */
        .traffic-warning { 
            color: #f39c12; font-size: 0.8em; font-weight: 500; margin-top: 2px; 
            display: block !important; /* Indispensable pour que le scroll fonctionne ! */
            max-height: 60px !important; 
            overflow-y: auto !important; 
            padding-right: 5px;
        }
        
        .traffic-warning::-webkit-scrollbar { width: 4px; }
        .traffic-warning::-webkit-scrollbar-thumb { 
            background: rgba(128, 128, 128, 0.4); 
            border-radius: 4px; 
        }

        .tuto-card { background-color: var(--secondary-background-color); border: 1px solid rgba(128, 128, 128, 0.2); border-radius: 12px; padding: 20px; flex: 1; min-width: 200px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.05); transition: all 0.3s ease !important; }
        .tuto-card:hover { transform: translateY(-8px) !important; box-shadow: 0 12px 25px rgba(52, 152, 219, 0.3) !important; border: 1px solid rgba(52, 152, 219, 0.8) !important; background-color: rgba(52, 152, 219, 0.1) !important; cursor: pointer !important; }
        
        /* ✨ 2. LES CARTES DE DÉPART (Ombres Colorées "Glow") ✨ */
        .bus-card, .rail-card { 
            background-color: var(--secondary-background-color) !important; 
            padding: 14px !important; 
            margin-bottom: 18px !important; 
            border-radius: 14px !important; 
            
            border-left-width: 6px !important; 
            border-left-style: solid !important; 
            border-top: none !important;
            border-right: none !important;
            border-bottom: none !important;
            
            color: var(--text-color) !important; 
            
            box-shadow: 0 8px 20px color-mix(in srgb, var(--line-color, var(--text-color)) 20%, transparent), 
                        0 4px 8px color-mix(in srgb, var(--line-color, var(--text-color)) 15%, transparent) !important;
            
            transition: transform 0.2s ease, box-shadow 0.2s ease !important;
        }

        .bus-card:active, .rail-card:active { transform: scale(0.98); }

        .bus-dest, .rail-dest { color: var(--text-color) !important; opacity: 0.95; font-size: 15px; font-weight: 600 !important; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 10px; flex: 1; }
        /* 📏 Lignes de séparation classiques et espacement compact d'origine */
        .bus-row, .rail-row { 
            display: flex; justify-content: space-between; align-items: center; 
            padding-top: 8px !important; padding-bottom: 2px !important; 
            border-top: 1px solid rgba(128, 128, 128, 0.25) !important; 
            border-bottom: none !important;
        }
        .bus-row > span:last-child, .rail-row > span:last-child { 
            color: var(--text-color) !important; font-weight: 500; white-space: nowrap; flex-shrink: 0; text-align: right; 
        }        
        .rer-direction { margin-top: 12px; font-size: 13px; font-weight: bold; color: #3498db !important; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid color-mix(in srgb, var(--text-color) 15%, transparent) !important; padding-bottom: 4px; margin-bottom: 0px; }
        
        .service-box { text-align: left; padding: 10px 12px; color: color-mix(in srgb, var(--text-color) 70%, transparent); font-style: italic; font-size: 0.95em; background: color-mix(in srgb, var(--text-color) 5%, transparent); border-radius: 8px; margin-top: 5px; margin-bottom: 5px; border-left: 3px solid color-mix(in srgb, var(--text-color) 20%, transparent); }
        .service-end { color: color-mix(in srgb, var(--text-color) 50%, transparent); font-style: italic; font-size: 0.9em; }
        .time-sep { color: color-mix(in srgb, var(--text-color) 40%, transparent); margin: 0 8px; font-weight: lighter; }

        /* ✨ HIGHLIGHT DES DATES POUR PANA (Encadrés Stylisés) ✨ */
        [data-testid="stChatMessageContent"] code {
            background-color: color-mix(in srgb, #f39c12 15%, transparent) !important;
            color: #d35400 !important; /* Orange foncé pour le mode clair */
            border: 1px solid color-mix(in srgb, #f39c12 40%, transparent) !important;
            padding: 2px 8px !important;
            border-radius: 6px !important;
            font-weight: 800 !important;
            font-size: 0.9em !important;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05) !important;
        }

        /* Adaptation de l'encadré pour le mode sombre ! */
        [data-paname-theme="dark"] [data-testid="stChatMessageContent"] code {
            color: #f1c40f !important; /* Jaune éclatant dans l'obscurité */
            background-color: color-mix(in srgb, #f1c40f 15%, transparent) !important;
            border: 1px solid color-mix(in srgb, #f1c40f 30%, transparent) !important;
        }
        /* 🪄 STYLE MAGIQUE POUR LE BOUTON SUIVRE/SUIVI (JAUNE DORÉ) */
        div[data-testid="stElementContainer"]:has(.marker-suivre-btn) + div[data-testid="stElementContainer"] button {
            border: 1px solid rgba(241, 196, 15, 0.4) !important;
            background-color: rgba(241, 196, 15, 0.1) !important;
            color: #f1c40f !important; /* Jaune doré */
            font-weight: 600 !important;
            transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) !important;
        }
        
        div[data-testid="stElementContainer"]:has(.marker-suivre-btn) + div[data-testid="stElementContainer"] button:hover {
            background-color: rgba(241, 196, 15, 0.15) !important;
            border: 1px solid rgba(241, 196, 15, 0.8) !important;
            transform: translateY(-4px) !important; /* Le petit saut ! */
            box-shadow: 0 8px 20px rgba(241, 196, 15, 0.3) !important; /* L'ombre jaune */
            color: #f39c12 !important; /* Un jaune légèrement plus vif au survol */
        }
        
    </style>
    """, unsafe_allow_html=True)

def rendre_installable():
    # 1. On récupère ton icône
    icon_b64 = get_img_as_base64("app_icon.png")
    if not icon_b64:
        return
        
    icon_data_uri = f"data:image/png;base64,{icon_b64}"

    # 2. Le Manifest compressé
    manifest = {
        "name": "Grand Paname",
        "short_name": "GP",
        "start_url": ".",
        "display": "standalone",
        "theme_color": "#041b3b",
        "background_color": "#041b3b",
        "icons": [
            {"src": icon_data_uri, "sizes": "192x192", "type": "image/png"},
            {"src": icon_data_uri, "sizes": "512x512", "type": "image/png"}
        ]
    }
    
    b64_manifest = base64.b64encode(json.dumps(manifest).encode('utf-8')).decode('utf-8')
    manifest_url = f"data:application/manifest+json;base64,{b64_manifest}"

    # 3. Le script JS (sans aucun guillemet double pour ne pas casser le HTML)
    js_code = f"""
    const h=document.head; 
    h.querySelectorAll('link[rel*=icon], link[rel=manifest], link[rel=apple-touch-icon]').forEach(e=>e.remove()); 
    const m=document.createElement('link'); m.rel='manifest'; m.href='{manifest_url}'; h.appendChild(m); 
    const a=document.createElement('link'); a.rel='apple-touch-icon'; a.href='{icon_data_uri}'; h.appendChild(a);
    """

    # 4. L'injection ultra-rapide via la balise image invisible !
    st.markdown(f'<img src="x" style="display:none;" onerror="{js_code}">', unsafe_allow_html=True)

# ==========================================
#          EASTER EGG 1 : POP-UP FEUR
# ==========================================
@st.dialog("🚨 ALERTE GÉNÉRALE 🚨")
def afficher_popup_feur(mot_declencheur):
    # 1. Les Ballons (S'affichent sur toute l'app)
    st.balloons()
    
    # 2. Le Titre dans la boite de dialogue
    if mot_declencheur == "quoi":
        st.markdown("<h1 style='text-align: center; font-size: 60px; margin-bottom: 20px;'>FEUR ! 💇‍♂️</h1>", unsafe_allow_html=True)
    else:
        st.markdown("<h1 style='text-align: center; font-size: 60px; margin-bottom: 20px;'>ROUGE ! 🚤</h1>", unsafe_allow_html=True)
    
    # 3. La Vidéo (Centrée)
    st.video("autre/feur.mp4", autoplay=True)
    
    st.markdown("*Cliquez en dehors de la fenêtre pour fermer.*")


# ==========================================
#       EASTER EGG 2 : CHARRETTE EXPRESS
# ==========================================
def afficher_cheval_express():
    """Affiche le faux mode de transport 'CHEVAL' uniquement le 1er avril."""
    now = dt.datetime.now()
    if now.month == 4 and now.day == 1:
        # Génération des temps aléatoires basés sur la minute
        random.seed(now.minute)
        
        t1_1 = "À l'approche"
        t1_2 = f"{random.randint(8, 14)} min"
        t1_3 = f"{random.randint(18, 25)} min"
        
        t2_1 = f"{random.randint(4, 7)} min"
        t2_2 = f"{random.randint(15, 20)} min"
        t2_3 = f"{random.randint(28, 35)} min"
        
        t3 = random.randint(15, 45)
        
        fausses_dest = [
            "Perpette-les-Oies - Université", 
            "Pétaouchnok RER", 
            "Eglise de Trifouillis-les-Oies",
            "Trou-Perdu-sous-Bois METRO",
            "Montcuq (Centre)",
            "Mairie de Villeneuve-Bad-Loin",
            "Stade de Nulle-Part-sur-Oise",
            "Melun (🐄)",
            "Gare de Bled-Paumé-sur-Yvette",
            "Marché International de Chépaou",
            "Bout-du-Monde (Z.I.)"
        ]
        
        random.shuffle(fausses_dest)
        d1, d2, d3 = fausses_dest[0], fausses_dest[1], fausses_dest[2]
        
        # Le code HTML/CSS collé tout à gauche pour désactiver le mode "code brut" de Streamlit
        html_poisson = f"""
<style>
@media(max-width: 480px) {{
    .ch-row {{ flex-direction:column !important; align-items:flex-start !important; }}
    .ch-times {{ width:100% !important; text-align:left !important; margin-top:6px !important; }}
    .ch-dest {{ white-space:normal !important; text-overflow:clip !important; display:block !important; width:100% !important; }}
}}
</style>
<div style="margin-top: 10px; margin-bottom: 20px;">
<div style="background-color: #041b3b; height: 54px; width: 100%; border-radius: 12px; box-sizing: border-box;"></div>
<div style="margin-top: -54px; height: 54px; width: 100%; box-sizing: border-box; background: rgba(255, 255, 255, 0.08); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.15); display: flex; align-items: center; padding: 0 16px; gap: 12px; color: #ffffff; font-size: 1.15rem; font-weight: 800; letter-spacing: 0.5px; margin-bottom: 15px;">🐴 CHEVAL EXPRESS</div>
<div class="rail-card" style="border-left-color: #ff5500 !important; background-color: #041b3b; padding: 12px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
<div style="display: flex; align-items: center; margin-bottom: 8px;"><span class="line-badge" style="background-color: #ff5500; font-size: 16px; padding: 4px 10px; margin-right: 10px; border-radius: 6px;">CH</span><span style="background-color: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; padding: 2px 6px; font-size: 14px;">🚧</span></div>
<div style="color: #f39c12; font-size: 0.85em; margin-bottom: 15px; font-weight: 500; border-left: 2px solid #f39c12; padding-left: 8px; font-style: italic;">⚠️ Mouvement social : Grève surprise des juments. Des retards sont à prévoir sur l'ensemble du réseau équestre. Prévoyez des carottes.</div>
<div class="rail-row ch-row" style="border-top: 1px solid rgba(255, 255, 255, 0.1) !important; padding-top: 8px; margin-top: 8px;"><span class="ch-dest" style="color: #e0e0e0; font-weight: 500; flex: 1; margin-right: 10px;">➔ {d1}</span><span class="ch-times" style="white-space: nowrap; text-align: right;"><span style="color: #f39c12; font-weight: bold;">{t1_1}</span> <span style="color: #888; margin: 0 6px; font-weight: lighter;">|</span> <span style="color: #2ecc71; font-weight: bold;">{t1_2}</span> <span style="color: #888; margin: 0 6px; font-weight: lighter;">|</span> <span style="color: #2ecc71; font-weight: bold;">{t1_3}</span></span></div>
<div class="rail-row ch-row" style="border-top: 1px solid rgba(255, 255, 255, 0.1) !important; padding-top: 8px; margin-top: 8px;"><span class="ch-dest" style="color: #e0e0e0; font-weight: 500; flex: 1; margin-right: 10px;">➔ {d2}</span><span class="ch-times" style="white-space: nowrap; text-align: right;"><span style="color: #2ecc71; font-weight: bold;">{t2_1}</span> <span style="color: #888; margin: 0 6px; font-weight: lighter;">|</span> <span style="color: #2ecc71; font-weight: bold;">{t2_2}</span> <span style="color: #888; margin: 0 6px; font-weight: lighter;">|</span> <span style="color: #2ecc71; font-weight: bold;">{t2_3}</span></span></div>
<div class="rail-row ch-row" style="border-top: 1px solid rgba(255, 255, 255, 0.1) !important; padding-top: 8px; margin-top: 8px;"><span class="ch-dest" style="color: #e0e0e0; font-weight: 500; flex: 1; margin-right: 10px;">➔ {d3}</span><span class="ch-times" style="white-space: nowrap; text-align: right;"><del style="color: #888;">{t3} min</del> &nbsp;<span style="color: #e74c3c; font-weight: bold; font-style: italic;">Cheval enfui</span></span></div>
</div>
</div>
"""
        st.markdown(html_poisson, unsafe_allow_html=True)

def generer_icones_html():
    mapping_files = {
        "RER":   "img/rer.svg",
        "TRAIN": "img/train.svg",
        "METRO": "img/metro.svg",
        "TRAM":  "img/tram.svg",
        "CABLE": "img/cable.svg",
        "BUS":   "img/bus.svg",
        "AUTRE": "img/autre.svg"
    }
    labels = {
        "RER": "RER", "TRAIN": "TRAIN", "METRO": "MÉTRO", 
        "TRAM": "TRAMWAY", "CABLE": "CÂBLE", "BUS": "BUS", "AUTRE": "AUTRE"
    }
    fallbacks = {
        "RER": "🚆", "TRAIN": "🚆", "METRO": "🚇", 
        "TRAM": "🚋", "CABLE": "🚠", "BUS": "🚌", "AUTRE": "🌙"
    }
    resultat = {}
    for mode, label in labels.items():
        filepath = mapping_files.get(mode)
        svg_html = get_svg_inline(filepath) if filepath else None
        if svg_html:
            html = f'<span style="display:inline-flex; align-items:center;">{svg_html}<span style="margin-left:8px;">{label}</span></span>'
            resultat[mode] = html
        else:
            emoji = fallbacks.get(mode, "❓")
            resultat[mode] = f"{emoji} {label}"
    return resultat

def afficher_bandeau_trafic(line_id, nom_ligne=""):
    """Retourne le HTML du bandeau trafic (Dynamique, limité en hauteur, sans bégaiements)."""
    if not line_id: return ""
    
    alertes = demander_info_trafic(line_id, nom_ligne)
    interruption = next((a for a in alertes if a['severity'] >= 40), None)
    perturbation = next((a for a in alertes if 10 <= a['severity'] < 40), None)

    if not interruption and not perturbation:
        return ""

    css_and_script = """
    <style>
    details.traffic-icon { display: inline-block; position: relative; margin-left: 8px; vertical-align: middle; z-index: 50; }
    
    /* 🪄 L'ASTUCE EST LÀ : L'icône ouverte passe devant les autres */
    details.traffic-icon[open] {
        z-index: 99999 !important;
    }
    
    div[data-testid="stElementContainer"]:has(details.traffic-icon[open]) {
        position: relative !important;
        z-index: 99999 !important; 
    }

    details.traffic-icon > summary::-webkit-details-marker { display: none; }
    details.traffic-icon > summary { 
        list-style: none; cursor: pointer; outline: none; display: flex; align-items: center; justify-content: center;
        width: 28px; height: 28px; transition: all 0.2s; font-size: 1.1em; user-select: none;
    }
    details.traffic-icon > summary:hover { opacity: 0.8; }
    
    /* On customise la barre de défilement pour qu'elle soit jolie ! */
    .traffic-content-scroll::-webkit-scrollbar { width: 6px; }
    .traffic-content-scroll::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.05); border-radius: 4px; }
    .traffic-content-scroll::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 4px; }
    .traffic-content-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.4); }
    </style>
    
    <img src="x" style="display:none;" onerror="
        if (!window.traficJS_FixFinal) {
            window.traficJS_FixFinal = true;
            // 🧹 FINI LE JAVASCRIPT SABOTEUR DE Z-INDEX !
            // On garde UNIQUEMENT la logique pour fermer la bulle si on clique à côté.
            document.addEventListener('click', e => {
                document.querySelectorAll('details.traffic-icon[open]').forEach(d => {
                    if (!d.contains(e.target)) d.removeAttribute('open');
                });
            });
        }
    ">
    """
    html_output = css_and_script + '<div style="display: inline-flex; gap: 6px; vertical-align: middle;">'

    # --- NETTOYAGE DU TEXTE ---
    def preparer_texte(texte_brut, header_alerte=""):
        if not texte_brut or str(texte_brut).strip().lower() == "none": 
            return "Information non disponible."
        t = str(texte_brut)
        t = re.sub(r'(?i)<br\s*/?>|</p>|</li>', '\n', t)
        t = re.sub(r'<[^>]+>', '', t)
        
        bouts_a_effacer = [
            r"(?i)bus \d+\s*:\s*travaux\s*[-:]?\s*",
            r"(?i)arrêt\(s\) non desservi\(s\)\s*[-:]?\s*",
            r"(?i)motif\s*:\s*travaux sur le réseau ferroviaire\.?",
            r"(?i)métro \d+\s*:\s*travaux de modernisation\s*[-:]?\s*(autre)?\s*(autre)?\s*",
            r"(?i)trafic perturbé\s*[-:]?\s*",
            r"(?i)trafic interrompu\s*[-:]?\s*"
        ]
        for bout in bouts_a_effacer:
            t = re.sub(bout, '', t)
            
        try:
            t_propre = nettoyer_texte_details(t)
            if t_propre: t = t_propre
        except: pass

        lignes_a_zapper = [
            "les horaires du calculateur", "un service de bus de remplacement",
            "détails et calendrier", "autre autre", "consultez le fil x",
            "consultez le compte x", "plus d'informations sur cette perturbation",
            "nous vous prions de bien vouloir", "pour la gêne occasionnée", "fi :"
        ]

        # 🪄 NORMALISATION DU TITRE (On retire les doubles espaces pour comparer purement le texte)
        header_clean = re.sub(r'\s+', ' ', str(header_alerte).lower()).strip(' .:-')

        lignes = t.split('\n')
        lignes_finales = []
        for l in lignes:
            l_clean = l.strip()
            l_clean = re.sub(r'^[-:.,;]\s*', '', l_clean)
            if not l_clean or len(l_clean) < 3 or l_clean.lower() == "none": continue
            if any(z in l_clean.lower() for z in lignes_a_zapper): continue
            
            # 🪄 L'ANTI-BÉGAIEMENT AMÉLIORÉ (Fuzzy match puissant)
            l_norm = re.sub(r'\s+', ' ', l_clean.lower()).strip(' .:-')
            # Si la ligne ressemble de très près au titre, on l'efface direct !
            if header_clean and len(l_norm) > 15 and (l_norm in header_clean or header_clean in l_norm):
                continue
                
            est_doublon = False
            for i, existante in enumerate(lignes_finales):
                if l_clean.lower() in existante.lower() or existante.lower() in l_clean.lower():
                    lignes_finales[i] = l_clean if len(l_clean) > len(existante) else existante
                    est_doublon = True
                    break
            
            if not est_doublon:
                l_clean = l_clean[0].upper() + l_clean[1:]
                lignes_finales.append(l_clean)
        
        if not lignes_finales:
            secours = str(texte_brut).replace('\n', ' ').strip()
            if secours.lower() == "none" or not secours: return "Information non disponible."
            return secours
        return '<br>'.join(lignes_finales)

    interruptions = [a for a in alertes if a['severity'] >= 40]
    perturbations = [a for a in alertes if 10 <= a['severity'] < 40]

    # --- AFFICHAGE DES BULLETINS ---
    # Pour les interruptions ROUGES :
    for inter in interruptions:
        info_longue = preparer_texte(inter.get('text', ''), inter.get('header', ''))
        html_output += f"""
        <details class="traffic-icon" name="trafic" style="position: relative; z-index: 95;">
            <summary style="background: rgba(231, 76, 60, 0.15); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border: 1px solid rgba(231, 76, 60, 0.5); border-radius: 8px;" title="Trafic Interrompu">❌</summary>
            <div style="position: absolute; top: calc(100% + 8px); left: 0; width: 300px; max-width: 85vw; z-index: 9999; 
                        background: var(--gp-card-bg); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); 
                        border: 1px solid color-mix(in srgb, var(--gp-text) 15%, transparent); border-left: 4px solid #e74c3c; padding: 12px; border-radius: 12px; box-shadow: 0 15px 40px rgba(0,0,0,0.2), 0 0 25px rgba(231, 76, 60, 0.25);">
                <strong style="color: #e74c3c; font-size: 0.9em; display: flex; align-items: center; gap: 6px;">❌ TRAFIC INTERROMPU</strong>
                <div style="margin-top: 4px; margin-bottom: -4px; -webkit-mask-image: linear-gradient(to bottom, transparent 0px, black 8px, black calc(100% - 6px), transparent 100%); mask-image: linear-gradient(to bottom, transparent 0px, black 8px, black calc(100% - 6px), transparent 100%);">
                    <div class="traffic-content-scroll" style="font-size: 0.85em; color: var(--gp-text); opacity: 0.9; line-height: 1.5; white-space: normal; max-height: 200px; overflow-y: auto; padding-right: 5px; padding-top: 8px; padding-bottom: 4px;">{info_longue}</div>
                </div>
            </div>
        </details>
        """
        
    for pert in perturbations:
        texte_brut = pert.get('text', '')
        type_pert = determiner_type_perturbation(texte_brut, pert.get('header', ''))
        if type_pert == "TROP_LOIN": continue
            
        info_longue = preparer_texte(texte_brut, pert.get('header', ''))
        est_travaux = "travaux" in texte_brut.lower() or "travaux" in type_pert.lower()
        est_futur = "À venir" in type_pert
        
        if est_futur: icone_emoji, couleur_hex, couleur_rgb, titre = "ℹ️", "#3498db", "52, 152, 219", f"Information • {type_pert}"
        elif est_travaux: icone_emoji, couleur_hex, couleur_rgb, titre = "🚧", "#f39c12", "243, 156, 18", f"TRAVAUX • {type_pert}"
        else: icone_emoji, couleur_hex, couleur_rgb, titre = "⚠️", "#f39c12", "243, 156, 18", f"Trafic perturbé • {type_pert}"

        html_output += f"""
        <details class="traffic-icon" name="trafic" style="position: relative; z-index: 95;">
            <summary style="background: rgba({couleur_rgb}, 0.15); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border: 1px solid rgba({couleur_rgb}, 0.5); border-radius: 8px;" title="{titre}">{icone_emoji}</summary>
            <div style="position: absolute; top: calc(100% + 8px); left: 0; width: 300px; max-width: 85vw; z-index: 9999; 
                        background: var(--gp-card-bg); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); 
                        border: 1px solid color-mix(in srgb, var(--gp-text) 15%, transparent); border-left: 4px solid {couleur_hex}; padding: 12px; border-radius: 12px; box-shadow: 0 15px 40px rgba(0,0,0,0.2), 0 0 25px rgba({couleur_rgb}, 0.25);">
                <strong style="color: {couleur_hex}; font-size: 0.9em; display: flex; align-items: center; gap: 6px;">{icone_emoji} {titre}</strong>
                <div style="margin-top: 4px; margin-bottom: -4px; -webkit-mask-image: linear-gradient(to bottom, transparent 0px, black 8px, black calc(100% - 6px), transparent 100%); mask-image: linear-gradient(to bottom, transparent 0px, black 8px, black calc(100% - 6px), transparent 100%);">
                    <div class="traffic-content-scroll" style="font-size: 0.85em; color: var(--gp-text); opacity: 0.9; line-height: 1.5; white-space: normal; max-height: 200px; overflow-y: auto; padding-right: 5px; padding-top: 8px; padding-bottom: 4px;">{info_longue}</div>
                </div>
            </div>
        </details>
        """

    html_output += '</div>'
    return html_output.replace('\n', '')
