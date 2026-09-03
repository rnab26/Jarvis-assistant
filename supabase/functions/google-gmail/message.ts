// Tout ce qui transforme un message Gmail en quelque chose que Jarvis peut
// lire à voix haute, et une réponse dictée en message que Gmail accepte.
//
// Sorti de index.ts pour la même raison que google-calendar/dates.ts : ce
// fichier n'importe rien de Deno, donc scripts/verifier-gmail.mjs peut
// l'exécuter sous Node et prouver l'encodage SANS envoyer d'e-mail. Le MIME
// est un format qu'on ne devine pas : un accent mal encodé dans un objet, une
// ligne de base64 trop longue, et le message part illisible chez le
// destinataire — sans erreur d'aucune sorte, ce qui est le pire des cas.

/** Gmail encode ses corps en base64url ; atob veut du base64 standard. */
export function decoderBase64Url(valeur: string): string {
  const base64 = valeur.replace(/-/g, "+").replace(/_/g, "/")
  const binaire = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))
  const octets = Uint8Array.from(binaire, (c) => c.charCodeAt(0))
  return new TextDecoder("utf-8").decode(octets)
}

export function encoderBase64Url(texte: string): string {
  const octets = new TextEncoder().encode(texte)
  let binaire = ""
  for (const o of octets) binaire += String.fromCharCode(o)
  return btoa(binaire).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/** Le base64 d'un corps MIME se coupe à 76 colonnes (RFC 2045). Des lignes
 * plus longues sont refusées ou tronquées par certains serveurs. */
function couper(base64: string): string {
  return (base64.match(/.{1,76}/g) ?? []).join("\r\n")
}

function base64Standard(texte: string): string {
  const octets = new TextEncoder().encode(texte)
  let binaire = ""
  for (const o of octets) binaire += String.fromCharCode(o)
  return btoa(binaire)
}

/**
 * Un en-tête ne peut porter que de l'ASCII. « Réponse à propos du chantier »
 * doit donc voyager encodé (RFC 2047), sinon l'objet arrive en charabia.
 * On n'encode que si c'est nécessaire, pour garder les objets lisibles dans
 * les journaux.
 */
export function encoderEntete(valeur: string): string {
  // deno-lint-ignore no-control-regex
  if (!/[^\x00-\x7F]/.test(valeur)) return valeur
  return `=?UTF-8?B?${base64Standard(valeur)}?=`
}

/** Retire les retours à la ligne : un en-tête sur deux lignes permettrait
 * d'injecter n'importe quel autre en-tête (Bcc compris). */
function assainirEntete(valeur: string): string {
  return valeur.replace(/[\r\n]+/g, " ").trim()
}

export type PieceJointeSortante = {
  nom: string
  type?: string | null
  contenu_base64: string
}

export type Brouillon = {
  destinataires: string
  objet: string
  corps: string
  copie?: string | null
  repond_a_message_id?: string | null
  references?: string | null
  pieces_jointes?: PieceJointeSortante[]
}

/**
 * Le message complet, prêt pour Gmail. `In-Reply-To` et `References` sont ce
 * qui range la réponse DANS la conversation d'origine : sans eux, Raphaël
 * répond à côté et son correspondant reçoit un fil neuf.
 */
export function construireMime(b: Brouillon): string {
  const entetes: string[] = [
    `To: ${assainirEntete(b.destinataires)}`,
    `Subject: ${encoderEntete(assainirEntete(b.objet))}`,
    "MIME-Version: 1.0",
  ]
  if (b.copie) entetes.splice(1, 0, `Cc: ${assainirEntete(b.copie)}`)
  if (b.repond_a_message_id) {
    entetes.push(`In-Reply-To: ${assainirEntete(b.repond_a_message_id)}`)
    entetes.push(`References: ${assainirEntete(b.references || b.repond_a_message_id)}`)
  }

  const pieces = b.pieces_jointes ?? []
  if (pieces.length === 0) {
    entetes.push('Content-Type: text/plain; charset="UTF-8"')
    entetes.push("Content-Transfer-Encoding: base64")
    return `${entetes.join("\r\n")}\r\n\r\n${couper(base64Standard(b.corps))}`
  }

  const frontiere = `jarvis_${crypto.randomUUID().replace(/-/g, "")}`
  entetes.push(`Content-Type: multipart/mixed; boundary="${frontiere}"`)

  const morceaux = [
    `--${frontiere}\r\n` +
      'Content-Type: text/plain; charset="UTF-8"\r\n' +
      "Content-Transfer-Encoding: base64\r\n\r\n" +
      couper(base64Standard(b.corps)),
    ...pieces.map((p) => {
      const nom = assainirEntete(p.nom).replace(/"/g, "")
      return (
        `--${frontiere}\r\n` +
        `Content-Type: ${assainirEntete(p.type || "application/octet-stream")}; name="${nom}"\r\n` +
        `Content-Disposition: attachment; filename="${nom}"\r\n` +
        "Content-Transfer-Encoding: base64\r\n\r\n" +
        couper(p.contenu_base64.replace(/\s+/g, ""))
      )
    }),
  ]

  return `${entetes.join("\r\n")}\r\n\r\n${morceaux.join("\r\n")}\r\n--${frontiere}--`
}

type Partie = {
  mimeType?: string
  filename?: string
  body?: { data?: string; size?: number; attachmentId?: string }
  parts?: Partie[]
  headers?: { name: string; value: string }[]
}

export function entete(parties: { name: string; value: string }[] | undefined, nom: string) {
  return parties?.find((h) => h.name.toLowerCase() === nom.toLowerCase())?.value ?? null
}

/** Le HTML lu à voix haute serait imbuvable : on ne le garde qu'à défaut de
 * texte brut, et débarrassé de son balisage. */
function texteDepuisHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export type PieceJointeEntrante = {
  id: string
  nom: string
  type: string | null
  taille: number | null
}

/**
 * Le corps lisible et les pièces jointes d'un message. Gmail imbrique les
 * parties (multipart/alternative dans multipart/mixed…) : on descend l'arbre
 * en entier plutôt que de regarder le premier niveau, sinon un message écrit
 * depuis un téléphone remonte vide.
 */
export function extraireContenu(charge: Partie | undefined): {
  corps: string
  pieces_jointes: PieceJointeEntrante[]
} {
  let brut = ""
  let html = ""
  const pieces: PieceJointeEntrante[] = []

  const descendre = (p?: Partie) => {
    if (!p) return
    const estPieceJointe = !!p.filename && !!p.body?.attachmentId
    if (estPieceJointe) {
      pieces.push({
        id: p.body!.attachmentId!,
        nom: p.filename!,
        type: p.mimeType ?? null,
        taille: p.body?.size ?? null,
      })
    } else if (p.body?.data) {
      const texte = decoderBase64Url(p.body.data)
      if (p.mimeType === "text/plain") brut += (brut ? "\n" : "") + texte
      else if (p.mimeType === "text/html") html += (html ? "\n" : "") + texte
    }
    for (const enfant of p.parts ?? []) descendre(enfant)
  }
  descendre(charge)

  return { corps: (brut || texteDepuisHtml(html)).trim(), pieces_jointes: pieces }
}

/**
 * Un fil de discussion accumule les citations du message précédent. Les lire
 * à voix haute ferait relire à Raphaël tout l'historique à chaque message :
 * on coupe à la première ligne de citation ou de signature.
 */
export function sansCitation(corps: string): string {
  const lignes = corps.split("\n")
  const coupures = [
    /^\s*>/,
    /^\s*Le .+ a écrit\s*:/i,
    /^\s*On .+ wrote\s*:/i,
    /^-{2,}\s*Forwarded message/i,
    /^_{5,}$/,
    /^\s*De\s*:\s.+/i,
    /^\s*--\s*$/,
  ]
  const fin = lignes.findIndex((l) => coupures.some((r) => r.test(l)))
  return (fin === -1 ? lignes : lignes.slice(0, fin)).join("\n").trim()
}

/** « Re: » ne se cumule pas : trois allers-retours donneraient « Re: Re: Re: ». */
export function objetDeReponse(objet: string | null): string {
  const base = (objet ?? "").trim()
  if (!base) return "Re:"
  return /^re\s*:/i.test(base) ? base : `Re: ${base}`
}
