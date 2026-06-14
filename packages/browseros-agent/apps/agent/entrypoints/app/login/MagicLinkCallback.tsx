import type { FC } from 'react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router'

export const MagicLinkCallback: FC = () => {
  const navigate = useNavigate()

  useEffect(() => {
    navigate('/login', { replace: true })
  }, [navigate])

  return null
}
