from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from api_idfm import demander_api, demander_info_trafic, demander_arrets_proches, demander_lignes_arret, demander_forme_ligne
from utils import normaliser_mode
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
                    "label": f"{sa['name']} ({ville})" if ville else sa['name'],
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

@app.get("/api/map-data")
def api_map_data(lat: float, lon: float):
    """Arrêts et tracés de lignes (hors BUS) autour d'une position."""
    MODES_CARTE = {"RER", "METRO", "TRAM", "TRAIN", "CABLE"}

    data_proches = demander_arrets_proches(lat, lon, rayon=2000)
    arrets = []
    lignes_vues = {}  # line_id → {code, color, mode}

    if data_proches and 'places_nearby' in data_proches:
        for p in data_proches['places_nearby']:
            sa = p.get('stop_area', {})
            stop_id = sa.get('id')
            coord = sa.get('coord', {})
            if not stop_id or not coord.get('lat'):
                continue

            # Lignes de cet arrêt
            data_lines = demander_lignes_arret(stop_id)
            stop_mode = None
            if data_lines and 'lines' in data_lines:
                for line in data_lines['lines']:
                    raw_mode = ''
                    if line.get('physical_modes'):
                        raw_mode = line['physical_modes'][0].get('id', '')
                    elif line.get('physical_mode'):
                        raw_mode = line['physical_mode']
                    mode = normaliser_mode(raw_mode)
                    if mode not in MODES_CARTE:
                        continue
                    if stop_mode is None:
                        stop_mode = mode
                    lid = line.get('id')
                    if lid and lid not in lignes_vues:
                        lignes_vues[lid] = {
                            'id': lid,
                            'code': line.get('code', ''),
                            'color': line.get('color', '888888'),
                            'mode': mode,
                        }

            if stop_mode:
                arrets.append({
                    'id': stop_id,
                    'lat': float(coord['lat']),
                    'lon': float(coord['lon']),
                    'mode': stop_mode,
                })

    # Géométrie des lignes
    lignes = []
    for lid, info in lignes_vues.items():
        coords = []
        geojson = demander_forme_ligne(lid)
        if geojson and isinstance(geojson, dict):
            gtype = geojson.get('type', '')
            raw = geojson.get('coordinates', [])
            if gtype == 'MultiLineString' and raw:
                # Prendre tous les segments
                for segment in raw:
                    coords.extend([[pt[1], pt[0]] for pt in segment])
            elif gtype == 'LineString' and raw:
                coords = [[pt[1], pt[0]] for pt in raw]
        lignes.append({**info, 'coords': coords})

    return {"stops": arrets, "lines": lignes}

@app.get("/api/coord")
def api_coord(stop_id: str):
    """Coordonnées GPS d'un stop_area (appel séparé car /places ne les inclut pas)."""
    data = demander_api(f"stop_areas/{stop_id}")
    if data and 'stop_areas' in data and data['stop_areas']:
        coord = data['stop_areas'][0].get('coord')
        if coord:
            return {"lat": float(coord['lat']), "lon": float(coord['lon'])}
    return {"lat": None, "lon": None}