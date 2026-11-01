import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Only these two PUBLIC values may enter the browser bundle. Keep server secrets out.
  const supabaseUrl = env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? ''
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_PUBLISHABLE_KEY ?? ''
  return {
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(publishableKey),
    },
    server: { proxy: { '/api': 'http://127.0.0.1:3001' } },
    plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  }
})
