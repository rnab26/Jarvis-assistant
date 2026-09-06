// Les Edge Functions tournent sous Deno, pas sous Node : `tsc` ne connaît ni
// son global `Deno`, ni ses spécificateurs d'import (`jsr:`, `npm:`). Ce
// fichier lui donne le strict minimum pour VÉRIFIER NOTRE code — pas pour le
// compiler ni pour l'exécuter.
//
// POURQUOI IL EXISTE : jusqu'au 6 sept. 2026, rien ne typecheckait
// `supabase/functions/**`. Ni en local (pas de Deno installé dans
// l'environnement des sessions), ni en CI (`npx tsc -b` ne couvre que `src`
// et `scripts/harness`). Une faute de frappe dans voice-command ne se voyait
// donc qu'après déploiement — c'est-à-dire chez Raphaël, sous la forme d'un
// Jarvis muet, et sans que rien ne dise pourquoi.
//
// Les bibliothèques externes sont volontairement typées large : on ne vérifie
// pas le SDK de Google ni celui de Supabase, on vérifie que NOS fichiers se
// tiennent entre eux — les signatures, les imports, les champs qu'on lit.

/* eslint-disable @typescript-eslint/no-explicit-any */

// Import à effet de bord, présent en tête de chaque fonction : il n'apporte
// que les types du runtime Supabase, dont nous n'utilisons rien directement.
declare module "jsr:@supabase/functions-js/edge-runtime.d.ts" {}

declare module "jsr:@supabase/supabase-js@2" {
  // Le client est utilisé partout comme un porteur de `.from()`, `.rpc()` et
  // `.auth` ; le typer finement ici reviendrait à recopier son SDK.
  export type SupabaseClient = {
    from(table: string): any
    rpc(nom: string, args?: Record<string, unknown>): any
    auth: any
    storage: any
    functions: any
    [autre: string]: any
  }
  export function createClient(
    url: string,
    cle: string,
    options?: Record<string, unknown>,
  ): SupabaseClient
}

declare module "npm:@google/genai" {
  export const GoogleGenAI: any
  export const Modality: any
  export const Type: any
}

declare const Deno: {
  env: { get(cle: string): string | undefined }
  serve(gestionnaire: (req: Request) => Response | Promise<Response>): unknown
}
