// @ts-nocheck
'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'bri_authenticated'

/** @type {{ name: string, role: string }} */
export const DEMO_USER = {
  name: 'Sarah',
  role: 'Designer',
}

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    setIsAuthenticated(sessionStorage.getItem(STORAGE_KEY) === '1')
    setIsHydrated(true)
  }, [])

  const login = useCallback(() => {
    sessionStorage.setItem(STORAGE_KEY, '1')
    setIsAuthenticated(true)
  }, [])

  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY)
    setIsAuthenticated(false)
  }, [])

  const value = useMemo(
    () => ({
      isAuthenticated,
      isHydrated,
      user: DEMO_USER,
      login,
      logout,
    }),
    [isAuthenticated, isHydrated, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
