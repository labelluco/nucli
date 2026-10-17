import fs from 'node:fs';
const f = 'eines/verificar.mjs';
let s = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const inici = s.indexOf("console.log('2. Traduccions');");
const fi = s.indexOf("console.log('3. Service worker');");
const nou = `console.log('2. Traduccions');
// Un diccionari per idioma: i18n/es.js exporta ES, i18n/en.js exporta EN...
// Es comproven els idiomes que té l'app (els seus propis fitxers, fora de
// nucli/), cadascun amb el diccionari de l'app més el del nucli.
const fitxersDiccionari = js.filter((f) => /i18n\/[a-z]{2}\.js$/.test(f));
const idiomaDe = (f) => f.match(/i18n\/([a-z]{2})\.js$/)[1];
const idiomesApp = [...new Set(fitxersDiccionari.filter((f) => !f.startsWith('nucli/')).map(idiomaDe))];
const diccionaris = {};
for (const idioma of idiomesApp) {
  const diccionari = {};
  for (const f of fitxersDiccionari.filter((g) => idiomaDe(g) === idioma)) {
    const text = readFileSync(f, 'utf8');
    // Duplicats: un objecte JS amb claus repetides no dona error, només
    // es queda l'última -- s'han de buscar al text.
    const claus = [...text.matchAll(/^\s*(['"])((?:\\.|(?!\1).)*)\1\s*:/gm)].map((m) => m[2].replace(/\\(.)/g, '$1'));
    const vistes = new Set();
    for (const c of claus) {
      if (vistes.has(c) || c in diccionari) error(\`clau duplicada a \${f}: "\${c}"\`);
      vistes.add(c);
    }
    Object.assign(diccionari, (await import(pathToFileURL(join(arrel, f)).href))[idioma.toUpperCase()]);
  }
  diccionaris[idioma] = diccionari;
}
const usades = new Map();
const usar = (clau, on) => usades.set(clau, usades.get(clau) ?? on);
for (const f of html) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(/data-i18n(?:-placeholder|-title|-aria-label)?="([^"]*)"/g)) usar(m[1].replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&'), f);
}
for (const f of js) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(/\bt\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*\)/g)) usar(m[2].replace(/\\(.)/g, '$1'), f);
}
for (const [idioma, diccionari] of Object.entries(diccionaris)) {
  for (const [clau, on] of usades) if (!(clau in diccionari)) error(\`[\${idioma}] sense traducció (\${on}): "\${clau}"\`);
  const sobrants = Object.keys(diccionari).filter((c) => !usades.has(c));
  console.log(\`  [\${idioma}] \${usades.size} textos usats, \${Object.keys(diccionari).length} traduccions\`);
  if (sobrants.length) console.log(\`  [\${idioma}] (info) traduccions no detectades en ús: \${sobrants.map((c) => \`"\${c}"\`).join(', ')}\`);
}

`;
s = s.slice(0, inici) + nou + s.slice(fi);
fs.writeFileSync(f, s);
