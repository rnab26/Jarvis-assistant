/**
 * Vérifie le choix du moteur de langue : le bon fournisseur, le bon modèle,
 * les bons seaux de quota, et des phrases d'erreur qui ne mentent pas.
 *
 *   node --experimental-strip-types scripts/verifier-moteur.ts
 *
 * AUCUN RÉSEAU, et pourtant ce n'est pas une lecture de code : `Deno` et
 * `fetch` sont remplacés par des doublures, et c'est le VRAI `appelerModele`
 * qui tourne. Un contrôle qui se contenterait de chercher des mots dans un
 * fichier resterait vert le jour où la bascule cesse de marcher — c'est le
 * piège déjà payé le 4 sept. avec un contrôle qui voyait la définition d'une
 * fonction et non son appel.
 *
 * CE QUI SE JOUE ICI, et qui casse en silence :
 * - la commande et la mémoire qui repartageraient un seau de quota (c'est ce
 *   qui a laissé Raphaël sans Jarvis le 3 sept. 2026 à 21h28) ;
 * - une bascule vers un moteur PAYANT qui se ferait toute seule — il a quitté
 *   l'API Anthropic en découvrant sa clé à sec ;
 * - une coupure réseau qui ne serait plus rejouée ;
 * - les phrases dites à Raphaël qui divergeraient entre le serveur et l'app.
 */
import { readFileSync } from "node:fs"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const lire = (chemin: string) =>
  readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8")

// ── Les doublures ──────────────────────────────────────────────────────────
// Posées AVANT le premier import du module, d'où l'import dynamique plus bas :
// `_shared/modele.ts` est écrit pour Deno, et lit ses secrets dans son
// environnement.

const secrets: Record<string, string> = {}
;(globalThis as unknown as { Deno: unknown }).Deno = {
  env: { get: (cle: string) => secrets[cle] },
}

/** Ce qu'on a envoyé, pour pouvoir l'inspecter après coup. */
interface Envoi {
  url: string
  entetes: Record<string, string>
  corps: Record<string, unknown>
}
let envois: Envoi[] = []

/**
 * La réponse que la doublure rendra au n-ième appel. Un nombre = un statut
 * d'échec ; « ok » = une réponse valide avec un appel d'outil.
 */
let scenario: Array<number | "ok"> = []

const vraiFetch = globalThis.fetch
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  envois.push({
    url: String(url),
    entetes: (init?.headers ?? {}) as Record<string, string>,
    corps: JSON.parse(String(init?.body ?? "{}")),
  })
  const attendu = scenario[envois.length - 1] ?? "ok"
  if (attendu === "ok") {
    // Les deux moteurs ont des formes de réponse différentes : on rend celle
    // qui correspond à l'hôte appelé, sinon le contrôle ne prouverait pas que
    // chaque fournisseur sait lire SON fournisseur.
    const corpsOk = String(url).includes("anthropic.com")
      ? {
          content: [{ type: "tool_use", name: "outil", input: { action: "ok" } }],
          usage: { input_tokens: 11, output_tokens: 3 },
        }
      : {
          candidates: [
            { content: { parts: [{ functionCall: { name: "outil", args: { action: "ok" } } }] } },
          ],
          usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 3 },
        }
    return new Response(JSON.stringify(corpsOk), { status: 200 })
  }
  if (attendu === 0) throw new Error("réseau coupé")
  return new Response(
    JSON.stringify({ error: { message: "refusé", type: "rate_limit_error" } }),
    { status: attendu },
  )
}) as typeof fetch

const {
  appelerModele,
  moteurNonConfigure,
  nomFournisseurChoisi,
  phrasePourEchec,
  FOURNISSEUR_PAR_DEFAUT,
} = await import("../supabase/functions/_shared/modele.ts")
const { gemini } = await import("../supabase/functions/_shared/gemini.ts")
const { anthropic } = await import("../supabase/functions/_shared/anthropic.ts")
const { PLAFONDS_MESURES } = await import("../src/lib/consommationModele.ts")

const OUTIL = {
  name: "outil",
  description: "Un outil",
  input_schema: { type: "object", properties: {}, required: [] },
}

/** Un appel type, pour ne pas répéter les mêmes six lignes à chaque contrôle. */
const appel = (p: Partial<Parameters<typeof appelerModele>[0]> = {}) => {
  envois = []
  return appelerModele({
    role: "commande",
    systeme: "consigne",
    texte: "phrase",
    outil: OUTIL,
    maxTokens: 512,
    ...p,
  })
}

