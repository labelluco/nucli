// Base comuna dels informes PDF de les apps Terra: una pàgina A4 vertical
// amb la capçalera de color, títols de secció, taules de dada i valor,
// paràgrafs, un dibuix a escala amb el nord amunt, fotos i el peu de pàgina.
// Cada app hi posa el contingut (vegeu, per exemple, l'informe de parcel·la
// de Terra Parcel·les).
//
// Es fa amb jsPDF (per CDN, versió fixa), que es carrega només la primera
// vegada que es genera un informe: la majoria de visites no el necessiten.
// Les apps que vulguin fer informes fora de línia afegeixen URL_JSPDF a les
// llibreries del seu service worker.
//
// Les fonts estàndard de PDF (Helvetica) només tenen els caràcters de
// l'europeu occidental (WinAnsi): n'hi ha prou per al català, el castellà i
// l'anglès ("·", "²", "«»", "€" hi són), però no per a "−", "→" o "≥".
// textPdf() els canvia per uns d'equivalents, i la resta (emojis...) per "?".
// Tot el text que passa per aquest mòdul ja hi passa.
//
// Ús:
//   const informe = await crearInforme({ app: 'Terra Parcel·les', titol: 'Informe de la parcel·la', nom });
//   informe.titol('Dades');
//   informe.taula([['Superfície', '1.234 m²'], ...]);
//   informe.dibuix([{ punts: [[x, y], ...], color: '#d9a514' }]);
//   const { imatge, requadre, aMetres } = await mapaTesseles('pnoa', centre, { ample: 300, alt: 186 });
//   informe.mapa({ imatge, requadre, anells: [{ punts: anell.map(aMetres), color }] });
//
// Les imatges (mapes i fotos) van en data URL JPEG. Per fer-les d'un canvas,
// toDataURL i no toBlob: toBlob pot trigar un segon per imatge.
//   await informe.desar('parcela.pdf', { peu: 'Dades: Dirección General del Catastro.' });
import { t, idiomaActual } from '../i18n/i18n.js';
import { descarregarFitxer } from './descarrega.js';

export const URL_JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

// Mides en mil·límetres (A4 vertical).
export const PAGINA = { ample: 210, alt: 297 };
export const MARGE = 15;
export const AMPLE_UTIL = PAGINA.ample - 2 * MARGE;
const LIMIT_INFERIOR = PAGINA.alt - 22;
const COLOR_PRIMARI = [57, 106, 73];
const COLOR_MUT = [107, 107, 99];
const COLOR_LINIA = [226, 221, 210];

let carregaJsPdf = null;
export function carregarJsPdf() {
  if (globalThis.jspdf) return Promise.resolve(globalThis.jspdf);
  carregaJsPdf ??= new Promise((resoldre, rebutjar) => {
    const script = document.createElement('script');
    script.src = URL_JSPDF;
    script.onload = () => resoldre(globalThis.jspdf);
    script.onerror = () => {
      carregaJsPdf = null;
      script.remove();
      rebutjar(new Error(t('No s\'ha pogut carregar el generador de PDF. Comprova la connexió.')));
    };
    document.head.appendChild(script);
  });
  return carregaJsPdf;
}

// Els caràcters de Windows-1252 que no són de Latin-1 (de 0x80 a 0x9f).
const WINDOWS_1252 = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const EQUIVALENTS = { '−': '-', '→': '>', '←': '<', '≥': '>=', '≤': '<=', '≈': '~', '×': 'x', ' ': ' ', ' ': ' ' };

/** El text amb només caràcters que es poden escriure amb Helvetica (WinAnsi). */
export function textPdf(text) {
  return [...String(text ?? '')]
    .map((c) => EQUIVALENTS[c] ?? c)
    .map((c) => (c.codePointAt(0) <= 0xff || WINDOWS_1252.includes(c) ? c : '?'))
    .join('')
    .replace(/[\u0080-\u009f]/g, '');
}

/**
 * Requadre dels punts amb un marge, d'una mida mínima i amb la proporció
 * alçada / amplada demanada (per a mapa()). Càlcul pur.
 * @param {[number, number][]} punts En metres
 * @param {number} proporcio alçada / amplada
 * @param {{marge?: number, minim?: number}} [opcions] marge: fracció de la mida
 *   a cada costat; minim: amplada mínima en metres
 */
export function requadreAmbProporcio(punts, proporcio, { marge = 0.15, minim = 0 } = {}) {
  const xs = punts.map((p) => p[0]);
  const ys = punts.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  let ample = (Math.max(...xs) - Math.min(...xs)) * (1 + 2 * marge);
  let alt = (Math.max(...ys) - Math.min(...ys)) * (1 + 2 * marge);
  ample = Math.max(ample, alt / proporcio, minim, 1);
  alt = ample * proporcio;
  return { minX: cx - ample / 2, maxX: cx + ample / 2, minY: cy - alt / 2, maxY: cy + alt / 2 };
}

