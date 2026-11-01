import { useState } from 'react'
import { Activity, ArrowRight, Heart, LoaderCircle, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Brand, Field } from './UI'

export default function SignIn({ onSession }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) throw authError
      onSession(data.session)
    } catch {
      setError('Unable to sign in. Check your email and password and try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="login-page">
      <div className="login-story">
        <Brand />
        <div>
          <span className="eyebrow">BUILT AROUND YOUR PRACTICE</span>
          <h1>
            Less admin.
            <br />
            More care.
          </h1>
          <p>
            Your schedule, your patients, and every step of their recovery. Together in one calm
            space.
          </p>
          <div className="login-art">
            <Heart size={100} strokeWidth={0.8} />
            <Activity size={76} strokeWidth={1} />
          </div>
        </div>
        <small>Thoughtfully simple. Just for your practice.</small>
      </div>
      <div className="login-form">
        <form onSubmit={submit}>
          <span className="mini-label">
            <ShieldCheck size={16} /> YOUR PRIVATE WORKSPACE
          </span>
          <h2>Welcome back, doctor.</h2>
          <p>Sign in to take care of your day.</p>
          <Field label="Email address">
            <input
              autoComplete="username"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="doctor@yourclinic.com"
            />
          </Field>
          <Field label="Password">
            <input
              autoComplete="current-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
            />
          </Field>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary full" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={17} /> : <ArrowRight size={17} />} Sign in
          </button>
          <p className="login-note">
            Your account is managed directly in Supabase.
            <br />
            Contact your administrator if you need access.
          </p>
        </form>
      </div>
    </div>
  )
}
