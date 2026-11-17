// Capa de pagaments compartida per les apps. Separa QUÈ es ven (un
// producte, p. ex. "exportacio") de COM es cobra (un proveïdor), perquè
// la mateixa app pugui cobrar per Google Play (quan s'instal·la des de
// la Play Store, on Google obliga a fer servir Play Billing) i per un
// proveïdor web (Polar) quan s'obre al navegador.
//
// Límit honest d'aquest disseny: el codi arriba sencer al dispositiu (a la
// web, com a JavaScript) i tot hi passa, de manera que algú amb
// coneixements pot saltar-se el bloqueig. Una verificació forta necessitaria un servidor propi que
// validi els rebuts; la interfície ja està pensada perquè es pugui
// afegir dins d'un proveïdor sense tocar les apps.
//
// Interfície d'un proveïdor:
//   nom: string
//   esDemo: boolean
//   async compresActives(): string[]        ids dels productes comprats
//   async comprar(producte): boolean        cert si s'ha completat
//   async restaurar(): string[]             torna a llegir les compres
//   async preu(producte): string?           preu per mostrar (opcional; si no,
//                                           el de la configuració de l'app)
//   ambLlicencia: boolean                   (opcional) es compra amb una clau
//   async activarLlicencia(clau): string    de llicència (web): torna el producte

/**
 * Proveïdor de demostració: no cobra res, només desa la "compra" al
 * dispositiu. Serveix per desenvolupar i provar tot el circuit (bloqueig,
 * diàleg, desbloqueig) abans de tenir comptes als proveïdors reals.
 */
export class ProveidorDemo {
  constructor(app) {
    this.nom = 'demo';
    this.esDemo = true;
    this._clau = `${app}-compres-demo`;
    this._memoria = [];
  }

  _llegir() {
    try {
      const desat = JSON.parse(localStorage.getItem(this._clau) ?? '[]');
      return Array.isArray(desat) ? desat : [];
    } catch {
      return this._memoria;
    }
  }

  _desar(ids) {
    this._memoria = ids;
    try {
      localStorage.setItem(this._clau, JSON.stringify(ids));
    } catch {
      // Sense emmagatzematge (mode privat): la compra dura fins que es tanqui la pàgina.
    }
  }

  async compresActives() {
    return this._llegir();
  }

  async comprar(producte) {
    const ids = new Set(this._llegir());
    ids.add(producte.id);
    this._desar([...ids]);
    return true;
  }

  async restaurar() {
    return this._llegir();
  }

  /** Només per a proves: oblida les compres de demostració. */
  async oblidar() {
    this._desar([]);
  }
}

/**
 * Proveïdor de Google Play (app d'Android feta amb Capacitor), amb el
 * connector @capgo/native-purchases, que parla directament amb Google Play
 * Billing. Es crida pel pont natiu (window.Capacitor.nativePromise), sense
 * bundler, com els altres connectors de les apps (vegeu ui/descarrega.js).
 *
 * Els productes són de compra única ("inapp", no consumibles): l'id del
 * producte a la Play Console és el mateix que l'id de l'app (p. ex.
 * "exportacio"), o el que digui producte.idPlay.
 *
 * La compra la valida Google i el connector la confirma (acknowledge) sol;
 * sense confirmar, Google la retornaria al cap de 3 dies. Per si no hi ha
 * connexió, es desa l'última llista de compres coneguda al dispositiu: així
 * qui ha pagat pot continuar exportant fora de cobertura.
 */
export class ProveidorPlay {
  constructor(app) {
    this.nom = 'play';
    this.esDemo = false;
    this._clau = `${app}-compres-play`;
    this._preus = new Map();
  }

  static disponible() {
    const capacitor = globalThis.Capacitor;
    return Boolean(capacitor?.isNativePlatform?.() && capacitor.isPluginAvailable?.(CONNECTOR_PLAY));
  }

  _cridar(metode, opcions = {}) {
    return globalThis.Capacitor.nativePromise(CONNECTOR_PLAY, metode, opcions);
  }

  _idPlay(producte) {
    return producte.idPlay ?? producte.id;
  }

  _desades() {
    try {
      const desat = JSON.parse(localStorage.getItem(this._clau) ?? '[]');
      return Array.isArray(desat) ? desat : [];
    } catch {
      return [];
    }
  }

