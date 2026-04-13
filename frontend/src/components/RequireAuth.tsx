import { Text } from '@radix-ui/themes'
import { useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { ready, configError, session } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (ready && !configError && !session) {
      navigate('/login', { replace: true })
    }
  }, [ready, configError, session, navigate])

  if (!ready) {
    return null
  }

  if (configError) {
    return (
      <Text size="2" color="gray" className="leading-relaxed">
        {configError}
      </Text>
    )
  }

  if (!session) {
    return null
  }

  return children
}
