# Terra nucli — instruccions per a agents

## Què és
Codi compartit de les apps de la família Custòdia / Terra: serveis de dades públiques del territori (Cadastre, MDT de
l'IGN i mundial, ortofoto, cerca de llocs), geometria, visor 3D, exportadors (STL, OBJ, ZIP), pagaments, traduccions i
estils base. JavaScript en mòduls ES, sense build ni dependències de npm. Llicència MPL-2.0; repositori públic.

## Com el fan servir les apps
Cada app en porta una CÒPIA a la seva carpeta `nucli/`, feta amb el seu `actualitzar-nucli.sh`, que anota el commit
d'origen a `nucli/VERSIO`. Els canvis es fan sempre aquí, mai a la còpia d'una app. Després:
1. A l'app que el necessita: `./actualitzar-nucli.sh`, `node nucli/eines/verificar.mjs` i les seves proves.
2. Si un mòdul nou entra a la càrrega de l'app, cal afegir-lo a la llista del service worker de l'app
   (`verificar.mjs` ho avisa) i pujar `NOM_CACHE`.
3. Les altres apps no s'actualitzen soles: si el canvi trenca una API o corregeix un error que les afecta, digues-ho a Mario.

## Estructura
- `js/serveis/`: consultes externes i dades, sense DOM de pàgina ni Leaflet (cadastre, mdt, mdtMundial, fontsDades, ortofoto...)
- `js/geometria/`: càlcul pur (polígons, projecció UTM, graella del terreny, gradients de Horn, sòlid 3D)
- `js/exportadors/`, `js/model/`, `js/paisos/`, `js/pagaments/`, `js/i18n/` (el català és la clau), `js/dades/`
- `js/ui/`: components amb DOM, Leaflet o Three.js (mapaBase, dibuixPoligon, visor3d, avisos, descarrega)
- `css/nucli.css`: paleta i components; `img/abelluco/`: logotips
- `eines/verificar.mjs` i `eines/servidor.mjs`: s'executen des de l'arrel de cada app

## Normes
- Codi simple, llegible i fàcil de mantenir. Sense dependències noves sense preguntar.
- `js/serveis/` i `js/geometria/` no toquen el DOM: la interfície va a `js/ui/`.
- Coordenades del model 3D: x = est, y = nord, z = amunt; el visor les gira a Three.js (una rotació, no un mirall).
- Exageració vertical 1 per defecte. Dins d'Espanya, dades de l'IGN; a la resta del món, les mundials (`fontsDades.js`).
- Pensa en totes les apps que fan servir el mòdul: no canviïs una funció exportada sense comprovar qui la crida.
- No toquis fitxers fora dels que demana la tasca.
- Mai escriguis claus, contrasenyes ni tokens en cap fitxer.
- Cap canvi es fusiona a main sense l'OK de Mario.

## Compilar i provar
No es compila. Es prova des d'una app que fa servir el mòdul, després de copiar-hi el nucli:
```
./actualitzar-nucli.sh
node nucli/eines/verificar.mjs
node nucli/eines/servidor.mjs
```
i les proves en Node de l'app (`proves/*.prova.mjs`). El nucli encara no té proves pròpies.

## Publicar
El repositori és públic: cap push sense l'OK de Mario.