  async compresActives() {
    try {
      const { purchases = [] } = await this._cridar('getPurchases', { productType: 'inapp' });
      // A Android, "1" és una compra pagada; "0" un pagament pendent (en
      // efectiu, per exemple), que encara no dona dret al producte.
      const ids = [...new Set(purchases.filter((c) => c.purchaseState === '1').map((c) => c.productIdentifier))];
      try {
        localStorage.setItem(this._clau, JSON.stringify(ids));
      } catch {
        // Sense emmagatzematge: només es perd el mode sense connexió.
      }
      return ids;
    } catch (error) {
      console.warn('ProveidorPlay: no s\'han pogut llegir les compres; es fan servir les últimes conegudes', error);
      return this._desades();
    }
  }

  async preu(producte) {
    const id = this._idPlay(producte);
    if (!this._preus.has(id)) {
      try {
        const { products = [] } = await this._cridar('getProducts', { productIdentifiers: [id], productType: 'inapp' });
        const trobat = products.find((p) => p.identifier === id);
        if (trobat?.priceString) this._preus.set(id, trobat.priceString);
      } catch (error) {
        console.warn('ProveidorPlay: no s\'ha pogut llegir el preu de Google Play', error);
      }
    }
    return this._preus.get(id) ?? null;
  }

  async comprar(producte) {
    let transaccio;
    try {
      transaccio = await this._cridar('purchaseProduct', {
        productIdentifier: this._idPlay(producte),
        productType: 'inapp',
        quantity: 1,
      });
    } catch (error) {
      const codi = String(error?.code ?? error?.message ?? '');
      if (/USER_CANCELED/.test(codi)) return false;
      // Ja comprat (per exemple, en un altre dispositiu amb el mateix compte):
      // no és cap error, es restaura.
      if (/ITEM_ALREADY_OWNED/.test(codi)) return (await this.restaurar()).includes(producte.id);
      if (/pending/i.test(String(error?.message ?? ''))) throw new Error('pagament-pendent');
      throw error;
    }
    return transaccio?.purchaseState === undefined || transaccio.purchaseState === '1';
  }

  async restaurar() {
    try {
      await this._cridar('restorePurchases');
    } catch (error) {
      console.warn('ProveidorPlay: restorePurchases ha fallat; es llegeixen les compres igualment', error);
    }
    return this.compresActives();
  }
}

const CONNECTOR_PLAY = 'NativePurchases';

/**
 * Proveïdor web amb Polar (polar.sh), sense servidor propi. Polar fa de
 * venedor davant del client (cobra i liquida l'IVA) i, amb cada compra,
 * dona una clau de llicència (un «benefit» de tipus License Keys):
 *  - comprar: obre l'enllaç de checkout del producte en una pestanya nova.
 *    Després de pagar, Polar dona la clau (a la pàgina de la compra i per
 *    correu), que l'usuari enganxa a l'app;
 *  - activarLlicencia: l'activa en aquest dispositiu amb l'API pública de
 *    llicències (customer-portal/license-keys/activate), que no necessita
 *    cap clau secreta, i la desa al dispositiu. Només desbloqueja si la clau
 *    és de la nostra organització i del benefit d'un producte d'aquesta
 *    app: si no, una clau d'una altra app (o d'una altra organització de
 *    Polar) també serviria;
 *  - compresActives: les llicències desades. Un cop al dia es tornen a
 *    validar (.../validate) en segon pla; si Polar diu que una ja no és
 *    vàlida (reemborsada, revocada, activació esborrada), s'esborra i deixa
 *    de comptar a la següent càrrega. Sense connexió, es confia en la desada;
 *  - restaurar: valida ara les desades. En un dispositiu nou, l'usuari hi
 *    enganxa la mateixa clau (cada activació ocupa un dels dispositius que
 *    permet el benefit; el límit es posa a Polar).
 *
 * Configuració (a l'app): polar = {organitzacio: id, sandbox: boolean} i, a
 * cada producte, polar = {benefici: id del benefit de llicències, checkout:
 * URL de l'enllaç de checkout}. Els ids del sandbox (proves) i els de
 * producció són diferents. Cap d'aquests valors és secret.
 */
export class ProveidorPolar {
  constructor(app, { organitzacio, sandbox, productes }) {
    this.nom = 'polar';
    this.esDemo = false;
    // El diàleg de compra ha de mostrar el camp per enganxar la clau.
    this.ambLlicencia = true;
    this._app = app;
    this._organitzacio = organitzacio;
    this._api = sandbox ? API_POLAR_SANDBOX : API_POLAR;
    this._productes = productes;
    this._clau = `${app}-llicencies-polar`;
    this._memoria = [];
  }

  /** Cert si la configuració té l'organització i, com a mínim, un producte amb benefit i checkout. */
  configurat() {
    return Boolean(this._organitzacio) && this._productes.some((p) => p.polar?.benefici && p.polar?.checkout);
  }

