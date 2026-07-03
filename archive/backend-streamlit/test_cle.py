import requests

API_KEY = "rNhB9Ig3dR3W6AbHQLr5MiTiqR9vidrA"
url = "https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/stop_areas/stop_area:IDFM:71410/departures?count=1"
headers = {'apiKey': API_KEY.strip()}

reponse = requests.get(url, headers=headers)
print("Statut :", reponse.status_code)
print("Réponse :", reponse.text[:150])