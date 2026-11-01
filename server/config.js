export function resolvePublicUrls(env) {
  const port = Number(env.PORT || 3001)
  const origin = new URL(env.APP_URL || env.RENDER_EXTERNAL_URL || 'http://localhost:5173').origin
  const apiOrigin = new URL(
    env.API_PUBLIC_URL || env.RENDER_EXTERNAL_URL || `http://localhost:${port}`,
  ).origin
  return {
    port,
    origin,
    publicApiUrl: apiOrigin,
    callbackUrl: `${apiOrigin}/api/calendar/callback`,
  }
}
