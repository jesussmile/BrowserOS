import { useQueryClient } from '@tanstack/react-query'
import { clear } from 'idb-keyval'
import type { FC } from 'react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { resetIdentity } from '@/lib/analytics/identify'
import { sessionStorage } from '@/lib/auth/sessionStorage'

export const LogoutPage: FC = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  useEffect(() => {
    const clearCloudSessionOnly = async () => {
      await sessionStorage.setValue({})
      queryClient.clear()
      await clear()
      resetIdentity()
      navigate('/home', { replace: true })
    }

    clearCloudSessionOnly()
  }, [navigate, queryClient])

  return null
}
