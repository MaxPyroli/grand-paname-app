import streamlit as st
import re
import time
import pytz
from datetime import datetime
import json
from streamlit_js_eval import streamlit_js_eval

from api_idfm import demander_api, demander_lignes_arret, demander_coordonnees_arret
from utils import normaliser_mode, clean_code_line, format_html_time, calculer_direction_relative
from ui import afficher_cheval_express, afficher_bandeau_trafic, generer_icones_html
from settings import GEOGRAPHIE_RER

ICONES_TITRE = generer_icones_html()

# ==========================================
# GESTION DES FAVORIS
# ==========================================
def toggle_favorite(stop_id, stop_name):
    if 'favorites' not in st.session_state:
        st.session_state.favorites = []
        
    # Vérifie si la gare est déjà dans les favoris
    is_already_fav = any(f['id'] == stop_id for f in st.session_state.favorites)
    
    if is_already_fav:
        # On la supprime
        st.session_state.favorites = [f for f in st.session_state.favorites if f['id'] != stop_id]
    else:
        # On l'ajoute
        short_name = stop_name.split('(')[0].strip()
        st.session_state.favorites.append({
            'id': stop_id,
            'name': short_name,
            'full_name': stop_name
        })
        
    # 🪄 LE SECRET EST LÀ : On dit à l'application de sauvegarder au prochain affichage !
    st.session_state.trigger_save_favs = True
