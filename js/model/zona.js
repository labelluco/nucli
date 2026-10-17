// Una zona del territori: una parcel·la del Cadastre o un polígon
// dibuixat a mà. Dades pures (sense UI ni IO), en el mateix estil que
// Parcela i Geometria de Custòdia, però amb la geometria en UTM (parts
// amb forats), que és la que fan servir el càlcul 3D i els exportadors.
//
// crs: sistema de coordenades de les parts. Les zones desades abans que
// existís (totes d'Espanya peninsular) no el porten: EPSG:25830.

export const ORIGENS_ZONA = ['referencia', 'poligon-parcela', 'mapa', 'dibuix'];

export class Zona {
  constructor({
    id = null,
    nom,
    origen,
    parts,
    coordenades,
    referenciaCadastral = null,
    descripcio = null,
    municipi = null,
    provincia = null,
    superficie = null,
    crs = 'EPSG:25830',
    dataCreacio = new Date().toISOString(),
  }) {
    if (!ORIGENS_ZONA.includes(origen)) throw new Error(`Zona: origen desconegut "${origen}"`);
    if (!Array.isArray(parts) || parts.length === 0) throw new Error('Zona: cal almenys una part');
    this.id = id;
    this.nom = nom;
    this.origen = origen;
    this.parts = parts;
    this.coordenades = coordenades;
    this.referenciaCadastral = referenciaCadastral;
    this.descripcio = descripcio;
    this.municipi = municipi;
    this.provincia = provincia;
    this.superficie = superficie;
    this.crs = crs;
    this.dataCreacio = dataCreacio;
  }

  toObject() {
    const objecte = { ...this };
    if (objecte.id == null) delete objecte.id;
    return objecte;
  }

  static fromObject(objecte) {
    return new Zona(objecte);
  }
}
