import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { createServices } from './services.js'
import { resolvePublicUrls } from './config.js'
import { createClinicalAssistant } from './clinical-assistant.js'

dotenv.config({ path: '.env.server', quiet: true })
const { origin, port, publicApiUrl, callbackUrl } = resolvePublicUrls(process.env)
const config = {
  supabaseUrl: process.env.SUPABASE_URL,
  publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  encryptionKey: process.env.GOOGLE_TOKEN_ENCRYPTION_KEY,
  callbackUrl,
}
const configured = Boolean(config.supabaseUrl && config.publishableKey && config.serviceKey)
const app = createApp({
  clinicalAssistant: createClinicalAssistant({
    key: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || undefined,
    fallbackModels: process.env.GEMINI_FALLBACK_MODELS?.split(','),
  }),
  services: configured ? createServices(config) : null,
  origin,
  publicApiUrl,
  distPath: fileURLToPath(new URL('../dist', import.meta.url)),
  trustProxy: process.env.TRUST_PROXY_HOPS ? Number(process.env.TRUST_PROXY_HOPS) : false,
})
const server = app.listen(port, process.env.HOST || '0.0.0.0', () =>
  console.log(
    `Express API listening on port ${port}${configured ? '' : ' (Supabase is not configured)'}`,
  ),
)
function shutdown() {
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10000).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
