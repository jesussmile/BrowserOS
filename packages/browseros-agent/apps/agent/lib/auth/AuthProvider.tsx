import type { FC, PropsWithChildren } from 'react'
import { useEffect } from 'react'
import { resetIdentity } from '@/lib/analytics/identify'
import { useSessionInfo } from './sessionStorage'

/**
 * Private fork default: cloud account login is disabled. Provider OAuth
 * flows remain separate and are handled by the local PannamOS server.
 */
export const AuthProvider: FC<PropsWithChildren> = ({ children }) => {
  const { updateSessionInfo } = useSessionInfo()

  useEffect(() => {
    updateSessionInfo({})
    resetIdentity()
  }, [updateSessionInfo])

  return <>{children}</>
}
