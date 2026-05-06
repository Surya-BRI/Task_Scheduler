const ALEX_SESSION_KEY = 'task_scheduler_alex_session'

export function isAlexSessionActive() {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(ALEX_SESSION_KEY) === '1'
}

export function setAlexSessionActive() {
  if (typeof window === 'undefined') return
  localStorage.setItem(ALEX_SESSION_KEY, '1')
}

export function clearAlexSession() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(ALEX_SESSION_KEY)
}
