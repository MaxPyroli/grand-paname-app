import streamlit as st
import urllib.parse
import re
import os

# 1. LA NOUVELLE BIBLIOTHÈQUE GOOGLE
from google import genai
from google.genai import types

# 2. L'IMPORT CORRIGÉ
from api_idfm import demander_info_trafic, demander_api

# 3. NOUVELLE CONFIGURATION DU CLIENT GOOGLE
try:
    client = genai.Client(api_key=st.secrets["GEMINI_API_KEY"])
except Exception as e:
    st.error("Attention : Clé API introuvable dans st.secrets !")

# ==========================================
# 🧰 OUTIL 1 : INFO TRAFIC
# ==========================================
def outil_info_trafic_ia(ligne: str) -> str:
    """
    🚨 OUTIL OBLIGATOIRE POUR LE TRAFIC 🚨
    Utilise cet outil IMMÉDIATEMENT dès que l'utilisateur demande l'état du trafic, 
    les problèmes, les pannes ou les perturbations.
    """
    print(f"\n--- 🦊 PANA RENIFLE LE TRAFIC : {ligne} ---")
    
    try:
        ligne_propre = str(ligne).upper().replace("RER", "").replace("LIGNE", "").replace("METRO", "").strip()
        
        dico_lignes = {
            "A": "line:IDFM:C01742", "B": "line:IDFM:C01743", "C": "line:IDFM:C01727",
            "D": "line:IDFM:C01728", "E": "line:IDFM:C01729",
            "1": "line:IDFM:C01371", "2": "line:IDFM:C01372", "3": "line:IDFM:C01373",
            "4": "line:IDFM:C01374", "5": "line:IDFM:C01375", "6": "line:IDFM:C01376",
            "7": "line:IDFM:C01377", "8": "line:IDFM:C01378", "9": "line:IDFM:C01379",
            "10": "line:IDFM:C01380", "11": "line:IDFM:C01381", "12": "line:IDFM:C01382",
            "13": "line:IDFM:C01383", "14": "line:IDFM:C01386"
        }
        
        id_api = dico_lignes.get(ligne_propre, ligne_propre)
        print(f"📍 ID envoyé à l'API : {id_api}")
        
        resultats = demander_info_trafic(id_api)
        
        if not resultats or resultats == "[]":
            print("✅ L'API a répondu vide = Aucun problème !")
            return f"Bonne nouvelle ! Aucun incident signalé sur la ligne {ligne_propre}, le trafic est fluide. 🟢"
            
        return str(resultats)
        
    except Exception as e:
        print(f"❌ ERREUR TRAFIC PANA : {str(e)}")
        return f"Aïe, petite erreur technique Python : {str(e)}"

# ==========================================
# 🧰 OUTIL 2 : PROCHAINS DÉPARTS
# ==========================================
def outil_prochains_departs_ia(nom_station: str) -> str:
    """Récupère les temps d'attente (en minutes) pour une gare."""
    import urllib.parse
    from datetime import datetime
    
    try:
        from zoneinfo import ZoneInfo
        paris_tz = ZoneInfo("Europe/Paris")
    except Exception:
        import pytz
        paris_tz = pytz.timezone('Europe/Paris')

    try:
        print(f"🦊 Pana renifle la piste : {nom_station}")
        nom_station_propre = urllib.parse.quote(nom_station)
        
        recherche_data = demander_api(f"places?q={nom_station_propre}")
        if not recherche_data or not recherche_data.get('places'):
            return f"Je n'ai pas trouvé de piste pour la gare '{nom_station}'."
            
        stop_id = recherche_data['places'][0]['id']
        nom_trouve = recherche_data['places'][0].get('name', nom_station)
        
        data = demander_api(f"stop_areas/{stop_id}/departures?count=30")
        if not data or not data.get('departures'):
            return f"Aucun train en vue à {nom_trouve}."

        directions_vues = set()
        departs_trouves = []
        
        for d in data['departures']:
            info = d['display_informations']
            ligne = str(info.get('code', '?'))
            dest = info.get('direction', 'Inconnue').split('(')[0].strip()
            
            if ligne in ['A', 'B', 'C', 'D', 'E']: 
                icone, prio = "🚆", 1 
            elif ligne in ['H', 'J', 'K', 'L', 'N', 'P', 'R', 'U', 'V']: 
                icone, prio = "🚂", 2 
            elif ligne.isdigit() and int(ligne) <= 14: 
                icone, prio = "🚇", 3 
            elif "CABLE" in ligne.upper() or ligne == "C1":
                icone, prio = "🚡", 4 
            elif ligne.startswith('T') and len(ligne) <= 4: 
                icone, prio = "🚋", 5 
            else: 
                icone, prio = "🚌", 6 
            
            cle = (ligne, dest)
            
            if cle not in directions_vues:
                directions_vues.add(cle)
                
                try:
                    time_raw = d['stop_date_time']['departure_date_time']
                    dep_time = datetime.strptime(time_raw, '%Y%m%dT%H%M%S').replace(tzinfo=paris_tz)
                    now_paris = datetime.now(paris_tz)
                    diff = int((dep_time - now_paris).total_seconds() / 60)
                    
                    if diff <= 0: attente = "À quai"
                    elif diff > 90: attente = f"{diff // 60}h{diff % 60:02d}"
                    else: attente = f"{diff} min"
                except:
                    attente = "Bientôt"
                
                departs_trouves.append({
                    "prio": prio, 
                    "texte": f"{icone} **{ligne}** ➔ {dest} : **{attente}**"
                })
                
            if len(directions_vues) >= 15: break

        departs_trouves.sort(key=lambda x: x["prio"])
        
        rapport = ""
        for depart in departs_trouves[:8]:
            rapport += f"* {depart['texte']}\n"
            
        return rapport if rapport else "Aucun départ trouvé."

    except Exception as e:
        print(f"❌ ERREUR OUTIL PANA : {str(e)}")
        return f"Erreur technique Python : {str(e)}"