/** Repart d'un environnement propre : un secret oublié fausserait la suite. */
const remiseAZero = (nouveaux: Record<string, string> = {}) => {
  for (const cle of Object.keys(secrets)) delete secrets[cle]
  Object.assign(secrets, { GEMINI_API_KEY: "cle-gemini" }, nouveaux)
  scenario = []
  envois = []
}

// ── Le fournisseur par défaut, et le seul gratuit ──────────────────────────
{
  remiseAZero()
  verifier(
    "sans secret FOURNISSEUR, c'est Gemini qui répond",
    nomFournisseurChoisi() === FOURNISSEUR_PAR_DEFAUT && FOURNISSEUR_PAR_DEFAUT === "gemini",
    `choisi : ${nomFournisseurChoisi()}`,
  )
  verifier("Gemini est déclaré gratuit", gemini.gratuit === true)
  verifier(
    "Anthropic est déclaré PAYANT",
    anthropic.gratuit === false,
    "sans ce drapeau, une promotion automatique pourrait basculer sur du facturé",
  )
}

// ── Les seaux de quota restent séparés ─────────────────────────────────────
{
  remiseAZero()
  for (const f of [gemini, anthropic]) {
    const commande = f.modeles("commande")
    const memoire = f.modeles("memoire")
    if (f.gratuit) {
      // Chez un fournisseur payant il n'y a pas de seau gratuit à épuiser :
      // la règle vise le plafond de l'offre gratuite, pas la facturation.
      verifier(
        `${f.nom} : la mémoire n'utilise pas le modèle de la commande`,
        memoire.modele !== commande.modele,
        `les deux visent ${commande.modele} — c'est le partage qui a rendu Jarvis muet le 3 sept.`,
      )
      verifier(
        `${f.nom} : et pas non plus un de ses secours`,
        !commande.secours.includes(memoire.modele) &&
          !memoire.secours.some((m) => m === commande.modele || commande.secours.includes(m)),
        `commande ${[commande.modele, ...commande.secours].join(", ")} / mémoire ${[memoire.modele, ...memoire.secours].join(", ")}`,
      )
    }
    verifier(`${f.nom} : chaque rôle nomme un modèle`, !!commande.modele && !!memoire.modele)
  }
}

// ── Changer de modèle, et de secours, sans toucher au code ─────────────────
{
  remiseAZero({ GEMINI_MODELE: "un-modele-choisi" })
  await appel()
  verifier(
    "le secret GEMINI_MODELE impose le modèle, sans redéployer",
    envois[0].url.includes("un-modele-choisi"),
    envois[0].url,
  )

  remiseAZero({ GEMINI_SECOURS: "secours-a, secours-b" })
  scenario = [429, 429, "ok"]
  await appel()
  verifier(
    "le secret GEMINI_SECOURS impose les secours, dans l'ordre écrit",
    envois.length === 3 &&
      envois[1].url.includes("secours-a") &&
      envois[2].url.includes("secours-b"),
    envois.map((e) => e.url.split("/models/")[1]).join(" → "),
  )

  remiseAZero({ GEMINI_SECOURS: "" })
  scenario = [429]
  await appel()
  verifier(
    "un GEMINI_SECOURS vide veut dire AUCUN secours, pas un modèle sans nom",
    envois.length === 1,
    `${envois.length} appels — un secours vide partirait vers une URL sans modèle`,
  )
}

// ── La bascule de modèle, et ce qu'elle rapporte ───────────────────────────
{
  remiseAZero()
  scenario = [429, "ok"]
  const r = await appel()
  const attendu = gemini.modeles("commande").secours[0]
  verifier(
    "un quota atteint fait passer au secours, tout de suite",
    !r.echec && r.modele === attendu,
    `modèle rendu : ${r.modele ?? "aucun"} (échec : ${r.echec?.statut})`,
  )
  verifier(
    "et le résultat dit QUI a répondu — sinon la bascule est invisible",
    r.fournisseur === "gemini" && r.modele !== gemini.modeles("commande").modele,
  )
  verifier("la consommation en jetons remonte", r.consommation?.entree === 11)

  remiseAZero()
  scenario = [400, "ok"]
  const mauvaise = await appel()
  verifier(
    "une requête fautive (400) n'essaie AUCUN secours",
    envois.length === 1 && mauvaise.echec?.statut === 400,
    `${envois.length} appels — la même requête échouerait pareil sur chaque modèle`,
  )
  verifier(
    "et elle n'est pas rejouée non plus",
    mauvaise.echec?.passager === false,
  )
}

