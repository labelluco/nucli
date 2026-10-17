# Nucli

Codi compartit per les apps de la família
[Custòdia](https://codeberg.org/mario_escuder/custodia): serveis de dades
públiques del territori, geometria, visor 3D, exportadors, pagaments,
traduccions i estils base. JavaScript (mòduls ES), sense build ni
dependències de npm.

## Com el fan servir les apps

Cada app en porta una **còpia** a la seva carpeta `nucli/`, feta amb el
seu `actualitzar-nucli.sh`, que també anota el commit d'origen a
`nucli/VERSIO`. No s'edita mai la còpia: els canvis es fan aquí i es
tornen a copiar.

## Contingut

```
js/
├── serveis/          Consultes externes i dades (sense DOM de pàgina ni Leaflet)
│   ├── cadastre.js       Parcel·les: per referència, polígon/parcel·la, punt o requadre
│   ├── ubicacions.js     Províncies i municipis
│   ├── mdt.js            MDT de l'IGN (WCS de l'IDEE; Península, Balears i Canàries)
│   ├── mdtMundial.js     Relleu de tot el món (Terrain Tiles d'AWS, format Terrarium)
│   ├── fontsDades.js     Quina font (relleu + imatge) toca a cada zona, segons el lloc
│   ├── llocs.js          Cerca de llocs a tot el món (Nominatim, OpenStreetMap)
│   ├── generadorModel.js De zona a model 3D (MDT + sòlid + URL de l'ortofoto)
│   ├── ortofoto.js       URL de la PNOA (Espanya) o de Sentinel-2 2016 (món)
│   ├── escalaColor.js    Escales de color (altitud, pendent, ombres)
│   └── magatzem.js       Embolcall d'IndexedDB
├── geometria/        Càlcul pur
│   ├── poligon.js        Àrees, orientació, neteja, densificació, punt dins
│   ├── projeccio.js      lat/lng <-> UTM (30N per defecte, 28N Canàries, fus automàtic al món)
│   ├── terreny.js        Graella d'altituds amb interpolació bilineal
│   └── solid.js          Model 3D: triangulació restringida + sòlid tancat
├── exportadors/      stl.js (binari, mm) · obj.js (metres, amb UV)
├── model/zona.js     Una zona (parcel·la o polígon dibuixat), amb el seu sistema (crs)
├── paisos/paisos.js  Països amb dades pròpies (Espanya) i la resta del món
├── pagaments/        GestorCompres + proveïdors (de moment, demo)
├── ui/               Components amb DOM/Leaflet/Three.js
│   ├── mapaBase.js       Mapa Leaflet amb OSM i ortofoto
│   ├── dibuixPoligon.js  Dibuix de polígons
│   ├── visor3d.js        Visor Three.js (r128): ortofoto, altitud, pendent o neutre, i cotes
│   ├── avisos.js         Notificacions breus
│   └── descarrega.js     Desar fitxers generats
└── i18n/             i18n.js (català com a clau) + es.js
css/nucli.css         Paleta i components
eines/
├── verificar.mjs     Verificacions de cada ronda (executar des de l'app)
└── servidor.mjs      Servidor estàtic per provar en local
```

## Convencions

- Coordenades del model 3D: x = est, y = nord, z = amunt (metres UTM i
  altitud). El visor les gira a l'espai de Three.js (Y amunt, Z = -nord),
  una rotació i no un mirall.
- Exageració vertical 1 per defecte: fidelitat geomètrica.
- Les traduccions fan servir el text català com a clau.

## Tot el món

Cada zona es treballa en el sistema UTM del seu lloc (crs), i la font de
dades la tria el lloc (fontsDades.js), no la interfície: dins d'Espanya,
l'IGN (MDT de 5 m i PNOA); a la resta del món, Terrain Tiles (~30 m) i
Sentinel-2 cloudless 2016 (10 m, CC BY 4.0: l'única versió amb ús
comercial permès). Si l'IGN no té dades d'una zona (frontera), el
generador torna sol a les mundials. Afegir un país és afegir-lo a
paisos.js i les seves fonts a fontsDades.js.

**Apps que actualitzin la còpia del nucli:** cadastre.js i
generadorModel.js ara importen paisos/paisos.js, serveis/fontsDades.js,
serveis/mdtMundial.js i serveis/ortofoto.js; cal afegir-los a la llista
del service worker (verificar.mjs ho avisa).

## Procedència

Bona part del codi ve de Custòdia (`cadastre.js`, `ubicacions.js`,
`escalaColor.js`, `i18n.js`, el visor 3D). Custòdia ja en consumeix
Cadastre, ubicacions, MDT, escales de color, traduccions, estils (la
disposició de barra superior i panell flotant ve de Terra 3D) i el visor
3D amb el generador de models (que també ve de Terra 3D; Terra 3D encara
en té la seva còpia a js/serveis/generadorModel.js). Custòdia conserva el
seu visor antic només per quan no hi ha connexió.

## Llicència

**AGPL-3.0**. Vegeu [LICENSE](./LICENSE).
