/** Hash du commit sur lequel ce build a été fait, injecté par la CI
 * (VITE_COMMIT_SHA=${{ github.sha }}) — "dev" en local. */
export const COMMIT_SHA = import.meta.env.VITE_COMMIT_SHA ?? "dev"