// ── Une coupure réseau reste rejouée ───────────────────────────────────────
{
  remiseAZero()
  scenario = [0, "ok"]
  const r = await appel()
  verifier(
    "une coupure réseau est rejouée sur le même modèle",
    !r.echec && envois.length === 2,
    `${envois.length} appel(s), échec : ${r.echec?.statut} — un hoquet de connexion ne doit pas faire abandonner Jarvis`,
  )
}

// ── Le second fournisseur, derrière la même interface ──────────────────────
{
  remiseAZero({ FOURNISSEUR: "anthropic", ANTHROPIC_API_KEY: "cle-anthropic" })
  const r = await appel()
  verifier(
    "FOURNISSEUR=anthropic envoie bien chez Anthropic",
    envois[0].url === "https://api.anthropic.com/v1/messages",
    envois[0].url,
  )
  verifier(
    "avec sa clé à lui, jamais celle de Gemini",
    envois[0].entetes["x-api-key"] === "cle-anthropic",
    JSON.stringify(envois[0].entetes),
  )
  verifier(
    "et la version d'API qu'il exige",
    envois[0].entetes["anthropic-version"] === "2023-06-01",
  )
  verifier(
    "l'outil est imposé : sa réponse EST l'appel d'outil",
    JSON.stringify(envois[0].corps.tool_choice) === JSON.stringify({ type: "tool", name: "outil" }),
    JSON.stringify(envois[0].corps.tool_choice),
  )
  verifier(
    "le schéma d'outil part tel quel, sans traduction qui pourrait en perdre un bout",
    JSON.stringify(
      (envois[0].corps.tools as Array<{ input_schema: unknown }>)[0].input_schema,
    ) === JSON.stringify(OUTIL.input_schema),
  )
  verifier(
    "et sa réponse est comprise : les arguments de l'outil remontent",
    r.args?.action === "ok" && r.fournisseur === "anthropic",
    JSON.stringify(r),
  )
}

// ── Rien ne part chez un moteur payant sans la main de Raphaël ─────────────
{
  remiseAZero({ ANTHROPIC_API_KEY: "cle-anthropic" })
  scenario = [429, 429, 429, "ok"]
  await appel()
  verifier(
    "une clé Anthropic présente ne suffit PAS à y basculer",
    envois.every((e) => !e.url.includes("anthropic.com")),
    "il faut poser FOURNISSEUR=anthropic soi-même — sinon un quota vide ferait payer sans prévenir",
  )
  verifier(
    "même quand tous les modèles gratuits ont refusé",
    envois.length >= 1 && envois.every((e) => e.url.includes("googleapis.com")),
    envois.map((e) => e.url).join(" | "),
  )
}

// ── La clé : laquelle, et ce qu'on dit quand elle manque ───────────────────
{
  remiseAZero({ GEMINI_API_KEY_TEST: "cle-de-test" })
  await appel({ essai: true })
  verifier(
    "un appel de vérification puise dans la clé de TEST",
    envois[0].entetes["x-goog-api-key"] === "cle-de-test",
    "sans ça, nos contrôles vident le quota du jour de Raphaël",
  )
  await appel({ essai: false })
  verifier("une vraie phrase de Raphaël puise dans la sienne", envois[0].entetes["x-goog-api-key"] === "cle-gemini")

  remiseAZero({ GEMINI_API_KEY_TEST: "" })
  await appel({ essai: true })
  verifier(
    "sans clé de test, on retombe sur la normale plutôt que de ne rien vérifier",
    envois[0].entetes["x-goog-api-key"] === "cle-gemini",
  )

  for (const cle of Object.keys(secrets)) delete secrets[cle]
  const manque = await moteurNonConfigure(false)
  verifier(
    "clé absente : le message NOMME le secret à déposer",
    !!manque && manque.includes("GEMINI_API_KEY"),
    manque ?? "aucun message",
  )
  verifier(
    "et il porte le marqueur que l'app sait reconnaître",
    !!manque && manque.toLowerCase().includes("clé du moteur non configurée"),
    manque ?? "aucun message",
  )

  remiseAZero({ FOURNISSEUR: "inexistant" })
  const inconnu = await moteurNonConfigure(false)
  verifier(
    "un FOURNISSEUR inconnu se dit, au lieu de retomber en silence sur Gemini",
    !!inconnu && inconnu.includes("inexistant") && inconnu.includes("gemini"),
    inconnu ?? "aucun message",
  )

  remiseAZero()
  verifier("moteur configuré : aucun message", (await moteurNonConfigure(false)) === null)
}