  _llegir() {
    try {
      const desat = JSON.parse(localStorage.getItem(this._clau) ?? '[]');
      return Array.isArray(desat) ? desat : [];
    } catch {
      return this._memoria;
    }
  }

  _desar(llicencies) {
    this._memoria = llicencies;
    try {
      localStorage.setItem(this._clau, JSON.stringify(llicencies));
    } catch {
      // Sense emmagatzematge (mode privat): la llicència dura fins que es tanqui la pàgina.
    }
  }

  /**
   * Crida l'API de llicències. Torna {ok, cos} també quan Polar respon amb
   * un error (4xx: clau inexistent, límit d'activacions...), i llança si no
   * hi ha resposta clara (sense connexió, error del servidor).
   */
  async _cridar(metode, camps) {
    const resposta = await fetch(`${this._api}/v1/customer-portal/license-keys/${metode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...camps, organization_id: this._organitzacio }),
      signal: AbortSignal.timeout(15000),
    });
    if (resposta.status >= 500 || resposta.status === 429) throw new Error(`Polar: HTTP ${resposta.status}`);
    return { ok: resposta.ok, cos: await resposta.json().catch(() => ({})) };
  }

  /** L'id de producte de l'app que correspon a la llicència, o null si no és d'aquesta organització i app. */
  _producteDe(llicencia) {
    if (!llicencia || llicencia.organization_id !== this._organitzacio) return null;
    const trobat = this._productes.find((p) => p.polar?.benefici && p.polar.benefici === llicencia.benefit_id);
    return trobat?.id ?? null;
  }

  /** Cert si Polar diu que la llicència està concedida i no ha caducat. */
  _vigent(llicencia) {
    if (llicencia?.status !== 'granted') return false;
    return !llicencia.expires_at || Date.parse(llicencia.expires_at) > Date.now();
  }

  async compresActives() {
    const llicencies = this._llegir();
    if (llicencies.some((l) => Date.now() - (l.validadaEl ?? 0) > UN_DIA_MS)) {
      this._validar().catch((error) => console.warn('ProveidorPolar: no s\'han pogut validar les llicències', error));
    }
    return [...new Set(llicencies.map((l) => l.producte))];
  }

  /**
   * Torna a validar les llicències desades. Esborra les que Polar diu que no
   * són vàlides; les que no es poden comprovar (sense connexió), es queden.
   */
  async _validar() {
    const esborrades = new Set();
    const validades = new Set();
    for (const llicencia of this._llegir()) {
      let resposta;
      try {
        resposta = await this._cridar('validate', { key: llicencia.clau, activation_id: llicencia.activacio });
      } catch {
        continue;
      }
      if (resposta.ok && this._vigent(resposta.cos) && this._producteDe(resposta.cos) === llicencia.producte) {
        validades.add(llicencia.clau);
      } else {
        console.warn('ProveidorPolar: llicència no vàlida, s\'esborra', resposta.cos?.status ?? resposta.cos?.detail);
        esborrades.add(llicencia.clau);
      }
    }
    // Es torna a llegir: mentrestant s'hi pot haver activat una altra clau.
    const resultat = this._llegir()
      .filter((l) => !esborrades.has(l.clau))
      .map((l) => (validades.has(l.clau) ? { ...l, validadaEl: Date.now() } : l));
    this._desar(resultat);
    return resultat;
  }

  async comprar(producte) {
    if (!this.configurat() || !producte.polar?.checkout) throw new Error('pagament-web-no-disponible');
    window.open(producte.polar.checkout, '_blank', 'noopener');
    // La compra no s'acaba aquí: falta enganxar la clau (activarLlicencia).
    return false;
  }

  /**
   * Activa una clau de llicència en aquest dispositiu.
   * @returns {Promise<string>} l'id del producte desbloquejat
   */
  async activarLlicencia(clau) {
    if (!this.configurat()) throw new Error('pagament-web-no-disponible');
    clau = clau.trim();
    if (!clau) throw new Error('llicencia-no-valida');

    // Ja activada en aquest dispositiu: només es valida, per no gastar una activació.
    if (this._llegir().some((l) => l.clau === clau)) {
      const valides = await this._validar();
      const desada = valides.find((l) => l.clau === clau);
      if (desada) return desada.producte;
    }

    const resposta = await this._cridar('activate', { key: clau, label: `${this._app} web` });
    if (!resposta.ok) {
      if (/activation/i.test(JSON.stringify(resposta.cos?.detail ?? ''))) throw new Error('llicencia-limit');
      throw new Error('llicencia-no-valida');
    }
    const activacio = resposta.cos;
    const llicencia = activacio.license_key;
    const producte = this._producteDe(llicencia);
    if (!producte || !this._vigent(llicencia)) {
      // No es desa, i s'allibera l'activació perquè no ocupi lloc a qui té la clau.
      this._cridar('deactivate', { key: clau, activation_id: activacio.id }).catch(() => {});
      throw new Error(producte ? 'llicencia-no-valida' : 'llicencia-altre-producte');
    }
    const llicencies = this._llegir().filter((l) => l.clau !== clau);
    llicencies.push({ clau, activacio: activacio.id, producte, validadaEl: Date.now() });
    this._desar(llicencies);
    return producte;
  }

  async restaurar() {
    const valides = await this._validar();
    return [...new Set(valides.map((l) => l.producte))];
  }
}

const API_POLAR = 'https://api.polar.sh';
const API_POLAR_SANDBOX = 'https://sandbox-api.polar.sh';
const UN_DIA_MS = 24 * 60 * 60 * 1000;

export class GestorCompres {
  /**
   * @param {{proveidor: object, productes: Array<{id: string, preu: string, idPlay?: string}>}} opcions
   *   preu: el que es mostra si el proveïdor no en dona cap (el de Google
   *   Play el fixa la Play Console i el dona el mateix proveïdor).
   */
  constructor({ proveidor, productes }) {
    this.proveidor = proveidor;
    this.productes = productes;
    this._actius = null;
  }

  producte(id) {
    return this.productes.find((p) => p.id === id) ?? null;
  }

  /** Preu per mostrar: el del proveïdor (Google Play, en la moneda de cada país) o el de la configuració. */
  async preu(id) {
    const producte = this.producte(id);
    if (!producte) return null;
    return (await this.proveidor.preu?.(producte)) ?? producte.preu;
  }

  async teProducte(id) {
    if (!this._actius) this._actius = new Set(await this.proveidor.compresActives());
    return this._actius.has(id);
  }

  async comprar(id) {
    const producte = this.producte(id);
    if (!producte) throw new Error(`GestorCompres: producte desconegut "${id}"`);
    const fet = await this.proveidor.comprar(producte);
    if (fet) {
      this._actius = null;
      document.dispatchEvent(new CustomEvent('compres-canviades'));
    }
    return fet;
  }

  async restaurar() {
    this._actius = new Set(await this.proveidor.restaurar());
    document.dispatchEvent(new CustomEvent('compres-canviades'));
    return [...this._actius];
  }

  /** Proveïdors amb clau de llicència (web): l'activa i torna l'id del producte desbloquejat. */
  async activarLlicencia(clau) {
    const producte = await this.proveidor.activarLlicencia(clau);
    this._actius = null;
    document.dispatchEvent(new CustomEvent('compres-canviades'));
    return producte;
  }
}

/**
 * Tria el proveïdor segons la configuració de l'app:
 *  - "demo": no cobra res (desenvolupament, i la web mentre no hi hagi
 *    proveïdor web);
 *  - "play": Google Play Billing (només dins de l'app d'Android);
 *  - "polar": Polar (checkout + clau de llicència);
 *  - "auto": Google Play a l'app d'Android que porti el connector i, a la
 *    resta (la web), Polar si l'app en passa la configuració (`polar`) o la
 *    demostració si no (les apps que encara no en tenen).
 *    Una app nativa sense el connector de Play continua amb la demostració.
 * Amb `polar` però sense ids (encara no creats), la web no desbloqueja res:
 * comprar diu que el pagament web encara no està disponible.
 *
 * @param {{app: string, proveidor: string, polar?: {organitzacio: string|null, sandbox?: boolean}, productes?: Array<object>}} opcions
 */
export function crearProveidor({ app, proveidor, polar = null, productes = [] }) {
  const polarWeb = () => new ProveidorPolar(app, { organitzacio: polar?.organitzacio ?? null, sandbox: Boolean(polar?.sandbox), productes });
  if (proveidor === 'demo') return new ProveidorDemo(app);
  if (proveidor === 'play') return new ProveidorPlay(app);
  if (proveidor === 'polar') return polarWeb();
  if (proveidor === 'auto') {
    if (ProveidorPlay.disponible()) return new ProveidorPlay(app);
    // Dins d'una app nativa (Android) mai s'ofereix el pagament web: Google
    // Play no permet cobrar continguts digitals fora de Play Billing.
    const nativa = Boolean(globalThis.Capacitor?.isNativePlatform?.());
    return polar && !nativa ? polarWeb() : new ProveidorDemo(app);
  }
  throw new Error(`crearProveidor: el proveïdor "${proveidor}" encara no està implementat`);
}
