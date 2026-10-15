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
│   ├── mdt.js            Model Digital del Terreny (WCS de l'IDEE, una graella per petició)
│   ├── ortofoto.js       URL de l'ortofoto PNOA d'un requadre
│   ├── escalaColor.js    Escales de color (altitud, pendent, ombres)
│   └── magatzem.js       Embolcall d'IndexedDB
├── geometria/        Càlcul pur
│   ├── poligon.js        Àrees, orientació, neteja, densificació, punt dins
│   ├── projeccio.js      lat/lng <-> UTM 30N (proj4)
│   ├── terreny.js        Graella d'altituds amb interpolació bilineal
│   └── solid.js          Model 3D: triangulació restringida + sòlid tancat
├── exportadors/      stl.js (binari, mm) · obj.js (metres, amb UV)
├── model/zona.js     Una zona (parcel·la o polígon dibuixat)
├── pagaments/        GestorCompres + proveïdors (de moment, demo)
├── ui/               Components amb DOM/Leaflet/Three.js
│   ├── mapaBase.js       Mapa Leaflet amb OSM i ortofoto
│   ├── dibuixPoligon.js  Dibuix de polígons
│   ├── visor3d.js        Visor Three.js (r128)
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

## Procedència

Bona part del codi ve de Custòdia (`cadastre.js`, `ubicacions.js`,
`escalaColor.js`, `i18n.js`, el visor 3D). Custòdia encara no consumeix
el nucli: la migració es farà en una ronda a part.

## Llicència

**AGPL-3.0**. Vegeu [LICENSE](./LICENSE).
