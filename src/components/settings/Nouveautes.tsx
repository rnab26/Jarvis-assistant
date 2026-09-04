import { useState, type ReactNode } from "react"
import type { DevItem } from "@/types/database"

/**
 * Ce qui a été livré récemment, un titre par ligne.
 *
 * Raphaël, 4 sept. 2026 : « aujourd'hui les nouveautés, je les vois comme des
 * pavés ». C'était exact — la note complète de chaque chantier s'affichait
 * d'un bloc, et ces notes sont écrites pour les sessions Claude Code, pas
 * pour lui : elles font dix lignes et citent des noms de fichiers.
 *
 * Ici, on ne montre que le titre. La note s'ouvre à l'appui, sur celle qui
 * l'intéresse. Rien n'est perdu, mais rien n'est imposé.
 */

/** Les notes archivées finissent souvent par « Commit <hash> » : on rend ce
 * hash cliquable vers GitHub pour retrouver le code réel en un appui. */
function renderNotes(notes: string): ReactNode {
  const match = notes.match(/^([\s\S]*commit )([0-9a-f]{7,40})(\.?)$/i)
  if (!match) return notes
  const [, prefix, hash, suffix] = match
  return (
    <>
      {prefix}
      <a
        href={`https://github.com/rnab26/Jarvis-assistant/commit/${hash}`}
        target="_blank"
        rel="noreferrer"
        className="underline"
      >
        {hash}
      </a>
      {suffix}
    </>
  )
}

export function Nouveautes({ items }: { items: DevItem[] }) {
  const [ouvert, setOuvert] = useState<string | null>(null)

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Rien à afficher pour l'instant.</p>
  }

  return (
    <ul className="flex flex-col divide-y rounded-lg border">
      {items.map((item) => {
        const deplie = ouvert === item.id
        return (
          <li key={item.id}>
            <button
              type="button"
              aria-expanded={deplie}
              onClick={() => setOuvert(deplie ? null : item.id)}
              className="w-full px-3 py-2 text-left"
            >
              <span className={`block text-sm ${deplie ? "" : "truncate"}`}>{item.title}</span>
              {item.notes && (
                <span className="block text-xs text-muted-foreground">
                  {deplie ? renderNotes(item.notes) : "Appuie pour le détail"}
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
