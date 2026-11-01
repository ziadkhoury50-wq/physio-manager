import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library'
import { HttpError } from './errors.js'

const scopes = [
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
]
function keyBytes(key) {
  const bytes = Buffer.from(key || '', 'base64')
  if (bytes.length !== 32)
    throw new HttpError(503, 'Configure the Google token encryption key on the Express server.')
  return bytes
}
export function encryptToken(value, key) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyBytes(key), iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), ciphertext]
    .map((buffer) => buffer.toString('base64url'))
    .join('.')
}
export function decryptToken(value, key) {
  const [iv, tag, ciphertext] = value.split('.').map((part) => Buffer.from(part, 'base64url'))
  const decipher = createDecipheriv('aes-256-gcm', keyBytes(key), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
const stateHash = (state) => createHash('sha256').update(state).digest('hex')

export function createCalendarService(admin, config, clientFactory) {
  const client = () => {
    if (clientFactory) return clientFactory()
    if (!config.googleClientId || !config.googleClientSecret)
      throw new HttpError(503, 'Configure Google Calendar credentials on the Express server.')
    return new OAuth2Client(config.googleClientId, config.googleClientSecret, config.callbackUrl)
  }
  async function connection(owner) {
    const { data, error } = await admin
      .from('google_connections')
      .select('refresh_token_encrypted')
      .eq('owner_id', owner)
      .maybeSingle()
    if (error) throw new HttpError(503, 'Calendar connection could not be loaded.')
    return data
  }
  async function list(owner, path, parameters) {
    const saved = await connection(owner)
    if (!saved) throw new HttpError(409, 'Connect Google Calendar to see your appointments.')
    const google = client()
    google.setCredentials({
      refresh_token: decryptToken(saved.refresh_token_encrypted, config.encryptionKey),
    })
    const items = []
    let nextPageToken
    try {
      do {
        const query = new URLSearchParams({
          ...parameters,
          ...(nextPageToken ? { pageToken: nextPageToken } : {}),
        })
        // These are the only Google Calendar resource requests: always GET.
        const result = await google.request({
          url: `https://www.googleapis.com/calendar/v3/${path}?${query}`,
          method: 'GET',
        })
        items.push(...(result.data.items || []))
        nextPageToken = result.data.nextPageToken
      } while (nextPageToken)
      return { items }
    } catch (error) {
      const status = error.response?.status
      if (status === 401 || status === 400)
        throw new HttpError(
          409,
          'Google access has expired or was revoked. Please reconnect your calendar.',
        )
      if (status === 403)
        throw new HttpError(
          403,
          'Google Calendar access was denied. Check permissions and reconnect.',
        )
      if (status === 404)
        throw new HttpError(
          404,
          'This calendar is no longer available. Choose another calendar in settings.',
        )
      throw new HttpError(503, 'Google Calendar is unavailable. Please try again shortly.')
    }
  }
  return {
    async status(owner) {
      return { connected: Boolean(await connection(owner)) }
    },
    async connect(owner) {
      const google = client()
      const state = randomBytes(32).toString('base64url')
      const { codeVerifier, codeChallenge } = await google.generateCodeVerifierAsync()
      const { error: cleanupError } = await admin
        .from('google_oauth_states')
        .delete()
        .eq('owner_id', owner)
      if (cleanupError) throw new HttpError(503, 'Could not start the Google connection.')
      const { error } = await admin.from('google_oauth_states').insert({
        state_hash: stateHash(state),
        owner_id: owner,
        verifier_encrypted: encryptToken(codeVerifier, config.encryptionKey),
        expires_at: new Date(Date.now() + 10 * 60000).toISOString(),
      })
      if (error) throw new HttpError(503, 'Could not start the Google connection.')
      return {
        url: google.generateAuthUrl({
          access_type: 'offline',
          prompt: 'consent',
          scope: scopes,
          state,
          code_challenge: codeChallenge,
          code_challenge_method: CodeChallengeMethod.S256,
        }),
      }
    },
    async callback(query) {
      if (typeof query.state !== 'string' || query.state.length > 256)
        throw new HttpError(400, 'Invalid calendar connection state.')
      // DELETE ... RETURNING consumes valid state atomically, even after denied consent.
      const { data: state, error } = await admin
        .from('google_oauth_states')
        .delete()
        .eq('state_hash', stateHash(query.state))
        .gt('expires_at', new Date().toISOString())
        .select()
        .maybeSingle()
      if (error || !state)
        throw new HttpError(400, 'Calendar connection expired. Please reconnect.')
      const { data: doctor, error: accessError } = await admin
        .from('app_access')
        .select('doctor_user_id')
        .eq('doctor_user_id', state.owner_id)
        .maybeSingle()
      if (accessError || !doctor) throw new HttpError(403, 'Doctor access is required.')
      if (query.error || typeof query.code !== 'string')
        throw new HttpError(400, 'Google authorization was not completed.')
      const { tokens } = await client().getToken({
        code: query.code,
        codeVerifier: decryptToken(state.verifier_encrypted, config.encryptionKey),
      })
      const granted = new Set((tokens.scope || '').split(' '))
      if (!scopes.every((scope) => granted.has(scope)) || !tokens.refresh_token)
        throw new HttpError(400, 'Google permissions were not granted. Please reconnect.')
      const { error: saveError } = await admin.from('google_connections').upsert({
        owner_id: state.owner_id,
        refresh_token_encrypted: encryptToken(tokens.refresh_token, config.encryptionKey),
        updated_at: new Date().toISOString(),
      })
      if (saveError) throw new HttpError(503, 'Could not save the Google connection.')
    },
    async disconnect(owner) {
      const saved = await connection(owner)
      const { error } = await admin.from('google_connections').delete().eq('owner_id', owner)
      if (error) throw new HttpError(503, 'Could not disconnect Google Calendar.')
      const { error: stateError } = await admin
        .from('google_oauth_states')
        .delete()
        .eq('owner_id', owner)
      if (stateError)
        throw new HttpError(503, 'Calendar connection cleanup failed. Please try again.')
      if (saved) {
        try {
          await client().revokeToken(
            decryptToken(saved.refresh_token_encrypted, config.encryptionKey),
          )
        } catch {
          /* Credentials are removed locally even if remote revocation is unavailable. */
        }
      }
      return { disconnected: true }
    },
    calendars(owner) {
      return list(owner, 'users/me/calendarList', {
        maxResults: '250',
        fields: 'nextPageToken,items(id,summary,primary,timeZone)',
      })
    },
    events(owner, { calendarId, timeMin, timeMax }) {
      return list(owner, `calendars/${encodeURIComponent(calendarId)}/events`, {
        timeMin,
        timeMax,
        singleEvents: 'true',
        orderBy: 'startTime',
        showDeleted: 'false',
        maxResults: '2500',
        fields: 'nextPageToken,items(id,summary,start,end,location,description,htmlLink,status)',
      })
    },
  }
}
