import streamlit as st
import json
import time
import base64
import streamlit.components.v1 as components
from streamlit_js_eval import streamlit_js_eval
from settings import APP_NAME, APP_VERSION, APP_CODENAME
from utils import get_all_changelogs
from assistant_ia import ouvrir_assistant

def initialiser_favoris():
    """Charge les favoris depuis le navigateur au démarrage et gère la sauvegarde infaillible."""
    if 'favorites' not in st.session_state:
        st.session_state.favorites = []
    if 'favs_loaded' not in st.session_state:
        st.session_state.favs_loaded = False

    if not st.session_state.favs_loaded:
        favs_from_browser = streamlit_js_eval(js_expressions="window.localStorage.getItem('gp_favs');", key="get_favs_init")
        
        if favs_from_browser is not None:
            st.session_state.favs_loaded = True
            if favs_from_browser:
                try:
                    st.session_state.favorites = json.loads(favs_from_browser)
                except:
                    pass
            st.rerun()
            
    if st.session_state.get('trigger_save_favs', False):
        json_data = json.dumps(st.session_state.favorites)
        safe_json = json_data.replace('\\', '\\\\').replace('`', '\\`')
        
        components.html(
            f"<script>window.localStorage.setItem('gp_favs', `{safe_json}`);</script>", 
            height=0, width=0
        )
        st.session_state.trigger_save_favs = False

