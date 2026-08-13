# Eclipse Globe — prototype

Globe 3D interactif affichant la bande de totalité de l'éclipse solaire totale du 2 août 2027.

## Lancer

Depuis ce dossier :

```bash
python3 -m http.server 4173
```

Puis ouvrir `http://localhost:4173`.

Le rendu 3D utilise Globe.gl / Three.js depuis un CDN, donc une connexion Internet est nécessaire pour charger la librairie et la texture terrestre.

## Données

`data/eclipses.json` contient une première série de points WGS-84 dérivés de la table NASA GSFC de l'éclipse du 2 août 2027. Les limites nord/sud et la ligne centrale permettent de reconstruire un polygone de totalité et une ligne centrale.

Source : **Eclipse Predictions by Fred Espenak, NASA's GSFC**
https://eclipse.gsfc.nasa.gov/SEpath/SEpath2001/SE2027Aug02Tpath.html

La NASA précise que ces prédictions ne corrigent pas encore les irrégularités du relief lunaire, qui peuvent déplacer localement les limites de l'ordre de 1 à 3 km.

## Import automatique

`scripts/import-nasa.mjs` contient un importeur pour transformer une table HTML NASA de ce format en JSON. Il pourra servir à alimenter la base avec d'autres éclipses.
