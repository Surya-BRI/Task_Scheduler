// @ts-nocheck
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '../state/AuthContext'

function EyeIcon({ className }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  )
}

function EyeSlashIcon({ className }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  )
}

function Spinner({ className }) {
  return (
    <svg className={`animate-spin ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  )
}

const DESIGN_LIST_PATH = '/design-list/table'
const LOGIN_ARTWORK_SRC = '/login%20page%20image.png'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAuthenticated, login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({ email: '', password: '' })

  const trimmedEmail = email.trim()
  const trimmedPassword = password.trim()
  const canSubmit = trimmedEmail.length > 0 && trimmedPassword.length > 0

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7764/ingest/e645e710-c2d7-43e5-b017-c9b471a21118',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6e2e94'},body:JSON.stringify({sessionId:'6e2e94',runId:'pre-fix',hypothesisId:'H1',location:'src/views/LoginPage.jsx:50',message:'Login asset sources initialized',data:{artworkSrc:LOGIN_ARTWORK_SRC,logoSrc:'/blue-rhine-logo.png'},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }, [])

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7764/ingest/e645e710-c2d7-43e5-b017-c9b471a21118',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6e2e94'},body:JSON.stringify({sessionId:'6e2e94',runId:'pre-fix',hypothesisId:'H3',location:'src/views/LoginPage.jsx:56',message:'Auth state observed in login page',data:{isAuthenticated},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) return
    const fromPath = searchParams.get('from')
    router.replace(fromPath || DESIGN_LIST_PATH)
  }, [isAuthenticated, router, searchParams])

  function validate() {
    const next = { email: '', password: '' }
    if (!trimmedEmail) next.email = 'Username is required.'
    if (!trimmedPassword) next.password = 'Password is required.'
    setFieldErrors(next)
    return !next.email && !next.password
  }

  async function handleLogin(e) {
    e.preventDefault()
    if (!validate()) return
    setIsLoading(true)
    await new Promise((resolve) => setTimeout(resolve, 1200))
    login()
    const fromPath = searchParams.get('from')
    router.replace(fromPath || DESIGN_LIST_PATH)
  }

  if (isAuthenticated) return null

  return (
    <div className="min-h-screen bg-[#e8edf8] p-2 sm:p-4">
      <div className="mx-auto flex min-h-[calc(100vh-1rem)] max-w-[1320px] overflow-hidden rounded-2xl border border-[#bcc6df] bg-white shadow-sm sm:min-h-[calc(100vh-2rem)]">
        <section className="hidden flex-1 overflow-hidden bg-[#9ecbe8] lg:block">
          <img
            src={LOGIN_ARTWORK_SRC}
            alt="Login page"
            className="h-full w-full object-cover"
            onLoad={() => {
              // #region agent log
              fetch('http://127.0.0.1:7764/ingest/e645e710-c2d7-43e5-b017-c9b471a21118',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6e2e94'},body:JSON.stringify({sessionId:'6e2e94',runId:'pre-fix',hypothesisId:'H2',location:'src/views/LoginPage.jsx:90',message:'Login artwork loaded',data:{src:LOGIN_ARTWORK_SRC},timestamp:Date.now()})}).catch(()=>{});
              // #endregion
            }}
            onError={() => {
              // #region agent log
              fetch('http://127.0.0.1:7764/ingest/e645e710-c2d7-43e5-b017-c9b471a21118',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6e2e94'},body:JSON.stringify({sessionId:'6e2e94',runId:'pre-fix',hypothesisId:'H2',location:'src/views/LoginPage.jsx:95',message:'Login artwork failed to load',data:{src:LOGIN_ARTWORK_SRC},timestamp:Date.now()})}).catch(()=>{});
              // #endregion
            }}
          />
        </section>

        <section className="flex w-full items-center justify-center px-6 py-10 sm:px-10 lg:w-[44%]">
          <div className="w-full max-w-[360px]">
            <img
              src="/blue-rhine-logo.png"
              alt="Blue Rhine Industries"
              className="h-10 w-auto object-contain"
              onLoad={() => {
                // #region agent log
                fetch('http://127.0.0.1:7764/ingest/e645e710-c2d7-43e5-b017-c9b471a21118',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6e2e94'},body:JSON.stringify({sessionId:'6e2e94',runId:'pre-fix',hypothesisId:'H4',location:'src/views/LoginPage.jsx:106',message:'Logo loaded',data:{src:'/blue-rhine-logo.png'},timestamp:Date.now()})}).catch(()=>{});
                // #endregion
              }}
              onError={() => {
                // #region agent log
                fetch('http://127.0.0.1:7764/ingest/e645e710-c2d7-43e5-b017-c9b471a21118',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6e2e94'},body:JSON.stringify({sessionId:'6e2e94',runId:'pre-fix',hypothesisId:'H4',location:'src/views/LoginPage.jsx:111',message:'Logo failed to load',data:{src:'/blue-rhine-logo.png'},timestamp:Date.now()})}).catch(()=>{});
                // #endregion
              }}
            />

            <h1 className="mt-6 text-4xl font-semibold text-slate-900">Welcome Back!</h1>
            <p className="mt-2 text-sm text-slate-500">Let&apos;s sign in you</p>

            <form className="mt-8 space-y-5" onSubmit={handleLogin} noValidate>
              <div>
                <input
                  id="login-email"
                  name="email"
                  type="text"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: '' }))
                  }}
                  className="w-full rounded border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  placeholder="Username"
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
                />
                {fieldErrors.email ? (
                  <p id="login-email-error" className="mt-1.5 text-sm text-red-600" role="alert">
                    {fieldErrors.email}
                  </p>
                ) : null}
              </div>

              <div>
                <div className="relative">
                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: '' }))
                    }}
                    className="w-full rounded border border-slate-300 bg-white py-2.5 pl-3 pr-10 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                    placeholder="Password"
                    aria-invalid={Boolean(fieldErrors.password)}
                    aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                  </button>
                </div>
                <div className="mt-1.5 flex justify-end">
                  <a
                    href="#forgot-password"
                    className="text-sm text-slate-700 hover:text-slate-900"
                  >
                    Forgot Password ?
                  </a>
                </div>
                {fieldErrors.password ? (
                  <p id="login-password-error" className="mt-1.5 text-sm text-red-600" role="alert">
                    {fieldErrors.password}
                  </p>
                ) : null}
              </div>

              <button
                type="submit"
                disabled={!canSubmit || isLoading}
                className="flex w-full items-center justify-center gap-2 rounded bg-[#10a6e3] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0f96cd] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? (
                  <>
                    <Spinner className="h-4 w-4 text-white" />
                    Signing in...
                  </>
                ) : (
                  'Login'
                )}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  )
}