# ==========================================
# FRAGMENT LIVE (AUTO-REFRESH)
# ==========================================
@st.fragment(run_every=15)
def afficher_live_content(stop_id, clean_name):
    # 🧠 DÉTECTION : Nouveau changement ou simple actualisation ?
    if 'last_rendered_stop' not in st.session_state:
        st.session_state.last_rendered_stop = None
    if 'last_update_time' not in st.session_state:
        st.session_state.last_update_time = "--:--:--"

    est_nouvelle_gare = (st.session_state.last_rendered_stop != stop_id)
    st.session_state.last_rendered_stop = stop_id

    # 1. HEADER "DERNIÈRE MISE À JOUR"
    header_placeholder = st.empty()

    def update_header(is_loading=False, new_time=None, inject_animation=False):
        if new_time:
            st.session_state.last_update_time = new_time
            
        loader_html = "<span class='custom-loader' style='width: 12px; height: 12px; border-width: 2px; border-left-color: #f1c40f; margin-right: 6px;'></span>" if is_loading else ""
        loading_text = "<span style='color: #f1c40f; font-size: 0.9em; font-style: italic; font-weight: bold;'>Actualisation...</span>" if is_loading else ""

        # 🪄 NOUVELLE ANIMATION FLUIDE ET MODERNE
        anim_css = """
        <style>
        @keyframes smoothEnter {
            0% { opacity: 0; transform: translateY(25px); filter: blur(5px); }
            100% { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        .rail-card, .bus-card, div[class*="sticky-glass-"], .footer-container { 
            animation: smoothEnter 0.65s cubic-bezier(0.2, 0.8, 0.2, 1) forwards !important; 
            opacity: 0; /* Reste invisible avant l'animation */
        }
        </style>
        """ if inject_animation else ""

        live_html = "" if is_loading else " • LIVE <span class='live-icon'>🟢</span>"
        html_content = f"{anim_css}<div style='display: flex; align-items: center; color: #888; font-size: 0.85rem; height: 45px; line-height: 45px; overflow: hidden; font-weight: 500; margin-bottom: -10px;'>Dernière mise à jour : {st.session_state.last_update_time}{live_html}<div style='margin-left: 15px; display: flex; align-items: center; opacity: {'1' if is_loading else '0'}; transition: opacity 0.3s;'>{loader_html}{loading_text}</div></div>"
        
        header_placeholder.markdown(html_content, unsafe_allow_html=True)

    # 🛑 LE SECRET ABSOLU EST ICI : CRÉATION INCONDITIONNELLE
    # On crée la boîte TOUT LE TEMPS pour que les numéros des éléments suivants ne bougent jamais !
    loader_ph = st.empty()

    if est_nouvelle_gare:
        st.session_state.last_update_time = "--:--:--"
        update_header(is_loading=True, inject_animation=True)
        
        # On remplit la boîte avec le mode "chargement" et le bouclier CSS
        loader_ph.markdown("""
        <style>
            /* 🪄 MASQUAGE BRUTAL DES ANCIENS CONTENEURS STREAMLIT */
            div[data-testid="stElementContainer"]:has(.rail-card),
            div[data-testid="stElementContainer"]:has(.bus-card),
            div[data-testid="stElementContainer"]:has([class*="sticky-glass-"]),
            div[data-testid="stElementContainer"]:has(.footer-container),
            div[data-testid="stElementContainer"]:has(.service-box) { 
                display: none !important; 
                opacity: 0 !important;
            }
        </style>
        <div style="height: 35vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(4, 27, 59, 0.3); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.1);">
            <div class="custom-loader" style="width: 35px; height: 35px; border-width: 4px; border-left-color: #3498db; margin-bottom: 15px;"></div>
            <h3 style="color: #3498db; margin: 0; font-size: 1.2rem;">Connexion à la gare...</h3>
            <p style="color: #888; font-size: 0.9em; margin-top: 5px;">Récupération des horaires en temps réel</p>
        </div>
        """, unsafe_allow_html=True)
        time.sleep(0.05)
    else:
        update_header(is_loading=True)

    # 🐟 EASTER EGG : CHARRETTE EN TÊTE DE LISTE
    afficher_cheval_express()
    
    # C. Préparation des conteneurs pour les résultats
    containers = {
        "RER": st.container(),
        "TRAIN": st.container(),
        "METRO": st.container(),
        "CABLE": st.container(),
        "TRAM": st.container(),
        "BUS": st.container(),
        "AUTRE": st.container()
    }
    
    def sort_key(k): 
        mode = k[0]
        code = str(k[1]).strip().upper()
        if mode == "BUS" and code.startswith("N"):
            match = re.match(r"^N(\d+)", code)
            return (4, int(match.group(1))) if match else (4, code)
        if code.isalpha(): return (0, code)
        match = re.match(r"^([a-zA-Z]+)(\d+)", code)
        if match: return (1, match.group(1), int(match.group(2)))
        if code.isdigit(): return (2, int(code))
        return (3, code)

    # 1. LIGNES THEORIQUES
    data_lines = demander_lignes_arret(stop_id)

    all_lines_at_stop = {} 
    has_c1_cable = False 

    if data_lines and 'lines' in data_lines:
        for line in data_lines['lines']:
            raw_mode = "AUTRE"
            if 'physical_modes' in line and line['physical_modes']:
                raw_mode = line['physical_modes'][0].get('id', 'AUTRE')
            elif 'physical_mode' in line:
                raw_mode = line['physical_mode']
            
            mode = normaliser_mode(raw_mode)
            code = clean_code_line(line.get('code', '?')) 
            color = line.get('color', '666666')
            all_lines_at_stop[(mode, code)] = {'color': color, 'id': line.get('id')}
            
            if mode == "CABLE" and code == "C1":
                has_c1_cable = True

