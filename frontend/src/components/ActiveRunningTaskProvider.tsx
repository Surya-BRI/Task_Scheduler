'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { useActiveRunningTaskId } from './use-active-running-task-id'

type ActiveRunningTaskContextValue = ReturnType<typeof useActiveRunningTaskId>

const ActiveRunningTaskContext = createContext<ActiveRunningTaskContextValue | null>(null)

export function ActiveRunningTaskProvider({ children }: { children: ReactNode }) {
  const value = useActiveRunningTaskId()
  return (
    <ActiveRunningTaskContext.Provider value={value}>{children}</ActiveRunningTaskContext.Provider>
  )
}

export function useActiveRunningTaskContext() {
  return useContext(ActiveRunningTaskContext)
}