# ==========================================
# 🧰 OUTIL 3 : HORAIRES PRÉCIS (Derniers trains / Heure fixe)
# ==========================================
def outil_horaires_theoriques_ia(nom_station: str, heure_recherche: str) -> str:
    """
    🚨 OUTIL POUR LES HORAIRES SPÉCIFIQUES ET DERNIERS DÉPARTS 🚨
    Utilise cet outil si l'utilisateur demande l'horaire pour une heure précise, 
    ou le DERNIER train / bus de la journée.
    L'argument 'heure_recherche' doit être au format "HH:MM" (ex: "23:30", "01:15", "06:00").
    """
    import urllib.parse
    from datetime import datetime, timedelta
    
    try:
        from zoneinfo import ZoneInfo
        paris_tz = ZoneInfo("Europe/Paris")
    except Exception:
        import pytz
        paris_tz = pytz.timezone('Europe/Paris')

    try:
        print(f"🦊 Pana cherche les horaires à {nom_station} pour {heure_recherche}")
        nom_station_propre = urllib.parse.quote(nom_station)
        
        # 1. Trouver la station
        recherche_data = demander_api(f"places?q={nom_station_propre}")
        if not recherche_data or not recherche_data.get('places'):
            return f"Je n'ai pas trouvé la gare '{nom_station}'."
            
        stop_id = recherche_data['places'][0]['id']
        nom_trouve = recherche_data['places'][0].get('name', nom_station)
        
        # 2. Calculer le moment exact
        now = datetime.now(paris_tz)
        heure_clean = heure_recherche.replace('h', ':').replace('H', ':')
        h_str, m_str = heure_clean.split(':')
        h, m = int(h_str), int(m_str)
        
        search_date = now.replace(hour=h, minute=m, second=0)
        
        # Gestion minuit/nuit (Si on demande 1h du matin et qu'il est 20h, c'est pour la nuit qui arrive)
        if h < 4 and now.hour > 4:
            search_date += timedelta(days=1)
        elif h > 20 and now.hour < 4:
            search_date -= timedelta(days=1)
            
        dt_str = search_date.strftime('%Y%m%dT%H%M%S')
        
        # 3. Interroger l'API pour les départs à cette heure-là
        data = demander_api(f"stop_areas/{stop_id}/departures?from_datetime={dt_str}&count=30")
        if not data or not data.get('departures'):
            return f"Aucun départ trouvé à {nom_trouve} à partir de {heure_recherche}."

        departs_trouves = []
        directions_vues = {}
        
        for d in data['departures']:
            info = d['display_informations']
            ligne = str(info.get('code', '?'))
            dest = info.get('direction', 'Inconnue').split('(')[0].strip()
            
            time_raw = d['stop_date_time']['departure_date_time']
            dep_time = datetime.strptime(time_raw, '%Y%m%dT%H%M%S').replace(tzinfo=paris_tz)
            heure_depart_str = dep_time.strftime('%Hh%M')
            
            cle = (ligne, dest)
            if cle not in directions_vues:
                directions_vues[cle] = []
            
            if len(directions_vues[cle]) < 3: # On regroupe les 3 prochains
                directions_vues[cle].append(heure_depart_str)
                
        for (ligne, dest), heures in directions_vues.items():
            heures_str = ", ".join(heures)
            departs_trouves.append(f"- **{ligne}** ➔ {dest} : **{heures_str}**")
            
        if not departs_trouves:
            return "Aucun départ prévu."
            
        return f"Horaires prévus à {nom_trouve} à partir de {heure_recherche} :\n" + "\n".join(departs_trouves[:12])

    except Exception as e:
        print(f"❌ ERREUR OUTIL PANA : {str(e)}")
        return f"Erreur technique : {str(e)}"