def afficher_sidebar():
    """Gère l'affichage complet de la barre latérale."""
    with st.sidebar:
        # 🪄 INJECTION CSS SPÉCIFIQUE À LA SIDEBAR
        st.markdown("""
        <style>
            /* 1. CORRECTION : Destruction totale de l'espace en haut de la sidebar */
            [data-testid="stSidebarUserContent"] {
                padding-top: 0rem !important; 
            }

            /* 2. CORRECTION : Flou PROGRESSIF sur le bouton de fermeture */
            [data-testid="stSidebarHeader"] {
                position: sticky !important;
                top: 0 !important;
                z-index: 999 !important;
                background-color: color-mix(in srgb, var(--background-color) 50%, transparent) !important;
                backdrop-filter: blur(12px) !important;
                -webkit-backdrop-filter: blur(12px) !important;
                
                /* Le fameux masque pour un fondu en douceur vers le bas ! */
                -webkit-mask-image: linear-gradient(to bottom, black 60%, transparent 100%) !important;
                mask-image: linear-gradient(to bottom, black 60%, transparent 100%) !important;
            }

            /* Ombres et style des Cartes (Cards) */
            [data-testid="stSidebar"] [data-testid="stVerticalBlockBorderWrapper"] {
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08) !important;
                background-color: var(--secondary-background-color) !important;
                border-color: rgba(128, 128, 128, 0.15) !important;
                transition: transform 0.3s ease, box-shadow 0.3s ease !important;
            }
            [data-testid="stSidebar"] [data-testid="stVerticalBlockBorderWrapper"]:hover {
                box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15) !important;
            }

            /* Boutons Poubelle */
            [data-testid="stSidebar"] [data-testid="stHorizontalBlock"] > [data-testid="column"]:last-child button {
                width: 100% !important; 
                height: 42px !important; 
                padding: 0 !important; 
                margin: 0 !important; 
                border: 1px solid rgba(231, 76, 60, 0.3) !important; 
                background: rgba(231, 76, 60, 0.1) !important; 
                display: flex !important; align-items: center !important; justify-content: center !important;
                transition: all 0.2s ease !important;
            }
            [data-testid="stSidebar"] [data-testid="stHorizontalBlock"] > [data-testid="column"]:last-child button:hover {
                background: rgba(231, 76, 60, 0.25) !important;
                border: 1px solid #e74c3c !important;
                transform: scale(1.05) !important;
            }

            /* Bouton "Tout effacer" customisé via le marqueur adjacent */
            div[data-testid="stElementContainer"]:has(.marker-clear-btn) + div[data-testid="stElementContainer"] button {
                border: 1px solid rgba(231, 76, 60, 0.4) !important;
                background-color: rgba(231, 76, 60, 0.1) !important;
                color: #e74c3c !important;
                font-weight: bold !important;
                transition: all 0.3s ease !important;
                margin-top: 5px !important;
            }
            div[data-testid="stElementContainer"]:has(.marker-clear-btn) + div[data-testid="stElementContainer"] button:hover {
                background-color: rgba(231, 76, 60, 0.15) !important;
                border: 1px solid rgba(231, 76, 60, 0.8) !important;
                transform: translateY(-4px) !important; 
                box-shadow: 0 8px 20px rgba(231, 76, 60, 0.25) !important;
            }
            
            /* Réduction globale de l'espacement dans la sidebar */
            [data-testid="stSidebar"] [data-testid="stVerticalBlock"] { gap: 0.6rem !important; }
            
            /* 6. L'effet magique sur le bouton WhatsApp (Vert Néon) */
            .whatsapp-btn:hover {
                background-color: rgba(37, 211, 102, 0.25) !important;
                border: 1px solid rgba(37, 211, 102, 0.8) !important;
                transform: translateY(-4px) !important; 
                box-shadow: 0 8px 20px rgba(37, 211, 102, 0.35) !important;
                color: #20b858 !important;
            }
        </style>
        """, unsafe_allow_html=True)
        
        # 🏠 Bouton Accueil
        if st.button("🏠 Retour à l'accueil", use_container_width=True):
            st.session_state.selected_stop = None
            st.session_state.selected_name = None
            st.session_state.search_results = {}
            st.query_params.clear()
            st.rerun()
            
        # ==========================================
        # 🗂️ CARTE 1 : MES FAVORIS
        # ==========================================
        with st.container(border=True):
            st.markdown("<h3 style='margin-top: 0px; margin-bottom: 10px; font-size: 1.2rem;'>⭐ Mes Favoris</h3>", unsafe_allow_html=True)
            
            if not st.session_state.get('favs_loaded', False):
                st.info("🔄 Chargement des favoris...")
            elif not st.session_state.favorites:
                st.info("Ajoutez des gares en cliquant sur l'étoile à côté de leur nom !")
            else:
                for fav in st.session_state.favorites[:]:
                    col_nav, col_del = st.columns([0.8, 0.2], gap="small", vertical_alignment="center")
                    nom_joli = fav['name'].title()
                    
                    with col_nav:
                        if st.button(f"📍 {nom_joli}", key=f"btn_fav_{fav['id']}", use_container_width=True):
                            st.session_state.selected_stop = fav['id']
                            st.session_state.selected_name = fav['full_name']
                            st.session_state.search_results = {}
                            st.session_state.last_query = ""
                            st.session_state.search_key += 1
                            st.query_params["gare"] = fav['id']
                            st.session_state.fermer_sidebar = True 
                            st.rerun()

                    with col_del:
                        if st.button("🗑️", key=f"del_fav_{fav['id']}", use_container_width=True):
                            st.session_state.favorites = [f for f in st.session_state.favorites if f['id'] != fav['id']]
                            st.session_state.trigger_save_favs = True
                            st.rerun()

                st.markdown("<div class='marker-clear-btn'></div>", unsafe_allow_html=True)
                if st.button("💥 Tout effacer", use_container_width=True):
                    st.session_state.favorites = []
                    st.session_state.trigger_save_favs = True
                    st.rerun()

        # ==========================================
        # 🗂️ CARTE 2 : INFORMATIONS
        # ==========================================
        with st.container(border=True):
            st.markdown("<h3 style='margin-top: 0px; margin-bottom: 10px; font-size: 1.2rem;'>🗄️ Informations</h3>", unsafe_allow_html=True)
            st.success(f"🎉 **Bienvenue sur {APP_NAME} {APP_VERSION} !**") 
            
            st.markdown("""
            <a href="https://whatsapp.com/channel/0029VbCSkQt5vKA7MojdZH3N" target="_blank" class="whatsapp-btn" style="
                display: flex; align-items: center; justify-content: center; width: 100%;
                background-color: rgba(37, 211, 102, 0.15); color: #25D366; border: 1px solid rgba(37, 211, 102, 0.5);
                padding: 10px 15px; border-radius: 8px; text-decoration: none; font-weight: 600;
                margin-top: 10px; margin-bottom: 10px; transition: all 0.3s ease;
            ">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" style="height: 1.4em; margin-right: 10px; fill: currentColor;">
                    <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
                </svg>
                Rejoignez le canal !
            </a>
            """, unsafe_allow_html=True)
            
            with st.expander("📜 Historique des versions"):
                st.markdown("""<style>div[data-testid="stExpanderDetails"] { max-height: 400px; overflow-y: auto; }</style>""", unsafe_allow_html=True)
                notes_history = get_all_changelogs()
                for i, note in enumerate(notes_history):
                    st.markdown(note)
                    if i < len(notes_history) - 1: st.divider()
        
        # ==========================================
        # FOOTER / CRÉDITS (AVEC LE VRAI RER ET TON MP3 !)
        # ==========================================
        
        # 1. On charge l'image en Base64
        try:
            with open("img/rerng.png", "rb") as img_file:
                train_img_src = f"data:image/png;base64,{base64.b64encode(img_file.read()).decode()}"
        except FileNotFoundError:
            train_img_src = ""

        # 🎵 2. NOUVEAU : On charge ton MP3 en Base64 !
        try:
            with open("autre/klaxon.mp3", "rb") as audio_file:
                audio_src = f"data:audio/mp3;base64,{base64.b64encode(audio_file.read()).decode()}"
        except FileNotFoundError:
            audio_src = ""
            # On ne met pas de st.error pour l'audio pour ne pas casser l'UI si tu ne l'as pas encore mis

        st.markdown(f"""
        <div style="text-align: center; margin-top: 15px; padding-top: 15px;">
            <div id="easter-egg-badge" style="margin-bottom: 12px; cursor: pointer; user-select: none; display: inline-block; transition: transform 0.1s;">
                <span style="background: linear-gradient(135deg, #8172df, #5e4bb6); color: white; padding: 5px 14px; border-radius: 20px; font-weight: 800; font-size: 0.85rem; box-shadow: 0 4px 12px rgba(94, 75, 182, 0.25); display: inline-block; transform-origin: center;">
                    {APP_VERSION} <span style="font-weight: 500; opacity: 0.85; margin-left: 4px;"> {APP_CODENAME}</span>
                </span>
            </div>
            <div style="font-size: 0.85rem; color: #888; margin-bottom: 5px;">🚀 Propulsé par <strong>Grand Paname</strong></div>
            <div style="font-size: 0.75rem; color: #666; margin-bottom: 8px;">Fait avec ❤️ par un Francilien</div>
            <div style="font-size: 0.75rem; color: #888; margin-bottom: 12px;">✨ Réalisé avec <span style="background: -webkit-linear-gradient(45deg, #4285f4, #9b72cb, #d96570); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: bold;">Gemini</span></div>
            <div style="display: flex; justify-content: center; gap: 15px; font-size: 0.8rem;">
                <a href="https://tally.so/r/A7qJxe" style="color: #3498db; text-decoration: none;" target="_blank">Signaler un bug</a>
                <span style="color: #444;">•</span>
                <a href="mailto:contact@grandpaname.fun" style="color: #3498db; text-decoration: none;">Contact</a>
            </div>
            <div style="font-size: 0.65rem; color: #444; margin-top: 15px;">© 2026 Grand Paname. Données : API IDFM.</div>
        </div>
        """, unsafe_allow_html=True)
        
        # 3. LE SCRIPT DE L'ANIMATION
        js_easter_egg = f"""
        <script>
        const checkExist = setInterval(function() {{
            const doc = window.parent.document;
            const badge = doc.getElementById('easter-egg-badge');
            
            if (badge) {{
                clearInterval(checkExist);
                
                if (!badge.hasAttribute('data-ee-bound')) {{
                    badge.setAttribute('data-ee-bound', 'true');
                    let clickCount = 0;

                    badge.addEventListener('click', function() {{
                        badge.style.transform = 'scale(0.9)';
                        setTimeout(() => badge.style.transform = 'scale(1)', 100);
                        
                        clickCount++;
                        if (clickCount >= 7) {{
                            clickCount = 0;
                            
                            // 🎵 On joue TON vrai fichier MP3
                            if ('{audio_src}' !== '') {{
                                const klaxon = new Audio('{audio_src}');
                                klaxon.play().catch(e => console.log("Erreur audio:", e));
                            }}
                            
                            // 🚆 On crée le train
                            const train = doc.createElement('img');
                            train.src = '{train_img_src}';
                            
                            train.style.cssText = 'position:fixed; bottom: 15vh; left: 0; transform: translateX(-100%); height: 130px; z-index: 999999; pointer-events: none; transition: transform 1s linear, left 1s linear; filter: drop-shadow(0 15px 15px rgba(0,0,0,0.4));';
                            
                            doc.body.appendChild(train);
                            train.getBoundingClientRect(); 
                            
                            train.style.left = '100vw';
                            train.style.transform = 'translateX(0)';
                            
                            setTimeout(() => train.remove(), 1000);
                        }}
                    }});
                }}
            }}
        }}, 100);
        </script>
        """
        import streamlit.components.v1 as components
        components.html(js_easter_egg, height=0, width=0)
