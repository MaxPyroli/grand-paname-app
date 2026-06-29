from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from api_idfm import demander_api, demander_info_trafic, demander_arrets_proches
import urllib.parse # Ajoute ceci tout en haut de ton fichier main.py si ce n'est pas fait !

app = FastAPI(title="API Grand Paname")

# On autorise ton téléphone (et n'importe quel écran) à parler avec cette API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Le moteur de Grand Paname est en ligne ! 🚇"}

@app.get("/api/departs/{stop_id}")
def api_departs(stop_id: str):
    """Récupère les prochains passages pour un arrêt précis."""
    # On utilise ta fonction universelle pour interroger Navitia
    resultats = demander_api(f"stop_areas/{stop_id}/departures?count=50")
    return {"stop_id": stop_id, "donnees": resultats}

@app.get("/api/trafic/{line_id}")
def api_trafic(line_id: str):
    """Récupère l'info trafic d'une ligne."""
    # On utilise ta fonction dédiée au trafic
    alertes = demander_info_trafic(line_id)
    return {"line_id": line_id, "alertes": alertes}

@app.get("/api/search")
def api_search(q: str):
    """Recherche instantanée d'une gare via l'API Navitia"""
    
    # 🚀 CORRECTION : On "nettoie" le texte pour l'URL (les espaces deviennent %20)
    q_encode = urllib.parse.quote(q)
    
    data = demander_api(f"places?q={q_encode}&type[]=stop_area&count=8")
    
    resultats = []
    if data and 'places' in data:
        for p in data['places']:
            if 'stop_area' in p:
                sa = p['stop_area']
                ville = sa.get('administrative_regions', [{}])[0].get('name', '')
                resultats.append({
                    "id": sa['id'],
                    "label": f"{sa['name']} ({ville})" if ville else sa['name']
                })
    return {"results": resultats}

@app.get("/api/nearby")
def api_nearby(lat: float, lon: float):
    """Recherche les gares autour d'une position GPS pour la liste native"""
    data_proches = demander_arrets_proches(lat, lon, rayon=1500)
    
    resultats = []
    if data_proches and 'places_nearby' in data_proches:
        for p in data_proches['places_nearby']:
            if 'stop_area' in p:
                sa = p['stop_area']
                ville = sa.get('administrative_regions', [{}])[0].get('name', '')
                distance = int(p.get('distance', 0))
                
                # On ajoute la distance directement dans le nom de la gare
                label = f"{sa['name']} ({ville}) - à {distance}m" if ville else f"{sa['name']} - à {distance}m"
                
                resultats.append({
                    "id": sa['id'],
                    "label": label
                })
                
    return {"results": resultats}