import json

with open('lignes.geojson', encoding='utf-8') as f:
    gj = json.load(f)

for feat in gj['features']:
    p = feat.get('properties', {})
    vals = ' '.join(str(v) for v in p.values()).lower()
    if 'funicular' in vals or 'montmartre' in vals:
        print(json.dumps(p, indent=2, ensure_ascii=False))
        break
else:
    print("Pas trouvé — liste des modes uniques :")
    modes = set()
    for feat in gj['features']:
        p = feat.get('properties', {})
        for k in p:
            if 'mode' in k.lower() or 'type' in k.lower():
                modes.add(f"{k} = {p[k]}")
    for m in sorted(modes):
        print(m)
