import {
  COTE_MAX_PHOTO,
  POIDS_MAX_PHOTO,
  QUALITES_PHOTO,
  tailleReduite,
} from "@/lib/decisions"

/**
 * Réduire une photo AVANT de l'envoyer, dans le navigateur.
 *
 * La partie qui décide (côté maximal, poids visé, échelle de qualité) est dans
 * `decisions.ts`, qui se vérifie sans navigateur. Ici il n'y a que le canvas.
 *
 * Raphaël joint des captures d'écran depuis la 4G : une capture brute fait 2
 * à 4 Mo. Envoyée telle quelle, elle met une minute ou échoue — et un envoi
 * qui échoue en silence, c'est exactement ce qui lui a fait recommencer ses
 * réponses trois fois le 5 sept.
 */
export async function compresserPhoto(fichier: File): Promise<Blob> {
  const image = await chargerImage(fichier)
  const { largeur, hauteur } = tailleReduite(image.width, image.height, COTE_MAX_PHOTO)

  const toile = document.createElement("canvas")
  toile.width = largeur
  toile.height = hauteur
  const ctx = toile.getContext("2d")
  if (!ctx) throw new Error("Impossible de préparer la photo sur cet appareil.")
  // Un fond blanc : un PNG transparent aplati en JPEG donnerait du noir.
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, largeur, hauteur)
  ctx.drawImage(image, 0, 0, largeur, hauteur)
  if ("close" in image && typeof image.close === "function") image.close()

  let dernier: Blob | null = null
  for (const qualite of QUALITES_PHOTO) {
    const blob = await enBlob(toile, qualite)
    dernier = blob
    if (blob.size <= POIDS_MAX_PHOTO) return blob
  }
  // Aucune qualité n'a suffi : on rend quand même la plus légère plutôt que
  // de refuser. C'est à l'appelant de dire si ça passe — refuser ici, c'est
  // perdre la capture d'écran qu'il vient de choisir.
  if (!dernier) throw new Error("Impossible de préparer la photo sur cet appareil.")
  return dernier
}

function chargerImage(fichier: File): Promise<HTMLImageElement | ImageBitmap> {
  // createImageBitmap gère l'orientation EXIF des photos prises au téléphone,
  // qu'une balise <img> affiche parfois couchées.
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(fichier, { imageOrientation: "from-image" }).catch(() =>
      viaBalise(fichier),
    )
  }
  return viaBalise(fichier)
}

function viaBalise(fichier: File): Promise<HTMLImageElement> {
  return new Promise((resoudre, rejeter) => {
    const url = URL.createObjectURL(fichier)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resoudre(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      rejeter(new Error("Ce fichier n'est pas une image lisible."))
    }
    img.src = url
  })
}

function enBlob(toile: HTMLCanvasElement, qualite: number): Promise<Blob> {
  return new Promise((resoudre, rejeter) => {
    toile.toBlob(
      (blob) => (blob ? resoudre(blob) : rejeter(new Error("La photo n'a pas pu être préparée."))),
      "image/jpeg",
      qualite,
    )
  })
}