// ── Un modèle mis en service a été mesuré ──────────────────────────────────
// Les deux moitiés de la règle : le serveur choisit les modèles,
// src/lib/consommationModele.ts dit à Raphaël ce qu'il lui reste. Si l'une
// bouge sans l'autre, la carte affiche un chiffre qui parle d'un modèle qui ne
// tourne plus — et il n'a aucun moyen de s'en apercevoir.
{
  remiseAZero()
  const enService = new Set<string>()
  for (const role of ["commande", "memoire"] as const) {
    const { modele, secours } = gemini.modeles(role)
    enService.add(modele)
    for (const m of secours) enService.add(m)
  }
  const sansMesure = [...enService].filter((m) => !PLAFONDS_MESURES[m])
  verifier(
    "chaque modèle Gemini en service a un plafond mesuré",
    sansMesure.length === 0,
    `jamais mesuré(s) : ${sansMesure.join(", ")} — mets un modèle en service seulement après l'avoir essayé pour de vrai, sinon la carte « où j'en suis » parle dans le vide`,
  )
}

// ── Les phrases dites à Raphaël ────────────────────────────────────────────
{
  const cas = [
    { statut: 429, texte: "RESOURCE_EXHAUSTED", passager: false },
    { statut: 403, texte: "API_KEY_INVALID", passager: false },
    { statut: 500, texte: "boom", passager: true },
    { statut: 0, texte: "réseau", passager: false },
  ]
  const phrases = cas.map((c) => phrasePourEchec(c))
  verifier(
    "aucune phrase d'erreur ne nomme le fournisseur",
    phrases.every((p) => !/gemini|google|anthropic|claude/i.test(p)),
    phrases.find((p) => /gemini|google|anthropic|claude/i.test(p)) ?? "",
  )
  verifier(
    "chacune dit quoi faire, pas seulement ce qui ne va pas",
    phrases.every((p) => /redis-moi|réessaie|regarde|je ne peux pas/i.test(p)),
    phrases.join(" | "),
  )
  verifier("les quatre cas donnent quatre phrases distinctes", new Set(phrases).size === 4)

  // Le serveur habille les pannes du modèle ; l'app rattrape celles que le
  // serveur ne peut pas habiller (fonction plantée, réseau coupé). Deux
  // chemins, une seule formulation — sinon Raphaël entend deux Jarvis.
  const serveur = lire("supabase/functions/_shared/modele.ts")
  const client = lire("src/lib/erreurServeurVocal.ts")
  const dansPhrasePourEchec = serveur.slice(serveur.indexOf("export function phrasePourEchec"))
  const litterales = [...dansPhrasePourEchec.matchAll(/return "([^"]+)"/g)].map((m) => m[1])
  verifier(
    "les phrases du serveur ont bien été relevées",
    litterales.length >= 4,
    `${litterales.length} trouvée(s)`,
  )
  // La SEULE divergence admise, et elle est voulue : quand rien n'est reconnu,
  // le serveur ne peut que dire qu'il n'a pas joint le moteur, tandis que
  // l'app a mieux sous la main — elle relaie ce que le serveur a répondu
  // (« Le serveur vocal a répondu : … »), ce qui est plus utile qu'une phrase
  // générique. Elle est nommée ici plutôt que tolérée en silence : si
  // quelqu'un la reformule, ce contrôle le dit au lieu de laisser passer une
  // vraie divergence.
  const CATCH_ALL_SERVEUR =
    "Je n'arrive pas à joindre le moteur en ce moment. Réessaie, et regarde les journaux de voice-command si ça dure."
  verifier(
    "le dernier recours du serveur est bien celui qu'on connaît",
    litterales.includes(CATCH_ALL_SERVEUR),
    "s'il a changé, décide si l'app doit suivre, puis mets à jour cette exception",
  )
  for (const phrase of litterales.filter((p) => p !== CATCH_ALL_SERVEUR)) {
    verifier(
      `l'app dit la même chose : « ${phrase.slice(0, 42)}… »`,
      client.includes(phrase),
      "src/lib/erreurServeurVocal.ts doit porter la phrase mot pour mot",
    )
  }
  verifier(
    "l'app comprend encore l'ANCIEN message de clé manquante",
    client.includes("gemini_api_key non configurée"),
    "le site se republie à chaque push, la Edge Function non : entre les deux, c'est l'ancien message qui arrive",
  )
}

globalThis.fetch = vraiFetch
console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} contrôle(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
