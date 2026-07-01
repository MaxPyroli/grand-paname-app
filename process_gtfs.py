"""
Génère paname-v3/assets/transport-data.json depuis les données IDFM.

Fichiers nécessaires (à télécharger sur data.iledefrance-mobilites.fr) :
  1. "Tracés des lignes de transport en commun d'Île-de-France (source GTFS)"
     → Export GeoJSON  → renommer en  lignes.geojson
  2. (optionnel) Dataset "Zones d'arrêts" ou "Arrêts"
     → Export GeoJSON  → renommer en  arrets.geojson

Usage :
  python process_gtfs.py lignes.geojson
  python process_gtfs.py lignes.geojson arrets.geojson
"""
import sys, json, math

# Colonnes possibles selon la version du dataset IDFM
CODE_KEYS   = ['route_short_name', 'name_line', 'shortname_line', 'code']
COLOR_KEYS  = ['route_color', 'colourweb_hexa', 'color', 'colour']
MODE_KEYS   = ['route_type', 'transportmode', 'mode', 'transport_mode']
ID_KEYS     = ['route_id', 'id_line', 'id']

# Mapping mode IDFM → mode applicatif
MODE_MAP = {
    # Valeurs numériques GTFS
    '0': 'TRAM', '1': 'METRO', '2': 'TRAIN', '7': 'CABLE',
    # Texte IDFM
    'tram': 'TRAM', 'tramway': 'TRAM',
    'metro': 'METRO', 'métro': 'METRO',
    'rail': 'TRAIN', 'train': 'TRAIN', 'transilien': 'TRAIN', 'suburban': 'TRAIN',
    'rer': 'RER',
    'funicular': 'CABLE', 'cable': 'CABLE', 'câble': 'CABLE', 'aerial lift': 'CABLE',
    'subway': 'METRO', 'navette': 'METRO',
    'bus': 'BUS', 'coach': 'BUS',
    # Parfois l'IDFM met le nom complet
    'rapid transit': 'METRO',
    'heavy rail': 'TRAIN',
}
MODES_CARTE = {'TRAM', 'METRO', 'TRAIN', 'CABLE', 'RER'}

DECIMATE = 3  # garder 1 point sur N (réduit la taille sans changer l'aspect)


def get(props, keys, default=''):
    for k in keys:
        if k in props and props[k] is not None:
            return str(props[k]).strip()
    return default


def normaliser_mode(raw):
    return MODE_MAP.get(str(raw).lower().strip(), 'BUS')


def extraire_coords(geometry):
    """Retourne une liste de segments [[lat,lon],...] depuis un GeoJSON geometry.
    Chaque segment du MultiLineString devient un polyline séparé dans Leaflet."""
    gtype = geometry.get('type', '')
    coords = geometry.get('coordinates', [])
    if gtype == 'LineString':
        return [[[pt[1], pt[0]] for pt in coords]]
    elif gtype == 'MultiLineString':
        return [[[pt[1], pt[0]] for pt in seg] for seg in coords if len(seg) >= 2]
    return []


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    # ── Lignes ───────────────────────────────────────────────────────────────
    lignes_path = sys.argv[1]
    print(f"Lecture des lignes : {lignes_path}")
    with open(lignes_path, encoding='utf-8') as f:
        gj = json.load(f)

    features = gj.get('features', [])
    print(f"  {len(features)} features trouvées")

    lines = []
    modes_vus = {}
    for feat in features:
        props = feat.get('properties', {}) or {}
        geom  = feat.get('geometry', {}) or {}

        raw_mode = get(props, MODE_KEYS)
        mode = normaliser_mode(raw_mode)
        if mode not in MODES_CARTE:
            continue

        color = get(props, COLOR_KEYS, '888888').lstrip('#')
        if not color or len(color) < 6:
            color = '888888'

        segs = extraire_coords(geom)
        # Décimer en préservant toujours le premier et le dernier point
        def decimer(seg):
            if len(seg) <= 2:
                return seg
            d = seg[::DECIMATE]
            if d[-1] != seg[-1]:
                d.append(seg[-1])
            return d
        segs = [decimer(seg) for seg in segs if len(seg) >= 2]

        lines.append({
            'id':     get(props, ID_KEYS),
            'code':   get(props, CODE_KEYS),
            'color':  color,
            'mode':   mode,
            'coords': segs,  # liste de segments, pas une liste plate de points
        })
        modes_vus[mode] = modes_vus.get(mode, 0) + 1

    print(f"  → {len(lines)} lignes retenues : {modes_vus}")

    if not lines:
        print("\n⚠️  Aucune ligne retenue. Affichage des propriétés du premier feature pour debug :")
        if features:
            print(json.dumps(features[0].get('properties', {}), indent=2, ensure_ascii=False))
        sys.exit(1)

    # ── Arrêts (optionnel) ───────────────────────────────────────────────────
    stops = []
    if len(sys.argv) >= 3:
        arrets_path = sys.argv[2]
        print(f"\nLecture des arrêts : {arrets_path}")
        with open(arrets_path, encoding='utf-8') as f:
            gj2 = json.load(f)
        for feat in gj2.get('features', []):
            props = feat.get('properties', {}) or {}
            geom  = feat.get('geometry', {}) or {}
            if geom.get('type') != 'Point':
                continue
            lon, lat = geom['coordinates'][0], geom['coordinates'][1]
            raw_mode = get(props, MODE_KEYS)
            mode = normaliser_mode(raw_mode)
            if mode not in MODES_CARTE:
                continue
            stops.append({'id': get(props, ID_KEYS), 'lat': lat, 'lon': lon, 'mode': mode})
        print(f"  → {len(stops)} arrêts retenus")
    else:
        print("\n(Pas de fichier arrêts fourni — seuls les tracés seront affichés)")

    # ── Export ───────────────────────────────────────────────────────────────
    output = {'stops': stops, 'lines': lines}
    out_path = 'paname-v3/assets/transport-data.json'
    raw = json.dumps(output, separators=(',', ':'), ensure_ascii=False)
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(raw)

    total_pts = sum(len(l['coords']) for l in lines)
    size_kb = len(raw.encode('utf-8')) / 1024
    print(f"\nTerminé !")
    print(f"  {len(lines)} lignes  •  {total_pts} points de tracé")
    print(f"  {len(stops)} arrêts")
    print(f"  Taille : {size_kb:.0f} KB")
    print(f"  → {out_path}")


if __name__ == '__main__':
    main()