/**
 * Comença un informe (la primera pàgina, amb la capçalera).
 * @param {{app: string, titol: string, nom: string, subtitol?: string|null, data?: Date}} opcions
 */
export async function crearInforme({ app, titol, nom, subtitol = null, data = new Date() }) {
  const { jsPDF } = await carregarJsPdf();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = MARGE;

  // --- Capçalera ---
  doc.setFillColor(...COLOR_PRIMARI).rect(0, 0, PAGINA.ample, 30, 'F');
  doc.setTextColor(255).setFont('helvetica', 'normal').setFontSize(10);
  doc.text(textPdf(app), MARGE, 11);
  doc.setFont('helvetica', 'bold').setFontSize(18);
  doc.text(textPdf(titol), MARGE, 21);
  doc.setFont('helvetica', 'normal').setFontSize(10);
  doc.text(textPdf(data.toLocaleDateString(idiomaActual(), { day: 'numeric', month: 'long', year: 'numeric' })), PAGINA.ample - MARGE, 21, { align: 'right' });
  doc.setTextColor(0);
  y = 40;
  doc.setFont('helvetica', 'bold').setFontSize(14);
  const liniesNom = doc.splitTextToSize(textPdf(nom), AMPLE_UTIL);
  doc.text(liniesNom, MARGE, y);
  y += (liniesNom.length - 1) * 6 + 4;
  if (subtitol) {
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...COLOR_MUT);
    const linies = doc.splitTextToSize(textPdf(subtitol), AMPLE_UTIL);
    doc.text(linies, MARGE, y + 1);
    y += linies.length * 4.5;
    doc.setTextColor(0);
  }

  /** Passa a una pàgina nova si no hi caben mm més. */
  const assegurarEspai = (mm) => {
    if (y + mm > LIMIT_INFERIOR) {
      doc.addPage();
      y = MARGE;
    }
  };

  return {
    doc,
    /** On és l'escriptura (mm des de dalt de la pàgina). */
    get y() {
      return y;
    },
    set y(valor) {
      y = valor;
    },
    assegurarEspai,

    /** Títol de secció. seguent: espai del que ve després, perquè el títol no quedi sol al peu. */
    titol(text, seguent = 10) {
      assegurarEspai(10 + seguent);
      y += 4;
      doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...COLOR_PRIMARI);
      doc.text(textPdf(text), MARGE, y);
      y += 6;
      doc.setTextColor(0);
    },

    /** Files [etiqueta, valor]; les buides (null, false) no surten. */
    taula(files) {
      doc.setFontSize(9.5);
      for (const fila of files) {
        if (!fila) continue;
        const [etiqueta, valor] = fila;
        const linies = doc.splitTextToSize(textPdf(valor), AMPLE_UTIL * 0.6);
        const alcada = Math.max(1, linies.length) * 4.6 + 1.6;
        assegurarEspai(alcada);
        doc.setFont('helvetica', 'normal').setTextColor(...COLOR_MUT);
        doc.text(doc.splitTextToSize(textPdf(etiqueta), AMPLE_UTIL * 0.36), MARGE, y + 3.8);
        doc.setFont('helvetica', 'bold').setTextColor(0);
        doc.text(linies, MARGE + AMPLE_UTIL * 0.38, y + 3.8);
        y += alcada;
        doc.setDrawColor(...COLOR_LINIA).setLineWidth(0.2).line(MARGE, y, MARGE + AMPLE_UTIL, y);
      }
      y += 2;
    },

    /** Text corregut, partit en línies (i en pàgines, si cal). */
    paragraf(text, { mida = 9.5, mut = false } = {}) {
      doc.setFont('helvetica', 'normal').setFontSize(mida).setTextColor(...(mut ? COLOR_MUT : [0, 0, 0]));
      const interliniat = mida * 0.47;
      for (const linia of doc.splitTextToSize(textPdf(text), AMPLE_UTIL)) {
        assegurarEspai(interliniat);
        doc.text(linia, MARGE, y + interliniat * 0.8);
        y += interliniat;
      }
      y += 1.5;
      doc.setTextColor(0);
    },

    /** Una nota petita en gris (avisos, llegendes, d'on venen les dades). */
    nota(text) {
      this.paragraf(text, { mida: 8.5, mut: true });
    },

    /**
     * Un dibuix a escala amb el nord amunt, una barra d'escala i la fletxa del nord.
     * Els punts són en metres en un pla local (x cap a l'est, y cap al nord).
     * L'alçada s'adapta al que queda de pàgina (entre minim i alt): així no queda
     * mitja pàgina en blanc.
     * @param {{punts: [number, number][], color: string, gruix?: number, discontinu?: boolean}[]} anells
     */
    dibuix(anells, { alt = 110, minim = 70 } = {}) {
      const disponible = LIMIT_INFERIOR - y - 4;
      const alcada = disponible >= minim ? Math.min(alt, disponible) : alt;
      assegurarEspai(alcada + 4);
      dibuixarAEscala(doc, anells, { x: MARGE, y, ample: AMPLE_UTIL, alt: alcada });
      y += alcada + 4;
    },

    /**
     * Un mapa: una imatge (ortofoto, mapa topogràfic...) que cobreix exactament
     * el requadre, amb anells i marques a sobre, barra d'escala i nord. Les
     * coordenades són en metres, en el pla de la imatge, amb el nord amunt
     * (vegeu mapaTesseles a serveis/ortofoto.js). L'alçada surt de la
     * proporció del requadre.
     * @param {{dades: string}} imatge data URL JPEG (vegeu mapaTesseles)
     * @param {{minX: number, minY: number, maxX: number, maxY: number}} requadre
     * @param {{punts: [number, number][], color: string, gruix?: number}[]} [anells]
     * @param {{punt: [number, number], radi: number, color: string}[]} [marques] cercles (radi en mm)
     */
    mapa({ imatge, requadre, anells = [], marques = [] }) {
      const alcada = (AMPLE_UTIL * (requadre.maxY - requadre.minY)) / (requadre.maxX - requadre.minX);
      assegurarEspai(alcada + 4);
      dibuixarMapa(doc, { imatge, requadre, anells, marques }, { x: MARGE, y, ample: AMPLE_UTIL, alt: alcada });
      y += alcada + 4;
    },

    /**
     * Imatges (fotos) en columnes, amb un peu opcional sota cada una.
     * @param {{dades: string, ample: number, alt: number, peu?: string}[]} imatges
     *   dades: data URL JPEG; ample i alt: en píxels (per a la proporció).
     */
    imatges(imatges, { columnes = 2, altMaxim = 80 } = {}) {
      const separacio = 5;
      const ampleCasella = (AMPLE_UTIL - separacio * (columnes - 1)) / columnes;
      for (let i = 0; i < imatges.length; i += columnes) {
        const fila = imatges.slice(i, i + columnes).map((imatge) => {
          const escala = Math.min(ampleCasella / imatge.ample, altMaxim / imatge.alt);
          return { ...imatge, w: imatge.ample * escala, h: imatge.alt * escala };
        });
        const ambPeu = fila.some((imatge) => imatge.peu);
        const alcada = Math.max(...fila.map((imatge) => imatge.h)) + (ambPeu ? 5 : 0);
        assegurarEspai(alcada + separacio);
        fila.forEach((imatge, columna) => {
          const x = MARGE + columna * (ampleCasella + separacio) + (ampleCasella - imatge.w) / 2;
          doc.addImage(imatge.dades, 'JPEG', x, y, imatge.w, imatge.h);
          doc.setDrawColor(...COLOR_LINIA).setLineWidth(0.2).rect(x, y, imatge.w, imatge.h);
          if (imatge.peu) {
            doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...COLOR_MUT);
            doc.text(textPdf(imatge.peu), x, y + imatge.h + 3.6);
            doc.setTextColor(0);
          }
        });
        y += alcada + separacio;
      }
    },

    /** Posa el peu a totes les pàgines i desa (o comparteix, a Android) el PDF. */
    async desar(nomFitxer, { peu = null } = {}) {
      const pagines = doc.getNumberOfPages();
      for (let i = 1; i <= pagines; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...COLOR_MUT);
        if (peu) doc.text(doc.splitTextToSize(textPdf(peu), AMPLE_UTIL - 30), MARGE, PAGINA.alt - 10);
        doc.text(textPdf(`${app} · ${i}/${pagines}`), PAGINA.ample - MARGE, PAGINA.alt - 10, { align: 'right' });
      }
      await descarregarFitxer(doc.output('blob'), nomFitxer, 'application/pdf');
    },
  };
}

