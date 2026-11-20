// Exportació a 3MF, el format de fabricació 3D que fan servir els
// programes de laminat moderns (PrusaSlicer, Bambu Studio, Cura...).
// Respecte a l'STL: les unitats hi van dites (aquí, mil·límetres), els
// vèrtexs compartits s'escriuen una sola vegada i un sol fitxer pot portar
// diversos objectes (les peces d'un mosaic), cadascun al seu lloc del llit.
//
// Un .3mf és un ZIP (aquí, sense compressió: zip.js) amb tres fitxers:
//  - [Content_Types].xml: el tipus de cada extensió;
//  - _rels/.rels: on és el model;
//  - 3D/3dmodel.model: el model en XML (especificació 3MF Core 1.x).
// Cada objecte és una malla (vèrtexs + triangles amb índexs des de 0, en
// sentit antihorari vistos des de fora, com a l'STL) i té un element de
// <build> amb un desplaçament que el col·loca al llit.
import { crearZip } from './zip.js';

const TIPUS_CONTINGUT = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>
`;

const RELACIONS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
`;

const escapar = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

/** Número curt per a l'XML: 4 decimals (0,1 µm) sense zeros de sobra. */
const num = (valor) => String(Number(valor.toFixed(4)));

/**
 * Converteix els triangles solts (9 valors per triangle, com els de
 * l'STL) en una malla amb índexs: els vèrtexs iguals s'ajunten en un de
 * sol, i així la malla tancada ho és també per índexs. Els triangles
 * degenerats (dos vèrtexs iguals) es descarten: el 3MF no els admet, i
 * treure'ls no obre la malla (les seves arestes s'anul·len entre elles).
 */
function malla(posicions) {
  const indexs = new Map();
  const vertexs = [];
  const triangles = [];
  const index = (p) => {
    const clau = `${posicions[p]},${posicions[p + 1]},${posicions[p + 2]}`;
    let i = indexs.get(clau);
    if (i === undefined) {
      i = vertexs.length;
      indexs.set(clau, i);
      vertexs.push(`<vertex x="${num(posicions[p])}" y="${num(posicions[p + 1])}" z="${num(posicions[p + 2])}"/>`);
    }
    return i;
  };
  for (let p = 0; p < posicions.length; p += 9) {
    const a = index(p);
    const b = index(p + 3);
    const c = index(p + 6);
    if (a !== b && b !== c && a !== c) triangles.push(`<triangle v1="${a}" v2="${b}" v3="${c}"/>`);
  }
  return { vertexs, triangles };
}

/**
 * @param {Array<{nom: string, posicions: Float32Array, desplacament?: [number, number, number]}>} objectes
 *   posicions en mm (9 valors per triangle, vegeu trianglesModel);
 *   desplacament, en mm, on es col·loca l'objecte al llit (qui crida
 *   s'ha d'encarregar que els objectes no se solapin).
 * @param {string} [titol] Títol del model (metadades)
 * @returns {Blob}
 */
export function exportar3mf(objectes, titol = 'Model 3D') {
  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="ca" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    `  <metadata name="Title">${escapar(titol)}</metadata>`,
    '  <metadata name="Application">Terra nucli</metadata>',
    '  <resources>',
  ];
  const elements = [];
  objectes.forEach((objecte, i) => {
    const id = i + 1;
    const { vertexs, triangles } = malla(objecte.posicions);
    parts.push(
      `    <object id="${id}" type="model" name="${escapar(objecte.nom)}">`,
      '      <mesh>',
      '        <vertices>',
      vertexs.join('\n'),
      '        </vertices>',
      '        <triangles>',
      triangles.join('\n'),
      '        </triangles>',
      '      </mesh>',
      '    </object>'
    );
    const [dx, dy, dz] = objecte.desplacament ?? [0, 0, 0];
    elements.push(`    <item objectid="${id}" transform="1 0 0 0 1 0 0 0 1 ${num(dx)} ${num(dy)} ${num(dz)}"/>`);
  });
  parts.push('  </resources>', '  <build>', ...elements, '  </build>', '</model>', '');

  // El ZIP del 3MF porta el tipus de contingut primer, com fan els altres programes.
  const zip = crearZip([
    { nom: '[Content_Types].xml', dades: TIPUS_CONTINGUT },
    { nom: '_rels/.rels', dades: RELACIONS },
    { nom: '3D/3dmodel.model', dades: parts.join('\n') },
  ]);
  return new Blob([zip], { type: 'model/3mf' });
}