# ==========================================
# 🧠 LE CERVEAU DE PANA (Intelligence Avancée)
# ==========================================
personnalite = """
Tu es Pana, l'assistant intelligent de l'application de transports Grand Paname.
Ton rôle est STRICTEMENT limité à donner les horaires de prochains départs et l'état du trafic. 

RÈGLES D'INTELLIGENCE ET DE FORMATAGE :

1. 🚫 INTERDICTION DES ITINÉRAIRES (RÈGLE ABSOLUE) :
   - Tu es INCAPABLE de calculer des itinéraires ou de donner des directions étape par étape (ex: "Comment aller de X à Y ?").
   - Si l'utilisateur te demande un itinéraire, refuse poliment et explique ton vrai rôle. 

2. 🚦 FORMATAGE STRICT DU TRAFIC (RÈGLE ABSOLUE) :
   - Ne fais JAMAIS de gros blocs de texte illisibles.
   - Commence TOUJOURS ta réponse par un titre en GRAS résumant l'état avec une pastille de couleur :
     * 🟢 Trafic normal -> "**Trafic fluide sur le [Ligne] 🟢**"
     * 🟡 Trafic perturbé / Travaux / Ralenti -> "**Le trafic sur le [Ligne] est perturbé 🟡**"
     * 🔴 Trafic interrompu -> "**Le trafic sur le [Ligne] est interrompu 🔴**"
   - Ensuite, saute une ligne et détaille CHAQUE perturbation sous forme de liste courte et synthétique.
   - Utilise des emojis en début de puce (🚧 pour les travaux, ⚠️ pour les incidents/retards, 🛑 pour les trains supprimés/coupures).
   - 🗓️ DATES ET HEURES : Mets TOUTES les dates, heures et périodes entre backticks (`) pour qu'elles s'affichent sous forme de badge visuel (ex: `du 12 au 14 mars` à partir de `23h30`).
   - Sois extrêmement concis : l'utilisateur doit pouvoir lire l'information en 3 secondes.

3. COMPRÉHENSION DU CONTEXTE ET DES BUS :
   - Tu PEUX et tu DOIS donner les horaires des bus et des trams sans jamais refuser !
   - N'écris jamais juste "A" ou "1". Ajoute TOUJOURS le préfixe : "RER A", "Ligne 1", "Bus 120", etc.

4. 🕰️ UTILISATION STRATÉGIQUE DES OUTILS HORAIRES :
   - Demande standard ("Prochains trains") -> Utilise `outil_prochains_departs_ia`.
   - Demande d'heure précise ou DERNIER TRAIN ("le dernier RER", "à 23h", "ce soir à minuit") -> Utilise `outil_horaires_theoriques_ia` en passant l'heure voulue (ex: "23:45" ou "00:30" pour les derniers trains).

5. HIÉRARCHIE ET REGROUPEMENT (Pour les demandes générales) :
   - Regroupe toujours les résultats par mode de transport dans cet ordre précis : 🚆 RER/Trains, puis 🚇 Métros, puis 🚡 Câble, puis 🚋 Trams, puis 🚌 Bus.
   - Format attendu :
     - 🚆 **RER A** -> Marne-la-Vallée (2 min, 12 min) et Saint-Germain (4 min)

6. TON ET PERSONNALITÉ :
   - Ton strictement professionnel, direct et informatif.
   - Termine TOUJOURS ton message par cette phrase exacte, en la renvoyant à la ligne : "Bon voyage à toi ! 🐾" (Ne la mets pas si tu as juste refusé un itinéraire).
"""

config_ia = types.GenerateContentConfig(
    system_instruction=personnalite,
    # 🚀 NOUVEAU : On donne le 3ème outil à Pana !
    tools=[outil_info_trafic_ia, outil_prochains_departs_ia, outil_horaires_theoriques_ia],
    temperature=0.4  
)

# ==========================================
# 🎨 L'INTERFACE : MÉLANGE NATIF + TITRE STYLISÉ
# ==========================================

