// Dibuix d'un rectangle orientat al nord sobre un mapa Leaflet: un toc a
// una cantonada i un altre a l'oposada (entre tots dos, amb ratolí, el
// rectangle segueix el cursor). Després, les cantonades s'arrosseguen per
// canviar-ne la mida i el centre per moure'l.
//
// El rectangle es construeix en metres, en el sistema UTM del lloc (el
// mateix que farà servir el model 3D), no en píxels del mapa: així els
// angles són de 90° de debò i les parets del model imprès queden rectes.
// Sobre el mapa (Web Mercator) es pot veure una mica girat respecte a la
// pantalla per la convergència de meridians: és el rectangle correcte
// sobre el terreny.
//
// Mateixa interfície que DibuixPoligon (activar, desactivar, desfer,
// netejar, punts, onCanvi), perquè l'app les pugui intercanviar; a més,
// exposa crs i exteriorUtm (les cantonades exactes, sense passar per lat/lng).

import { latLngAUtm, utmALatLng } from '../geometria/projeccio.js';
import { crsPer } from '../paisos/paisos.js';

/**
 * Les quatre cantonades d'un rectangle orientat al nord definit per dues
 * cantonades oposades qualssevol, en sentit antihorari des de la sud-oest.
 * @param {[number, number]} a @param {[number, number]} b En metres (x = est, y = nord)
 */
export function cantonadesRectangle(a, b) {
  const minX = Math.min(a[0], b[0]);
  const maxX = Math.max(a[0], b[0]);
  const minY = Math.min(a[1], b[1]);
  const maxY = Math.max(a[1], b[1]);
  return [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];
}

export class DibuixRectangle {
  /**
   * @param {L.Map} mapa
   * @param {{color?: string, onCanvi?: (punts: Array<[number, number]>) => void}} opcions
   */
  constructor(mapa, { color = '#396a49', onCanvi = () => {} } = {}) {
    this._mapa = mapa;
    this._color = color;
    this._onCanvi = onCanvi;
    this._capa = L.layerGroup();
    this._actiu = false;
    this.crs = null;
    this._a = null; // primera cantonada (UTM)
    this._b = null; // cantonada oposada (UTM), null mentre es dibuixa
    this._cursor = null; // posició provisional de la segona cantonada
    this._gestorClic = (event) => this._clic(event.latlng);
    this._gestorMoviment = (event) => this._moviment(event.latlng);
  }

  /** Cantonades exactes en UTM (sistema this.crs), o [] si encara no hi ha rectangle. */
  get exteriorUtm() {
    return this._a && this._b ? cantonadesRectangle(this._a, this._b) : [];
  }

  /** Cantonades en [lat, lng] (les quatre, o la primera mentre es dibuixa). */
  get punts() {
    if (this._a && this._b) return this.exteriorUtm.map((p) => utmALatLng(p, this.crs));
    return this._a ? [utmALatLng(this._a, this.crs)] : [];
  }

  /** Amplada i alçada en metres (o null). */
  get mides() {
    if (!this._a || !this._b) return null;
    return { ample: Math.abs(this._b[0] - this._a[0]), alt: Math.abs(this._b[1] - this._a[1]) };
  }

  activar() {
    if (this._actiu) return;
    this._actiu = true;
    this._capa.addTo(this._mapa);
    this._mapa.on('click', this._gestorClic);
    this._mapa.on('mousemove', this._gestorMoviment);
    this._mapa.getContainer().classList.add('mapa--dibuixant');
    this._pintar();
  }

  desactivar() {
    if (!this._actiu) return;
    this._actiu = false;
    this._mapa.off('click', this._gestorClic);
    this._mapa.off('mousemove', this._gestorMoviment);
    this._mapa.getContainer().classList.remove('mapa--dibuixant');
    this._capa.remove();
  }

  /** Desfer: treu la segona cantonada (es torna a dibuixar des de la primera), o la primera. */
  desfer() {
    if (this._b) this._b = null;
    else this._a = null;
    this._cursor = null;
    this._canvi();
  }

  netejar() {
    this._a = null;
    this._b = null;
    this._cursor = null;
    this._canvi();
  }

