/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_COMMIT_SHA?: string
  readonly VITE_BUILD_NUMBER?: string
  readonly VITE_BUILD_VERSION?: string
  readonly VITE_BUILD_DATE?: string
  readonly VITE_NATIVE_EMPREINTE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