# On met un espace dans le titre natif pour laisser place à notre titre HTML personnalisé
@st.dialog(" ") 
def ouvrir_assistant():
    
    # --- 1. PRÉPARATION DE L'ICÔNE PANA ---
    import os
    try:
        from utils import get_img_as_base64
        img_pana_b64 = get_img_as_base64("assets/pana_icon.png")
        if img_pana_b64:
            icone_titre = f'<img src="data:image/png;base64,{img_pana_b64}" style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover;">'
        else:
            icone_titre = "🐾"
    except:
        icone_titre = "🐾"

    # --- 2. LE STYLE CSS DU TITRE UNIQUEMENT ---
    st.markdown(
        """
        <style>
            .titre-container { margin-top: -30px; margin-bottom: 20px; }
            .titre-pana { 
                font-size: 2.2rem; font-weight: 900; 
                display: flex; align-items: center; gap: 15px; 
                color: var(--text-color) !important; 
            }
            .titre-pana span.nom { color: #ff9f43 !important; }
            .sous-titre-pana { 
                color: var(--text-color) !important; 
                opacity: 0.7; 
                font-size: 0.9em; 
                font-weight: 600; 
            }
            .badge-beta {
                background: rgba(255, 159, 67, 0.15);
                color: #ff9f43;
                border: 1px solid rgba(255, 159, 67, 0.3);
                padding: 2px 10px;
                border-radius: 8px;
                font-size: 0.7rem;
                text-transform: uppercase;
                margin-left: 5px;
            }
        </style>
        """,
        unsafe_allow_html=True
    )

    # --- 3. AFFICHAGE DU TITRE HTML ---
    st.markdown(
        f"""
        <div class="titre-container">
            <div class="titre-pana">
                {icone_titre} <span class="nom">Pana</span> 
                <span class="badge-beta">BÊTA</span>
            </div>
            <div class="sous-titre-pana">
                Assistant intelligent • Trafic & Horaires
            </div>
        </div>
        """, 
        unsafe_allow_html=True
    )

    # --- 4. LE RESTE RESTE 100% NATIF ---
    if st.button("🔄 Réinitialiser la discussion"):
        st.session_state.chat_session = client.chats.create(
            model="gemini-2.5-flash-lite", 
            config=config_ia
        )
        st.session_state.messages_ia = [
            {"role": "assistant", "content": "Salut ! 👋 Je suis Pana. Une info trafic ou un horaire à vérifier ?"}
        ]
        st.rerun()

    if "chat_session" not in st.session_state:
        st.session_state.chat_session = client.chats.create(
            model="gemini-2.5-flash-lite", 
            config=config_ia
        )
        st.session_state.messages_ia = [{"role": "assistant", "content": "Salut ! 👋 Je suis Pana. Une info trafic ou un horaire à vérifier ?"}]

    chat_container = st.container(height=450)
    
    with chat_container:
        for message in st.session_state.messages_ia:
            avatar_actuel = "assets/pana_icon.png" if message["role"] == "assistant" and os.path.exists("assets/pana_icon.png") else ("🐾" if message["role"] == "assistant" else "🧑")
            with st.chat_message(message["role"], avatar=avatar_actuel):
                st.markdown(message["content"])

    if prompt := st.chat_input("Demande-moi un horaire ou une info trafic..."):
        st.session_state.messages_ia.append({"role": "user", "content": prompt})
        with chat_container:
            with st.chat_message("user", avatar="assets/app_icon.png" if os.path.exists("assets/app_icon.png") else "👤"):
                st.markdown(prompt)
            
            with st.chat_message("assistant", avatar="assets/pana_icon.png" if os.path.exists("assets/pana_icon.png") else "🐾"):
                # 1. On crée une "boîte magique" vide
                message_placeholder = st.empty()
                
                # 2. On y met l'animation de chargement
                message_placeholder.markdown("""
                <div style="display: flex; align-items: center; gap: 12px; color: #3498db; font-style: italic; font-weight: 500; padding: 10px 0;">
                    <div class="custom-loader" style="width: 18px; height: 18px; border-width: 3px; border-left-color: #f1c40f;"></div>
                    Pana fouille pour trouver l'info... 🐾
                </div>
                """, unsafe_allow_html=True)
                
                try:
                    # 3. L'IA réfléchit et on attend sa réponse...
                    response = st.session_state.chat_session.send_message(prompt)
                    reponse_finale = response.text
                    
                    # 4. PAF ! On écrase l'animation avec la réponse finale
                    message_placeholder.markdown(reponse_finale)
                    
                    # 5. On sauvegarde dans l'historique
                    st.session_state.messages_ia.append({"role": "assistant", "content": reponse_finale})
                    
                except Exception as e:
                    # Si ça plante, on écrase l'animation avec le message d'erreur
                    message_placeholder.error(f"Oups, Pana a glissé : {str(e)}")

    st.caption("*Pana est propulsé par Gemini, une IA, et peut se tromper. Vérifiez les informations importantes.*")
