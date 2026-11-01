import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { ZodError } from 'zod'
import { HttpError } from './errors.js'
import {
  eventQuerySchema,
  linkKeySchema,
  linkSchema,
  patchSchema,
  patientSchema,
  sessionSchema,
  uuid,
} from './validation.js'

export function createApp({
  services,
  origin = 'http://localhost:5173',
  publicApiUrl = 'http://localhost:3001',
  distPath,
  trustProxy = false,
  limit = 300,
}) {
  const app = express()

  app.disable('x-powered-by')
  if (trustProxy) app.set('trust proxy', trustProxy)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'", 'https://*.supabase.co'],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: publicApiUrl.startsWith('https:') ? [] : null,
        },
      },
    }),
  )
  app.use(
    cors({
      origin,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type'],
    }),
  )
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Too many requests. Please try again shortly.' },
    }),
  )
  app.use(express.json({ limit: '80kb' }))
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', configured: Boolean(services) }))

  // Google redirects have no bearer token. Single-use state + PKCE authenticates this callback.
  app.get('/api/calendar/callback', async (req, res) => {
    const target = new URL(origin)
    target.hash = '/calendar'
    try {
      if (!services) throw new HttpError(503, 'API configuration is incomplete.')
      await services.calendar.callback(req.query)
      target.searchParams.set('calendar', 'connected')
    } catch {
      target.searchParams.set('calendar', 'failed')
    }
    res.set('Referrer-Policy', 'no-referrer').redirect(303, target.toString())
  })

  app.use('/api', async (req, _res, next) => {
    try {
      if (!services)
        throw new HttpError(503, 'Configure the Express server to connect your practice.')
      const match = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '')
      if (!match) throw new HttpError(401, 'Sign in to open your workspace.')
      req.doctor = await services.verify(match[1])
      next()
    } catch (error) {
      next(error)
    }
  })
  app.get('/api/access', (_req, res) => res.json({ allowed: true }))
  app.get('/api/records', async (req, res) => res.json(await services.records.list(req.doctor)))
  for (const [table, schema] of [
    ['patients', patientSchema],
    ['sessions', sessionSchema],
  ]) {
    app.post(`/api/${table}`, async (req, res) => {
      const record = schema.parse(req.body)
      if (table === 'sessions' && Boolean(record.calendar_id) !== Boolean(record.event_id))
        throw new HttpError(400, 'Calendar and event references must be supplied together.')
      res.status(201).json(await services.records.save(req.doctor, table, record))
    })
    app.patch(`/api/${table}/:id`, async (req, res) => {
      const id = uuid.parse(req.params.id)
      const record = patchSchema(schema).parse(req.body)
      if (
        table === 'sessions' &&
        ('calendar_id' in record || 'event_id' in record) &&
        Boolean(record.calendar_id) !== Boolean(record.event_id)
      )
        throw new HttpError(400, 'Calendar and event references must be supplied together.')
      res.json(await services.records.save(req.doctor, table, record, id))
    })
  }
  app.put('/api/appointment-links', async (req, res) =>
    res.json(await services.records.link(req.doctor, linkSchema.parse(req.body))),
  )
  app.delete('/api/appointment-links', async (req, res) => {
    await services.records.unlink(req.doctor, linkKeySchema.parse(req.body))
    res.status(204).end()
  })
  app.get('/api/calendar/status', async (req, res) =>
    res.json(await services.calendar.status(req.doctor.id)),
  )
  app.post('/api/calendar/connect', async (req, res) =>
    res.json(await services.calendar.connect(req.doctor.id)),
  )
  app.delete('/api/calendar/connection', async (req, res) =>
    res.json(await services.calendar.disconnect(req.doctor.id)),
  )
  app.get('/api/calendar/calendars', async (req, res) =>
    res.json(await services.calendar.calendars(req.doctor.id)),
  )
  app.get('/api/calendar/events', async (req, res) =>
    res.json(await services.calendar.events(req.doctor.id, eventQuerySchema.parse(req.query))),
  )
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }))

  if (distPath && existsSync(join(distPath, 'index.html'))) {
    app.use(
      express.static(distPath, {
        index: false,
        setHeaders: (res) => res.set('Cache-Control', 'no-cache'),
      }),
    )
    app.get('/{*path}', (_req, res) => res.sendFile(join(distPath, 'index.html')))
  }
  app.use((error, _req, res, _next) => {
    if (error instanceof ZodError)
      return res.status(400).json({
        error: 'Check the form fields and try again.',
        fields: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      })
    if (error.type === 'entity.too.large')
      return res.status(413).json({ error: 'This record is too large.' })
    if (error instanceof SyntaxError && error.status === 400)
      return res.status(400).json({ error: 'Invalid JSON request.' })
    const status = error instanceof HttpError ? error.status : 500
    res.status(status).json({
      error:
        error instanceof HttpError
          ? error.message
          : 'The server could not complete this request. Please try again.',
    })
  })
  return app
}
