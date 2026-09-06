/**
 * Les applications où Jarvis n'a PAS le droit d'appuyer.
 *
 * DÉCISION DE RAPHAËL, 3 sept. 2026, à ne pas rouvrir : LISTE NOIRE, pas
 * liste blanche. Autorisé partout par défaut — « aucune limite dans le sens
 * où il doit faire tout ce que je demande » —, interdit sur les applications
 * sensibles : banque, portefeuilles, mots de passe. Et il la complète à la
 * voix, sans avoir à ouvrir un écran.
 *
 * CE QU'ELLE EST, HONNÊTEMENT. Elle est appliquée par NOTRE code, ici : c'est
 * un vrai garde-fou sur ce que Jarvis FAIT — il refuse d'appuyer tant qu'une
 * application de la liste est au premier plan — mais le service
 * d'accessibilité d'Android garde techniquement la visibilité sur l'écran.
 * Aucune application ne peut se restreindre elle-même là-dessus. C'est dit
 * une fois, en toutes lettres, dans la carte de Paramètres.
 *
 * ET LES DÉFAUTS SE RETIRENT. Une liste imposée qu'on ne peut pas défaire
 * finit par bloquer quelque chose de légitime sans recours : les entrées
 * livrées d'origine s'enlèvent comme les siennes, et se remettent.
 *
 * Module PUR. Vérifié par scripts/verifier-ecran.ts.
 */

export const CLE_LISTE_NOIRE = "jarvis_liste_noire"

/** Une famille d'applications interdite d'office, dite par ce qu'elle est. */
export interface EntreeListeNoire {
  /** Ce qui est cherché, dans le nom du paquet ET dans le nom affiché. */
  motif: string
  /** Comment on le dit à l'écran. */
  libelle: string
}

/**
 * Les trois familles qu'il a nommées. Rien d'autre : chaque motif de trop est
 * une application qu'il ne pourra plus piloter sans comprendre pourquoi.
 */
export const LISTE_NOIRE_DOFFICE: EntreeListeNoire[] = [
  { motif: "bank", libelle: "les applications bancaires" },
  { motif: "banque", libelle: "les applications bancaires" },
  { motif: "banking", libelle: "les applications bancaires" },
  { motif: "leumi", libelle: "Bank Leumi" },
  { motif: "hapoalim", libelle: "Bank Hapoalim" },
  { motif: "mizrahi", libelle: "Mizrahi Tefahot" },
  { motif: "discount", libelle: "Israel Discount Bank" },
  { motif: "isracard", libelle: "Isracard" },
  { motif: "max.mymax", libelle: "Max" },
  { motif: "cal-online", libelle: "Cal" },
  { motif: "bit.", libelle: "Bit" },
  { motif: "paypal", libelle: "PayPal" },
  { motif: "revolut", libelle: "Revolut" },
  { motif: "wise", libelle: "Wise" },
  { motif: "gpay", libelle: "les portefeuilles de paiement" },
  { motif: "spay", libelle: "les portefeuilles de paiement" },
  { motif: "wallet", libelle: "les portefeuilles de paiement" },
  { motif: "portefeuille", libelle: "les portefeuilles de paiement" },
  { motif: "coinbase", libelle: "Coinbase" },
  { motif: "binance", libelle: "Binance" },
  { motif: "bitpanda", libelle: "Bitpanda" },
  { motif: "password", libelle: "les gestionnaires de mots de passe" },
  { motif: "motdepasse", libelle: "les gestionnaires de mots de passe" },
  { motif: "keepass", libelle: "KeePass" },
  { motif: "bitwarden", libelle: "Bitwarden" },
  { motif: "lastpass", libelle: "LastPass" },
  { motif: "1password", libelle: "1Password" },
  { motif: "dashlane", libelle: "Dashlane" },
  { motif: "authenticator", libelle: "les applications de code à usage unique" },
]

/** Ce que Raphaël a ajouté ou retiré, par-dessus les défauts. */
export interface ReglagesListeNoire {
  ajouts: EntreeListeNoire[]
  /** Les motifs livrés d'origine qu'il a retirés. */
  retraits: string[]
}

export const LISTE_NOIRE_VIDE: ReglagesListeNoire = { ajouts: [], retraits: [] }

function aplatir(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, "")
}

/** La liste effective : les défauts qu'il a gardés, plus les siens. */
export function listeEffective(reglages: ReglagesListeNoire): EntreeListeNoire[] {
  const retires = new Set(reglages.retraits.map((m) => m.toLowerCase()))
  return [
    ...LISTE_NOIRE_DOFFICE.filter((e) => !retires.has(e.motif.toLowerCase())),
    ...reglages.ajouts,
  ]
}

/**
 * L'entrée qui interdit cette application, ou rien.
 *
 * Le motif est cherché dans le nom du paquet ET dans le nom affiché : un
 * paquet dit `com.ideomobile.hapoalim` et une application dite « Bank
 * Hapoalim » doivent tomber sur la même règle, et il ne connaît que la
 * seconde forme quand il dicte la sienne.
 */
export function entreeInterdisant(
  paquet: string,
  application: string | undefined,
  reglages: ReglagesListeNoire,
): EntreeListeNoire | null {
  const cibles = [aplatir(paquet), aplatir(application ?? "")].filter(Boolean)
  if (cibles.length === 0) return null
  for (const entree of listeEffective(reglages)) {
    const motif = aplatir(entree.motif)
    if (!motif) continue
    if (cibles.some((c) => c.includes(motif))) return entree
  }
  return null
}

/** Vrai si Jarvis doit refuser d'agir sur cet écran. */
export function estInterdit(
  paquet: string,
  application: string | undefined,
  reglages: ReglagesListeNoire,
): boolean {
  return entreeInterdisant(paquet, application, reglages) !== null
}

/** Ce que Raphaël dicte (« n'appuie jamais dans Bitwarden ») devient une
 * entrée. Le nom qu'il a dit sert de motif ET de libellé : c'est le seul mot
 * qu'il reconnaîtra dans la liste. */
export function entreeDepuisLaVoix(nomDit: string): EntreeListeNoire | null {
  const propre = nomDit.trim()
  if (propre.length < 2) return null
  return { motif: propre, libelle: propre }
}

/** Lecture tolérante du réglage : une valeur abîmée ne doit pas faire tomber
 * la liste noire à vide, mais elle ne doit pas non plus faire échouer l'app.
 * On retombe sur les défauts seuls, jamais sur « plus rien d'interdit ». */
export function lireReglagesListeNoire(brut: string | null): ReglagesListeNoire {
  if (!brut) return LISTE_NOIRE_VIDE
  try {
    const o = JSON.parse(brut) as Partial<ReglagesListeNoire>
    const ajouts = Array.isArray(o.ajouts)
      ? o.ajouts.filter(
          (e): e is EntreeListeNoire =>
            !!e && typeof e.motif === "string" && typeof e.libelle === "string",
        )
      : []
    const retraits = Array.isArray(o.retraits)
      ? o.retraits.filter((m): m is string => typeof m === "string")
      : []
    return { ajouts, retraits }
  } catch {
    return LISTE_NOIRE_VIDE
  }
}