  _clic(latlng) {
    const punt = [latlng.lat, latlng.lng];
    if (!this._a || this._b) {
      // Primer toc, o un toc nou quan ja n'hi havia un: rectangle nou.
      this.crs = crsPer(punt);
      this._a = latLngAUtm(punt, this.crs);
      this._b = null;
    } else {
      this._b = latLngAUtm(punt, this.crs);
      // Dos tocs al mateix lloc no fan cap rectangle.
      if (Math.abs(this._b[0] - this._a[0]) < 1 || Math.abs(this._b[1] - this._a[1]) < 1) this._b = null;
    }
    this._cursor = null;
    this._canvi();
  }

  _moviment(latlng) {
    if (!this._a || this._b) return;
    this._cursor = latLngAUtm([latlng.lat, latlng.lng], this.crs);
    this._pintarForma(cantonadesRectangle(this._a, this._cursor), true);
  }

  _canvi() {
    this._pintar();
    this._onCanvi(this.punts);
  }

  _aLatLng(cantonades) {
    return cantonades.map((p) => utmALatLng(p, this.crs));
  }

  _pintarForma(cantonades, provisional) {
    this._forma?.remove();
    this._forma = L.polygon(this._aLatLng(cantonades), {
      color: this._color,
      weight: 3,
      fillOpacity: 0.2,
      dashArray: provisional ? '6 6' : null,
      interactive: false,
    }).addTo(this._capa);
  }

  _pintar() {
    this._capa.clearLayers();
    this._forma = null;
    if (!this._a) return;

    if (!this._b) {
      // Només la primera cantonada: un punt fix (i, amb ratolí, la forma provisional).
      L.marker(utmALatLng(this._a, this.crs), {
        icon: L.divIcon({ className: 'vertex-dibuix', iconSize: [16, 16] }),
        interactive: false,
        keyboard: false,
      }).addTo(this._capa);
      if (this._cursor) this._pintarForma(cantonadesRectangle(this._a, this._cursor), true);
      return;
    }

    const cantonades = this.exteriorUtm;
    this._pintarForma(cantonades, false);

    // Cantonades: en arrossegar-ne una, l'oposada queda fixa.
    cantonades.forEach((cantonada, i) => {
      const oposada = cantonades[(i + 2) % 4];
      const marcador = L.marker(utmALatLng(cantonada, this.crs), {
        draggable: true,
        icon: L.divIcon({ className: 'vertex-dibuix', iconSize: [16, 16] }),
        keyboard: false,
      });
      marcador.on('drag', (event) => {
        const { lat, lng } = event.target.getLatLng();
        this._pintarForma(cantonadesRectangle(oposada, latLngAUtm([lat, lng], this.crs)), false);
      });
      marcador.on('dragend', (event) => {
        const { lat, lng } = event.target.getLatLng();
        const nova = latLngAUtm([lat, lng], this.crs);
        if (Math.abs(nova[0] - oposada[0]) >= 1 && Math.abs(nova[1] - oposada[1]) >= 1) {
          this._a = oposada;
          this._b = nova;
        }
        this._canvi();
      });
      marcador.on('click', (event) => L.DomEvent.stop(event));
      marcador.addTo(this._capa);
    });

    // Centre: arrossegar-lo mou tot el rectangle.
    const centre = [(cantonades[0][0] + cantonades[2][0]) / 2, (cantonades[0][1] + cantonades[2][1]) / 2];
    const marcadorCentre = L.marker(utmALatLng(centre, this.crs), {
      draggable: true,
      icon: L.divIcon({ className: 'centre-dibuix', html: '✥', iconSize: [24, 24] }),
      keyboard: false,
    });
    const desplacat = (event) => {
      const { lat, lng } = event.target.getLatLng();
      const [x, y] = latLngAUtm([lat, lng], this.crs);
      return [x - centre[0], y - centre[1]];
    };
    marcadorCentre.on('drag', (event) => {
      const [dx, dy] = desplacat(event);
      this._pintarForma(cantonades.map(([x, y]) => [x + dx, y + dy]), false);
    });
    marcadorCentre.on('dragend', (event) => {
      const [dx, dy] = desplacat(event);
      this._a = [this._a[0] + dx, this._a[1] + dy];
      this._b = [this._b[0] + dx, this._b[1] + dy];
      this._canvi();
    });
    marcadorCentre.on('click', (event) => L.DomEvent.stop(event));
    marcadorCentre.addTo(this._capa);
  }
}