# ✨ LE COMPTEUR INTELLIGENT (Adaptatif) ✨
    nb_lignes = len(all_lines_at_stop)
    # On calcule : environ 15 départs en réserve par ligne connue à cet arrêt.
    # On force un minimum de 100 (pour la sécurité) et un plafond de 600 (pour API IDFM).
    count_dynamique = min(max(100, nb_lignes * 15), 600)

    # 2. TEMPS REEL
    data_live = demander_api(f"stop_areas/{stop_id}/departures?count={count_dynamique}")
    buckets = {"RER": {}, "TRAIN": {}, "METRO": {}, "CABLE": {}, "TRAM": {}, "BUS": {}, "AUTRE": {}}
    displayed_lines_keys = set()
    footer_data = {m: {} for m in buckets.keys()}
    last_departures_map = {} 

    if data_live and 'departures' in data_live:
        for d in data_live['departures']:
            val_tri, _ = format_html_time(d['stop_date_time']['departure_date_time'], d.get('data_freshness', 'realtime'))
            if val_tri < 3000:
                info = d['display_informations']
                mode = normaliser_mode(info.get('physical_mode', 'AUTRE'))
                code = clean_code_line(info.get('code', '?')) 
                raw_dest = info.get('direction', '')
                if mode != "BUS":
                    dest = re.sub(r'\s*\([^)]+\)$', '', raw_dest)
                else:
                    match = re.search(r'(.*)\s*\(([^)]+)\)$', raw_dest)
                    if match:
                        name_part = match.group(1).strip()
                        city_part = match.group(2).strip()
                        if city_part.lower() in name_part.lower(): dest = name_part
                        elif '-' in city_part:
                            first_chunk = city_part.split('-')[0].strip()
                            if len(first_chunk) > 2 and first_chunk.lower() in name_part.lower(): dest = name_part
                            else: dest = raw_dest
                        else: dest = raw_dest
                    else: dest = raw_dest
                key = (mode, code, dest)
                current_max = last_departures_map.get(key, -999999)
                if val_tri > current_max: last_departures_map[key] = val_tri

        for d in data_live['departures']:
            info = d['display_informations']
            raw_mode = info.get('physical_mode', 'AUTRE')
            comm_mode = info.get('commercial_mode', '').upper()
            raw_code = str(info.get('code', '?')).strip().upper()
            raw_dest = info.get('direction', '')
            color = info.get('color', '666666')
            
            clean_code = raw_code.replace("BUS", "").strip()
            mode = normaliser_mode(raw_mode)

            is_replacement = False
            match_found = None

            if mode == "BUS":
                for (theo_mode, theo_code) in all_lines_at_stop.keys():
                    if theo_code == clean_code and theo_mode in ["RER", "TRAIN", "METRO", "TRAM"]:
                        match_found = (theo_mode, theo_code)
                        break

            if match_found:
                is_replacement = True
                mode = match_found[0] 
                code = match_found[1] 
                color = all_lines_at_stop[match_found]['color'] 
                
                # 🛑 L'EXCEPTION SARTROUVILLE 🛑
                if "SARTROUVILLE" in clean_name.upper() and code == "J":
                    keywords = ["REMPLACEMENT", "SUBSTITUTION", "TRAVAUX", "BUS RELAIS", "BUS DE"]
                    has_keywords = any(k in raw_dest.upper() for k in keywords)
                    if not has_keywords:
                        # Ce n'est pas un bus de substitution, c'est le vrai bus J !
                        is_replacement = False
                        mode = "BUS"
                        code = clean_code
                        color = info.get('color', '666666') # On remet sa vraie couleur

            elif mode == "BUS":
                is_admin_train = ("RER" in comm_mode or "TRAIN" in comm_mode or "TRANSILIEN" in comm_mode)
                keywords = ["REMPLACEMENT", "SUBSTITUTION", "TRAVAUX", "BUS RELAIS", "BUS DE"]
                has_keywords = any(k in raw_dest.upper() for k in keywords)
                
                if is_admin_train or (clean_code in ["A","B","C","D","E","H","J","K","L","N","P","R","U"] and has_keywords):
                    is_replacement = True
                    code = clean_code
                    if code in ["A","B","C","D","E"]: mode = "RER"
                    elif code.startswith("T"): mode = "TRAM"
                    elif code.startswith("M"): mode = "METRO"
                    else: mode = "TRAIN"
                else:
                    code = clean_code_line(info.get('code', '?'))
            else:
                code = clean_code_line(info.get('code', '?'))

            if mode != "BUS" or is_replacement:
                dest = re.sub(r'\s*\([^)]+\)$', '', raw_dest)
            else:
                match = re.search(r'(.*)\s*\(([^)]+)\)$', raw_dest)
                if match:
                    name_part = match.group(1).strip()
                    city_part = match.group(2).strip()
                    if city_part.lower() in name_part.lower(): dest = name_part
                    elif '-' in city_part:
                        first_chunk = city_part.split('-')[0].strip()
                        if len(first_chunk) > 2 and first_chunk.lower() in name_part.lower(): dest = name_part
                        else: dest = raw_dest
                    else: dest = raw_dest
            
            val_tri, html_time = format_html_time(d['stop_date_time']['departure_date_time'], d.get('data_freshness', 'realtime'))
            if val_tri < -5: continue 

            is_last = False
            is_noctilien = (mode == "BUS" and str(code).upper().startswith('N') and not is_replacement)
            if not is_noctilien and val_tri < 3000:
                key_check = (mode, code, dest)
                max_val = last_departures_map.get(key_check)
                if max_val is not None and val_tri == max_val:
                    try:
                        dep_str = d['stop_date_time']['departure_date_time']
                        dep_hour = int(dep_str.split('T')[1][:2])
                    except: dep_hour = 0
                    current_hour = datetime.now(pytz.timezone('Europe/Paris')).hour
                    is_evening_mode = (current_hour >= 21)
                    is_night_train = (dep_hour >= 22) or (dep_hour < 4)
                    if is_evening_mode or is_night_train:
                        is_last = True
            
            TRANSILIENS_OFFICIELS = ["H", "J", "K", "L", "N", "P", "R", "U", "V"]
            if is_last and mode == "TRAIN" and code not in TRANSILIENS_OFFICIELS and not is_replacement:
                is_last = False

            cle = (mode, code, color)
            if mode in buckets:
                if cle not in buckets[mode]: buckets[mode][cle] = []
                
                # 🪄 ON CALCULE LA VRAIE DIRECTION ICI !
                # (On lui passe le code de la ligne, la gare actuelle, et la destination du train)
                direction_topologique = calculer_direction_relative(code, clean_name, dest)
                
                # On glisse cette nouvelle info dans la valise du train
                buckets[mode][cle].append({
                    'dest': dest, 
                    'direction_index': direction_topologique,  # ⬅️ LA NOUVEAUTÉ EST LÀ
                    'html': html_time, 
                    'tri': val_tri, 
                    'is_last': is_last, 
                    'is_replacement': is_replacement
                })
    
    # 3. GHOST LINES
    MODES_NOBLES = ["RER", "TRAIN", "METRO", "CABLE", "TRAM"]
    for (mode_t, code_t), info_t in all_lines_at_stop.items():
        if mode_t in MODES_NOBLES:
            if code_t in ["TER", "R"]: continue
            
            # 🪄 LE CORRECTIF ANTI-DOUBLON (Recherche globale)
            exists_in_buckets = False
            for m_recherche in buckets:
                for (b_mode, b_code, b_color) in buckets[m_recherche]:
                    if b_code == code_t:
                        exists_in_buckets = True
                        break
                if exists_in_buckets:
                    break
                    
            if not exists_in_buckets:
                cle_ghost = (mode_t, code_t, info_t['color'])
                if mode_t not in buckets: buckets[mode_t] = {}
                buckets[mode_t][cle_ghost] = [{'dest': 'Service terminé', 'html': "<span class='service-end'>-</span>", 'tri': 3000, 'is_last': False}]
    
    # 4. FILTRAGE & NETTOYAGE
    for mode in list(buckets.keys()):
        keys_to_remove = []
        for cle in buckets[mode]:
            code_clean = cle[1]; color_clean = cle[2]
            has_active = any(d['tri'] < 3000 for d in buckets[mode][cle])
            if has_active: 
                displayed_lines_keys.add((mode, code_clean))
                if any(d.get('is_replacement') for d in buckets[mode][cle]):
                    displayed_lines_keys.add(("BUS", code_clean))
            else:
                if mode == "BUS": 
                    keys_to_remove.append(cle)
                    footer_data[mode][code_clean] = color_clean
                else: 
                    displayed_lines_keys.add((mode, code_clean))
        for k in keys_to_remove: 
            del buckets[mode][k]
        if not buckets[mode]:
            del buckets[mode]

    # 5. RENDU HTML
    # On vide la boîte de manière INCONDITIONNELLE pour qu'elle disparaisse proprement à chaque fois
    loader_ph.empty()

    paris_tz = pytz.timezone('Europe/Paris')
    heure_actuelle = datetime.now(paris_tz).strftime('%H:%M:%S')
    
    update_header(is_loading=False, new_time=heure_actuelle, inject_animation=est_nouvelle_gare)

    ordre_affichage = ["RER", "TRAIN", "METRO", "CABLE", "TRAM", "BUS", "AUTRE"]
    has_data = False
    
    for mode_actuel in ordre_affichage:
        if mode_actuel not in buckets: 
            continue
        lignes_du_mode = buckets[mode_actuel]
        has_data = True
        
        with containers[mode_actuel]:
            # L'astuce est de rendre le spacer "transparent" pour qu'il ne pollue pas le mode clair
            st.markdown(f"""
            <div style="background-color: transparent; height: 54px; width: 100%; border-radius: 12px; box-sizing: border-box;"></div>
            """, unsafe_allow_html=True)
            
            st.markdown(f"""
            <style>
                div[data-testid="stElementContainer"]:has(.sticky-glass-{mode_actuel}),
                .element-container:has(.sticky-glass-{mode_actuel}) {{
                    position: sticky !important;
                    top: 0px !important;
                    z-index: 100 !important;
                }}

                div.sticky-glass-{mode_actuel} {{
                    margin-top: -54px !important; height: 54px !important; width: 100% !important; box-sizing: border-box !important; 
                    
                    /* 🔒 On verrouille la position au-dessus de tout le reste */
                    position: relative !important;
                    z-index: 100 !important;
                    
                    /* 🎨 On descend à 60% d'opacité pour que le flou soit BIEN visible */
                    background: color-mix(in srgb, var(--secondary-background-color) 60%, transparent) !important; 
                    backdrop-filter: blur(16px) !important; 
                    -webkit-backdrop-filter: blur(16px) !important; 
                    
                    border-radius: 12px !important; 
                    display: flex !important; align-items: center !important; padding: 0 16px !important; gap: 12px !important; 
                    color: var(--text-color) !important; 
                    font-size: 1.15rem !important; font-weight: 800 !important; letter-spacing: 0.5px !important; 
                    box-shadow: 0 4px 15px rgba(0,0,0,0.1) !important;
                    
                    -webkit-transform: translate3d(0,0,0) !important;
                    transform: translate3d(0,0,0) !important;
                }}
                div.sticky-glass-{mode_actuel} svg {{ color: var(--text-color) !important; fill: currentColor !important; height: 1.3em !important; }}
            </style>
            <div class='sticky-glass-{mode_actuel}'>{ICONES_TITRE.get(mode_actuel, "AUTRE")}</div>
            """, unsafe_allow_html=True)
            
            c1_vu = False
            for cle in sorted(lignes_du_mode.keys(), key=sort_key):
                _, code, color = cle
                if code == "C1":
                    if c1_vu: continue 
                    c1_vu = True
                
                line_id = all_lines_at_stop.get((mode_actuel, code), {}).get('id')
                bandeau_html = afficher_bandeau_trafic(line_id, code) if line_id else ""

                departs = lignes_du_mode[cle]
                proches = [d for d in departs if d['tri'] < 3000]
                if not proches:
                     proches = [{'dest': 'Service terminé', 'html': "<span class='service-end'>-</span>", 'tri': 3000, 'is_last': False}]

                if mode_actuel in ["RER", "TRAIN"] and code in GEOGRAPHIE_RER:
                    geo = GEOGRAPHIE_RER[code]
                    stop_upper = clean_name.upper()
                    local_mots_1 = geo['mots_1'].copy(); local_mots_2 = geo['mots_2'].copy()
                    
                    if code == "C":
                        if any(k in stop_upper for k in ["MAILLOT", "PEREIRE", "CLICHY", "ST-OUEN", "GENNEVILLIERS", "ERMONT", "PONTOISE", "FOCH", "MARTIN", "BOULAINVILLIERS", "KENNEDY", "JAVEL", "GARIGLIANO"]):
                            if "INVALIDES" in local_mots_1: local_mots_1.remove("INVALIDES")
                            if "INVALIDES" not in local_mots_2: local_mots_2.append("INVALIDES")
                    if code == "D":
                        zone_nord_d = ["CREIL", "ORRY", "COYE", "SURVILLIERS", "FOSSES", "LOUVRES", "GOUSSAINVILLE", "VILLIERS-LE-BEL", "GARGES", "SARCELLES", "PIERREFITTE", "STAINS", "SAINT-DENIS", "STADE DE FRANCE", "NORD"]
                        if any(k in stop_upper for k in zone_nord_d):
                            if "GARE DE LYON" in local_mots_2: local_mots_2.remove("GARE DE LYON")
                            if "GARE DE LYON" not in local_mots_1: local_mots_1.append("GARE DE LYON")

                    p1 = []; p2 = []; p3 = []
                    
                    for d in proches:
                        idx_dir = d.get('direction_index') # On récupère l'index (0 ou 1)
                        dest_upper = d['dest'].upper()
                        
                        if idx_dir == 0:
                            p1.append(d) # Direction Ouest / Nord
                        elif idx_dir == 1:
                            p2.append(d) # Direction Est / Sud
                        else:
                            # 🛡️ SECOURS : Si la topo a échoué, on utilise tes mots-clés
                            if any(k in dest_upper for k in local_mots_1):
                                p1.append(d)
                            elif any(k in dest_upper for k in local_mots_2):
                                p2.append(d)
                            else:
                                p3.append(d)
                                
                    real_p3 = [x for x in p3 if x['tri'] < 3000]

                    card_html = f"""<div class="rail-card" style="--line-color: #{color}; border-left-color: var(--line-color);"><div style="display:flex; align-items:center; margin-bottom:5px;"><span class="line-badge" style="background-color:#{color};">{code}</span>{bandeau_html}</div>"""
                    
                    def render_group(titre, items):
                        h = f"<div class='rer-direction'>{titre}</div>"
                        if not items: return h + """<div class="service-box">😴 Service terminé</div>"""
                        items.sort(key=lambda x: x['tri'])
                        for it in items[:4]:
                            val_tri = it['tri']
                            dest_txt = it['dest']
                            if it.get('is_replacement'):
                                h += f"""<div class='replacement-box'><span class='replacement-label'>🚍 Bus de substitution</span><div class='rail-row'><span class='rail-dest'>{dest_txt}</span><span>{it['html']}</span></div></div>"""
                            elif it.get('is_last'):
                                if val_tri < 10: h += f"""<div class='last-dep-box'><span class='last-dep-label'>🏁 Dernier départ</span><div class='rail-row'><span class='rail-dest'>{dest_txt}</span><span>{it['html']}</span></div></div>"""
                                else: h += f"""<div class='rail-row'><span class='rail-dest'>{dest_txt}</span><span class='last-dep-text-only'>{it['html']} 🏁</span></div>"""
                            else:
                                h += f"""<div class='rail-row'><span class='rail-dest'>{dest_txt}</span><span>{it['html']}</span></div>"""
                        return h

                    has_data_p1 = any(d['tri'] < 3000 for d in p1)
                    has_data_p2 = any(d['tri'] < 3000 for d in p2)
                    has_data_p3 = len(real_p3) > 0

                    if not has_data_p1 and not has_data_p2 and not has_data_p3:
                        card_html += """<div class="service-box">😴 Service terminé</div>"""
                    else:
                        if not any(k in stop_upper for k in geo['term_1']): card_html += render_group(geo['labels'][0], p1)
                        if not any(k in stop_upper for k in geo['term_2']): card_html += render_group(geo['labels'][1], p2)
                        if has_data_p3: card_html += render_group("AUTRES DIRECTIONS", real_p3)
                            
                    card_html += "</div>"
                    st.markdown(card_html, unsafe_allow_html=True)
                    
                elif mode_actuel in ["RER", "TRAIN"]:
                    card_html = f"""<div class="rail-card" style="--line-color: #{color}; border-left-color: var(--line-color);"><div style="display:flex; align-items:center; margin-bottom:10px;"><span class="line-badge" style="background-color:#{color};">{code}</span>{bandeau_html}</div>"""
                    if not proches or (len(proches)==1 and proches[0]['tri']==3000): card_html += f"""<div class="service-box">😴 Service terminé</div>"""
                    else:
                        proches.sort(key=lambda x: x['tri'])
                        for item in proches[:4]:
                            val_tri = item['tri']
                            dest_txt = item['dest']
                            if item.get('is_replacement'):
                                card_html += f"""<div class='replacement-box'><span class='replacement-label'>🚍 Bus de substitution</span><div class='rail-row'><span class='rail-dest'>{dest_txt}</span><span>{item['html']}</span></div></div>"""
                            elif item.get('is_last'):
                                if val_tri < 10: card_html += f"""<div class='last-dep-box'><span class='last-dep-label'>🏁 Dernier départ</span><div class='rail-row'><span class='rail-dest'>{dest_txt}</span><span>{item['html']}</span></div></div>"""
                                elif val_tri <= 30: card_html += f"""<div class='rail-row'><span class='rail-dest'>{dest_txt}</span><span class='last-dep-small-frame'>{item['html']} 🏁</span></div>"""
                                else: card_html += f"""<div class='rail-row'><span class='rail-dest'>{dest_txt}</span><span class='last-dep-text-only'>{item['html']} 🏁</span></div>"""
                            else:
                                card_html += f"""<div class='rail-row'><span class='rail-dest'>{dest_txt}</span><span>{item['html']}</span></div>"""
                    card_html += "</div>"
                    st.markdown(card_html, unsafe_allow_html=True)

                elif code == "C1":
                    rows_html = ""
                    destinations_vues = []
                    est_termine = (len(proches) == 1 and "Service terminé" in proches[0]['dest'])
                    
                    perturbation_msg = None 
                    tz_paris = pytz.timezone('Europe/Paris')
                    now_hour = datetime.now(tz_paris).hour
                    
                    if not est_termine and not proches and (6 <= now_hour < 23):
                         perturbation_msg = "Aucun départ détecté - Vérifiez l'état de la ligne"

                    alert_html = ""
                    if perturbation_msg:
                        alert_html = f"<div style='background:rgba(231,76,60,0.15);border-left:4px solid #e74c3c;color:#ffadad;padding:10px;margin-bottom:12px;border-radius:4px;display:flex;align-items:start;gap:10px;'><span style='font-size:1.2em;'>⚠️</span><span style='font-size:0.9em;line-height:1.4;'>{perturbation_msg}</span></div>"

                    if est_termine:
                        rows_html = '<div class="service-box">😴 Service terminé</div>'
                    else:
                        for d in proches:
                            dn = d['dest']
                            if dn not in destinations_vues:
                                destinations_vues.append(dn)
                                freq_text = "Départ toutes les ~30s"
                                rows_html += f"""<div class="bus-row" style="align-items:center;"><span class="bus-dest">➜ {dn}</span><span style="background-color:rgba(255,255,255,0.1);padding:4px 10px;border-radius:12px;font-size:0.85em;color:#a9cce3;white-space:nowrap;">⏱ {freq_text}</span></div>"""
                    
                    if not rows_html and not perturbation_msg:
                         rows_html = '<div class="service-box">😴 Service terminé</div>'

                    st.markdown(f"""
<div class="bus-card" style="--line-color: #{color}; border-left-color: var(--line-color); position: relative;">
<div style="display:flex; align-items:center; margin-bottom:10px;">
<span class="line-badge" style="background-color:#{color};">{code}</span>
</div>
{alert_html}
{rows_html}
</div>
""", unsafe_allow_html=True)
                else:
                    dest_data = {}
                    for d in proches:
                        dn = d['dest']
                        if dn not in dest_data: dest_data[dn] = {'items': [], 'best_time': 9999}
                        if len(dest_data[dn]['items']) < 3:
                            dest_data[dn]['items'].append(d)
                            if d['tri'] < dest_data[dn]['best_time']: dest_data[dn]['best_time'] = d['tri']
                    
                    if mode_actuel in ["METRO", "TRAM", "CABLE"]: 
                        sorted_dests = sorted(dest_data.items(), key=lambda item: item[0])
                    else: 
                        sorted_dests = sorted(dest_data.items(), key=lambda item: item[1]['best_time'])
                    
                    is_noctilien = str(code).strip().upper().startswith('N')
                    rows_html = ""
                    
                    for dest_name, info in sorted_dests:
                        if "Service terminé" in dest_name: 
                            rows_html += f'<div class="service-box">😴 Service terminé</div>'
                        else:
                            html_list = []
                            contains_last = False; last_val_tri = 9999
                            is_group_replacement = False
                            
                            if info['items'] and info['items'][0].get('is_replacement'):
                                is_group_replacement = True
    
                            for idx, d_item in enumerate(info['items']):
                                val_tri = d_item['tri']
                                if idx > 0 and val_tri > 62 and not is_noctilien: continue
                                
                                txt = d_item['html']
                                if d_item.get('is_last'):
                                    contains_last = True
                                    last_val_tri = val_tri
                                    if val_tri < 10: txt = f"<span class='last-dep-text-only'>{txt} 🏁</span>"
                                    elif val_tri <= 30: txt = f"<span class='last-dep-small-frame'>{txt} 🏁</span>"
                                    else: txt = f"<span class='last-dep-text-only'>{txt} 🏁</span>"
                                html_list.append(txt)
                            
                            if not html_list and info['items']: html_list.append(info['items'][0]['html'])
                            times_str = "<span class='time-sep'>|</span>".join(html_list)
                            
                            row_content = f'<div class="bus-row"><span class="bus-dest">➜ {dest_name}</span><span>{times_str}</span></div>'
    
                            if is_group_replacement:
                                rows_html += f"""<div class='replacement-box'><span class='replacement-label'>🚍 Bus de substitution</span>{row_content}</div>"""
                            elif contains_last and len(html_list) == 1 and last_val_tri < 10:
                                rows_html += f"""<div class='last-dep-box'><span class='last-dep-label'>🏁 Dernier départ</span>{row_content}</div>"""
                            else:
                                rows_html += row_content                    

                    st.markdown(f"""<div class="bus-card" style="--line-color: #{color}; border-left-color: var(--line-color);"><div style="display:flex; align-items:center; margin-bottom:5px;"><span class="line-badge" style="background-color:#{color};">{code}</span>{bandeau_html}</div>{rows_html}</div>""", unsafe_allow_html=True)
    
    # 6. FOOTER
    with containers["AUTRE"]:
        for (mode_theo, code_theo), info in all_lines_at_stop.items():
            if (mode_theo, code_theo) not in displayed_lines_keys:
                if mode_theo not in footer_data: footer_data[mode_theo] = {}
                footer_data[mode_theo][code_theo] = info['color']
        
        count_visible = sum(len(footer_data[m]) for m in footer_data if m != "AUTRE")

        if not has_data:
            if count_visible > 0: st.markdown("""<div style='text-align: center; padding: 20px; background-color: rgba(52, 152, 219, 0.1); border-radius: 10px; margin-top: 20px; margin-bottom: 20px;'><h3 style='margin:0; color: #3498db;'>😴 Aucun départ immédiat</h3></div>""", unsafe_allow_html=True)
            else: st.markdown("""<div style='text-align: center; padding: 20px; background-color: rgba(231, 76, 60, 0.1); border-radius: 10px; margin-top: 20px;'><h3 style='margin:0; color: #e74c3c;'>📭 Aucune information</h3></div>""", unsafe_allow_html=True)

        if count_visible > 0:
            st.markdown("<div style='margin-top: 10px; border-top: 1px solid #333; padding-top: 15px;'></div>", unsafe_allow_html=True)
            st.caption("Autres lignes desservant cet arrêt :")
            
            for mode in ordre_affichage:
                if mode == "AUTRE": continue
                if mode in footer_data and footer_data[mode]:
                    html_badges = ""
                    items = footer_data[mode]
                    
                    liste_lettres = []
                    liste_chiffres = []
                    liste_noctiliens = []
                    
                    for code in items.keys():
                        c_str = str(code).strip()
                        if mode == "BUS" and c_str.upper().startswith('N'):
                            liste_noctiliens.append(c_str)
                        elif c_str.isdigit():
                            liste_chiffres.append(c_str)
                        else:
                            liste_lettres.append(c_str)
                    
                    liste_lettres.sort()
                    liste_chiffres.sort(key=lambda x: int(x))
                    
                    def tri_noc(n):
                        num = ''.join(filter(str.isdigit, n))
                        return int(num) if num else 0
                    liste_noctiliens.sort(key=tri_noc)
                    
                    sorted_codes = liste_lettres + liste_chiffres + liste_noctiliens

                    for code in sorted_codes:
                        color = items[code]
                        html_badges += f'<span class="line-badge footer-badge" style="background-color:#{color};">{code}</span>'
                    
                    if html_badges:
                        st.markdown(f"""<div class="footer-container"><span class="footer-icon">{ICONES_TITRE[mode]}</span><div>{html_badges}</div></div>""", unsafe_allow_html=True)

# ========================================================
# AFFICHAGE DU TABLEAU PRINCIPAL
# ========================================================
def afficher_tableau_live(stop_id, stop_name):
    clean_name = stop_name.split('(')[0].strip()
    afficher_live_content(stop_id, clean_name)
