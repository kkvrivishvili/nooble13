//<reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_API_URL: string
  readonly VITE_USE_MOCK: string
  readonly VITE_ORCHESTRATOR_SERVICE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Allow importing plain CSS files in TypeScript
declare module '*.css';
