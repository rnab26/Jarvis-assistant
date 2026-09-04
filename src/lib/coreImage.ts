/**
 * Le « cœur » de Jarvis : l'image du réacteur affichée sous le micro.
 *
 * L'image livrée est déjà détourée. Quand Raphaël en importe une autre depuis
 * les Paramètres, on lui applique le même traitement dans le navigateur :
 * repérer le disque, le recadrer, et rendre transparent tout ce qui l'entoure.
 */

import { pousserCoeurVersWidget } from "@/lib/jarvisWidgetPlugin"
import { ecrireReglage } from "@/lib/reglages"

const STORAGE_KEY = "jarvis_core_image"

/** Image livrée avec l'app, déjà détourée. */
export const CORE_PAR_DEFAUT = `${import.meta.env.BASE_URL}jarvis-core.webp`

/** Côté du rendu final, en pixels. Au-delà on alourdit sans rien gagner. */
const TAILLE = 448

/** En dessous de ce niveau de lumière, un pixel est considéré comme du fond. */
const SEUIL_FOND = 28

export function lireCoreImage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function ecrireCoreImage(dataUrl: string | null) {
  // Passe par ecrireReglage : c'est ce qui fait remonter l'image en base.
  // Sans ça, le réacteur importé à la main disparaissait à la première
  // réinstallation de l'app, sans possibilité de le retrouver.
  ecrireReglage(STORAGE_KEY, dataUrl)
  // Et les widgets, qui tournent hors du WebView et ne voient pas
  // localStorage : sans cet appel, ils resteraient sur l'ancien cœur.
  void pousserCoeurVersWidget(dataUrl)
}

function chargerImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Ce fichier n'est pas une image lisible."))
    }
    img.src = url
  })
}

/**
 * Détoure une image de réacteur : garde le disque, efface ce qu'il y a autour.
 *
 * On ne se contente pas d'effacer les pixels sombres — la structure du
 * réacteur en contient beaucoup, et elle finirait trouée. On cherche donc
 * l'étendue de la matière, on en déduit un disque, et on n'efface qu'au-delà.
 */
export async function detourerCore(file: File): Promise<string> {
  const img = await chargerImage(file)

  // Borne la taille de travail : au-delà on manipule des millions de pixels
  // pour rien, et les téléphones modestes peinent.
  const maxCote = 1024
  const echelle = Math.min(1, maxCote / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * echelle))
  const h = Math.max(1, Math.round(img.naturalHeight * echelle))

  const source = document.createElement("canvas")
  source.width = w
  source.height = h
  const ctxSource = source.getContext("2d", { willReadFrequently: true })
  if (!ctxSource) throw new Error("Le navigateur n'a pas pu préparer l'image.")
  ctxSource.drawImage(img, 0, 0, w, h)

  const { data } = ctxSource.getImageData(0, 0, w, h)

  // Étendue de la matière : le max des canaux plutôt qu'une moyenne, pour que
  // le bleu vif du réacteur ressorte franchement du fond.
  let x0 = w
  let y0 = h
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const lum = Math.max(data[i], data[i + 1], data[i + 2])
      if (lum > SEUIL_FOND && data[i + 3] > 8) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }

  // Image entièrement sombre ou vide : on la recadre au centre, faute de mieux.
  if (x1 < 0) {
    x0 = 0
    y0 = 0
    x1 = w - 1
    y1 = h - 1
  }

  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const rayon = Math.max(x1 - x0, y1 - y0) / 2
  const demi = rayon * 1.01 + 1

  const sortie = document.createElement("canvas")
  sortie.width = TAILLE
  sortie.height = TAILLE
  const ctx = sortie.getContext("2d", { willReadFrequently: true })
  if (!ctx) throw new Error("Le navigateur n'a pas pu préparer l'image.")
  ctx.drawImage(source, cx - demi, cy - demi, demi * 2, demi * 2, 0, 0, TAILLE, TAILLE)

  const rendu = ctx.getImageData(0, 0, TAILLE, TAILLE)
  const px = rendu.data
  const centre = (TAILLE - 1) / 2
  const bord = TAILLE / 2 - 1

  for (let y = 0; y < TAILLE; y++) {
    for (let x = 0; x < TAILLE; x++) {
      const i = (y * TAILLE + x) * 4
      const dist = Math.hypot(x - centre, y - centre)

      // Bord adouci sur deux pixels et demi : un découpage net donnerait un
      // contour en escalier bien visible sur un disque de cette taille.
      let alpha = Math.min(1, Math.max(0, (bord - dist) / 2.5))

      // Le halo déborde un peu du disque : sur la couronne extérieure, on
      // efface aussi les pixels très sombres pour éviter un liseré noir.
      const couronne = Math.min(1, Math.max(0, (dist - bord * 0.86) / (bord * 0.14)))
      if (couronne > 0) {
        const lum = Math.max(px[i], px[i + 1], px[i + 2])
        alpha *= 1 - couronne * Math.min(1, Math.max(0, (40 - lum) / 40))
      }

      px[i + 3] = Math.round(alpha * 255)
    }
  }

  ctx.putImageData(rendu, 0, 0)

  // WebP pour le poids ; PNG si le navigateur ne sait pas l'encoder.
  const webp = sortie.toDataURL("image/webp", 0.88)
  return webp.startsWith("data:image/webp") ? webp : sortie.toDataURL("image/png")
}