function dibuixarAEscala(doc, anells, caixa) {
  const tots = anells.flatMap((a) => a.punts);
  const minX = Math.min(...tots.map((p) => p[0]));
  const maxX = Math.max(...tots.map((p) => p[0]));
  const minY = Math.min(...tots.map((p) => p[1]));
  const maxY = Math.max(...tots.map((p) => p[1]));
  // Marge interior perquè la barra d'escala i el nord no tapin el dibuix.
  const escala = Math.min((caixa.ample - 24) / Math.max(1, maxX - minX), (caixa.alt - 24) / Math.max(1, maxY - minY));
  const cx = caixa.x + caixa.ample / 2;
  const cy = caixa.y + caixa.alt / 2;
  const aPagina = ([x, y]) => [cx + (x - (minX + maxX) / 2) * escala, cy - (y - (minY + maxY) / 2) * escala];

  doc.setDrawColor(...COLOR_LINIA).setLineWidth(0.2).rect(caixa.x, caixa.y, caixa.ample, caixa.alt);
  dibuixarAnells(doc, anells, aPagina);
  dibuixarEscalaINord(doc, caixa, escala);
}

/** Un mapa: la imatge del requadre a tota la caixa, amb els anells i les marques a sobre. */
function dibuixarMapa(doc, { imatge, requadre, anells, marques }, caixa) {
  const escala = caixa.ample / (requadre.maxX - requadre.minX);
  const aPagina = ([x, y]) => [caixa.x + (x - requadre.minX) * escala, caixa.y + (requadre.maxY - y) * escala];
  doc.addImage(imatge.dades, 'JPEG', caixa.x, caixa.y, caixa.ample, caixa.alt);
  dibuixarAnells(doc, anells, aPagina);
  for (const { punt, radi, color, gruix = 0.8 } of marques) {
    const [x, y] = aPagina(punt);
    doc.setDrawColor(255).setLineWidth(gruix + 0.8).circle(x, y, radi, 'S');
    doc.setDrawColor(...hexARgb(color)).setLineWidth(gruix).circle(x, y, radi, 'S');
  }
  // L'escala i el nord sobre un fons blanc, perquè es llegeixin sobre la foto.
  doc.setFillColor(255, 255, 255);
  doc.rect(caixa.x + 1.5, caixa.y + caixa.alt - 11, caixa.ample / 4 + 6, 9.5, 'F');
  doc.rect(caixa.x + caixa.ample - 11, caixa.y + 1.5, 8, 13, 'F');
  dibuixarEscalaINord(doc, caixa, escala);
  doc.setDrawColor(...COLOR_LINIA).setLineWidth(0.2).rect(caixa.x, caixa.y, caixa.ample, caixa.alt);
}

