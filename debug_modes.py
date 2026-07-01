import json

with open('lignes.geojson', encoding='utf-8') as f:
    gj = json.load(f)

# Tous les couples (clé, valeur) liés au mode/type
modes = {}
for feat in gj['features']:
    p = feat.get('properties', {}) or {}
    for k in p:
        if any(x in k.lower() for x in ['mode', 'type', 'transport', 'categorie', 'reseau']):
            val = str(p[k])
            modes.setdefault(k, set()).add(val)

print("Valeurs de mode/type présentes dans le dataset :")
for k, vals in sorted(modes.items()):
    print(f"  {k}: {sorted(vals)}")
