'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Lock, UserCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { setAlexSessionActive } from '@/lib/alex-session'

const ALEX_EMAIL = 'alexjohnson@bri'
const ALEX_PASSWORD = '1234567890'

export default function AlexLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (event) => {
    event.preventDefault()
    const normalizedEmail = email.trim().toLowerCase()
    const normalizedPassword = password.trim()

    if (normalizedEmail !== ALEX_EMAIL || normalizedPassword !== ALEX_PASSWORD) {
      setError('Invalid credentials. Please use the Alex Johnson credentials shown below.')
      return
    }

    setError('')
    setAlexSessionActive()
    router.push('/design-list/my-work')
  }

  return (
    <div className="app-shell relative min-h-screen overflow-hidden bg-slate-50 px-4 py-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-120px] top-[-120px] h-64 w-64 rounded-full bg-blue-200/30 blur-3xl" />
        <div className="absolute bottom-[-140px] right-[-140px] h-72 w-72 rounded-full bg-indigo-200/30 blur-3xl" />
      </div>

      <div className="relative mx-auto mt-6 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-lg shadow-slate-900/5">
        <button
          type="button"
          onClick={() => router.push('/')}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to home
        </button>

        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">Task Scheduler</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Sign in to Alex Johnson account</h1>
          <p className="mt-1 text-sm text-slate-500">
            Continue to your assigned design list and timer workflow.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700" htmlFor="alex-email">
              Username
            </label>
            <div className="relative">
              <UserCircle2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="alex-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                placeholder="Enter username"
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700" htmlFor="alex-password">
              Password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="alex-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="Enter password"
                className="pl-9"
              />
            </div>
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <Button type="submit" className="h-10 w-full">
            Login
          </Button>
        </form>
      </div>
    </div>
  )
}