function dibuixarAnells(doc, anells, aPagina) {
  for (const { punts, color, gruix = 0.6, discontinu = false } of anells) {
    if (punts.length < 2) continue;
    const enPagina = punts.map(aPagina);
    doc.setDrawColor(...hexARgb(color)).setLineWidth(gruix);
    if (discontinu) doc.setLineDashPattern([1.6, 1.2], 0);
    const relatius = enPagina.slice(1).map((p, i) => [p[0] - enPagina[i][0], p[1] - enPagina[i][1]]);
    doc.lines(relatius, enPagina[0][0], enPagina[0][1], [1, 1], 'S', true);
    if (discontinu) doc.setLineDashPattern([], 0);
  }
}

/** La barra d'escala (a baix a l'esquerra) i la fletxa del nord (a dalt a la dreta). escala: mm per metre. */
function dibuixarEscalaINord(doc, caixa, escala) {
  const nf = (valor) => valor.toLocaleString(idiomaActual(), { maximumFractionDigits: 0 });
  // Barra d'escala: una longitud "rodona" de més o menys un quart de l'ample.
  const objectiu = caixa.ample / 4 / escala;
  const potencia = 10 ** Math.floor(Math.log10(objectiu));
  const metres = [1, 2, 5, 10].map((f) => f * potencia).filter((v) => v <= objectiu).pop() ?? potencia;
  const xb = caixa.x + 4;
  const yb = caixa.y + caixa.alt - 4;
  doc.setDrawColor(0).setLineWidth(0.5).line(xb, yb, xb + metres * escala, yb);
  doc.setLineWidth(0.3).line(xb, yb - 1, xb, yb + 1).line(xb + metres * escala, yb - 1, xb + metres * escala, yb + 1);
  doc.setTextColor(0).setFont('helvetica', 'normal').setFontSize(7.5);
  const text = metres >= 1000 ? `${textPdf(nf(metres / 1000))} km` : `${textPdf(nf(metres))} m`;
  doc.text(text, xb + (metres * escala) / 2, yb - 1.6, { align: 'center' });
  // Nord.
  const xn = caixa.x + caixa.ample - 7;
  const yn = caixa.y + 5;
  doc.setFillColor(0).triangle(xn, yn, xn - 1.8, yn + 5, xn + 1.8, yn + 5, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(8).text('N', xn, yn + 9, { align: 'center' });
}

function hexARgb(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
