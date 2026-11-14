// Capa de pagaments compartida per les apps. Separa QUÈ es ven (un
// producte, p. ex. "exportacio") de COM es cobra (un proveïdor), perquè
// la mateixa app pugui cobrar per Google Play (quan s'instal·la des de
// la Play Store, on Google obliga a fer servir Play Billing) i per un
// proveïdor web (Lemon Squeezy, Paddle...) quan s'obre al navegador.
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
 * Proveïdor web amb Lemon Squeezy, sense servidor propi:
 *  - comprar: obre el checkout de Lemon Squeezy (l'URL del producte) en una
 *    pestanya nova. Després de pagar, Lemon Squeezy dona una clau de
 *    llicència (al rebut i per correu), que l'usuari enganxa a l'app;
 *  - activarLlicencia: l'activa amb la License API pública
 *    (/v1/licenses/activate), que no necessita cap clau secreta, i la desa
 *    al dispositiu. Només desbloqueja si la llicència és de la nostra botiga
 *    i d'un producte d'aquesta app: si no, qualsevol clau de qualsevol
 *    botiga de Lemon Squeezy serviria;
 *  - compresActives: les llicències desades. Un cop al dia es tornen a
 *    validar (/v1/licenses/validate) en segon pla; si Lemon Squeezy diu que
 *    una ja no és vàlida (reemborsada, desactivada), s'esborra i deixa de
 *    comptar a la següent càrrega. Sense connexió, es confia en la desada;
 *  - restaurar: valida ara les desades. En un dispositiu nou, l'usuari hi
 *    enganxa la mateixa clau (cada activació ocupa una de les instàncies
 *    que permet el producte a Lemon Squeezy).
 *
 * Configuració (a l'app): lemon = {botiga: id numèric de la botiga} i, a
 * cada producte, lemon = {producte: id numèric, checkout: URL /buy/...}.
 * Els productes del mode test de Lemon Squeezy tenen uns altres ids que els
 * de producció: s'han de canviar en passar a producció.
 */
export class ProveidorLemonSqueezy {
  constructor(app, { botiga, productes }) {
    this.nom = 'lemonsqueezy';
    this.esDemo = false;
    // El diàleg de compra ha de mostrar el camp per enganxar la clau.
    this.ambLlicencia = true;
    this._app = app;
    this._botiga = botiga;
    this._productes = productes;
    this._clau = `${app}-llicencies-lemon`;
    this._memoria = [];
  }

  /** Cert si la configuració té la botiga i, com a mínim, un producte amb id i checkout. */
  configurat() {
    return Boolean(this._botiga) && this._productes.some((p) => p.lemon?.producte && p.lemon?.checkout);
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
   * Crida la License API. Torna la resposta (JSON) també quan és un error
   * de Lemon Squeezy (4xx: clau inexistent, límit d'activacions...), i
   * llança si no hi ha resposta clara (sense connexió, error del servidor).
   */
  async _api(metode, camps) {
    const resposta = await fetch(`${API_LLICENCIES}/${metode}`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: new URLSearchParams(camps),
      signal: AbortSignal.timeout(15000),
    });
    if (resposta.status >= 500 || resposta.status === 429) throw new Error(`Lemon Squeezy: HTTP ${resposta.status}`);
    return resposta.json();
  }

  /** L'id de producte de l'app que correspon a la resposta, o null si no és d'aquesta botiga i app. */
  _producteDe(meta) {
    if (!meta || Number(meta.store_id) !== Number(this._botiga)) return null;
    const trobat = this._productes.find((p) => p.lemon?.producte && Number(p.lemon.producte) === Number(meta.product_id));
    return trobat?.id ?? null;
  }

  async compresActives() {
    const llicencies = this._llegir();
    if (llicencies.some((l) => Date.now() - (l.validadaEl ?? 0) > UN_DIA_MS)) {
      this._validar().catch((error) => console.warn('ProveidorLemonSqueezy: no s\'han pogut validar les llicències', error));
    }
    return [...new Set(llicencies.map((l) => l.producte))];
  }

  /**
   * Torna a validar les llicències desades. Esborra les que Lemon Squeezy
   * diu que no són vàlides; les que no es poden comprovar (sense connexió),
   * es queden.
   */
  async _validar() {
    const esborrades = new Set();
    const validades = new Set();
    for (const llicencia of this._llegir()) {
      let resposta;
      try {
        resposta = await this._api('validate', { license_key: llicencia.clau, instance_id: llicencia.instancia });
      } catch {
        continue;
      }
      if (resposta.valid && this._producteDe(resposta.meta) === llicencia.producte) {
        validades.add(llicencia.clau);
      } else {
        console.warn('ProveidorLemonSqueezy: llicència no vàlida, s\'esborra', resposta.error ?? resposta.license_key?.status);
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
    if (!this.configurat() || !producte.lemon?.checkout) throw new Error('pagament-web-no-disponible');
    window.open(producte.lemon.checkout, '_blank', 'noopener');
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

    const resposta = await this._api('activate', { license_key: clau, instance_name: `${this._app} web` });
    if (!resposta.activated) {
      if (/activation limit/i.test(resposta.error ?? '')) throw new Error('llicencia-limit');
      throw new Error('llicencia-no-valida');
    }
    const producte = this._producteDe(resposta.meta);
    if (!producte) {
      // Clau d'una altra botiga o d'una altra app: no es desa, i s'allibera
      // l'activació perquè no ocupi lloc a qui la té.
      this._api('deactivate', { license_key: clau, instance_id: resposta.instance?.id ?? '' }).catch(() => {});
      throw new Error('llicencia-altre-producte');
    }
    const llicencies = this._llegir().filter((l) => l.clau !== clau);
    llicencies.push({ clau, instancia: resposta.instance.id, producte, validadaEl: Date.now() });
    this._desar(llicencies);
    return producte;
  }

  async restaurar() {
    const valides = await this._validar();
    return [...new Set(valides.map((l) => l.producte))];
  }
}

const API_LLICENCIES = 'https://api.lemonsqueezy.com/v1/licenses';
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
 *  - "lemonsqueezy": Lemon Squeezy (checkout + clau de llicència);
 *  - "auto": Google Play a l'app d'Android que porti el connector i, a la
 *    resta (la web), Lemon Squeezy si l'app en passa la configuració
 *    (`lemon`) o la demostració si no (les apps que encara no en tenen).
 *    Una app nativa sense el connector de Play continua amb la demostració.
 * Amb `lemon` però sense ids (encara no creats), la web no desbloqueja res:
 * comprar diu que el pagament web encara no està disponible.
 *
 * @param {{app: string, proveidor: string, lemon?: {botiga: number|null}, productes?: Array<object>}} opcions
 */
export function crearProveidor({ app, proveidor, lemon = null, productes = [] }) {
  const lemonSqueezy = () => new ProveidorLemonSqueezy(app, { botiga: lemon?.botiga ?? null, productes });
  if (proveidor === 'demo') return new ProveidorDemo(app);
  if (proveidor === 'play') return new ProveidorPlay(app);
  if (proveidor === 'lemonsqueezy') return lemonSqueezy();
  if (proveidor === 'auto') {
    if (ProveidorPlay.disponible()) return new ProveidorPlay(app);
    // Dins d'una app nativa (Android) mai s'ofereix el pagament web: Google
    // Play no permet cobrar continguts digitals fora de Play Billing.
    const nativa = Boolean(globalThis.Capacitor?.isNativePlatform?.());
    return lemon && !nativa ? lemonSqueezy() : new ProveidorDemo(app);
  }
  throw new Error(`crearProveidor: el proveïdor "${proveidor}" encara no està implementat`);
}
