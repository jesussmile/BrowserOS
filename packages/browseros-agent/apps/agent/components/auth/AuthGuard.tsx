import type { FC, ReactNode } from 'react'

interface AuthGuardProps {
  children: ReactNode
}

export const AuthGuard: FC<AuthGuardProps> = ({ children }) => {
  return <>{children}</>
}
