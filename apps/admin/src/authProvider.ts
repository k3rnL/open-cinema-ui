import type {AuthProvider} from '@refinedev/core'
import {ApiClient, ApiProblemError} from '@open-cinema/shared'

export interface SessionUser {
  id: string
  username: string
  name: string
  email: string
  isStaff: boolean
  isSuperuser: boolean
}

export interface SessionState {
  authenticated: boolean
  user: SessionUser | null
}

export interface AuthSessionClient {
  get<T>(endpoint: string): Promise<T>
  post<T>(endpoint: string, data: unknown): Promise<T>
}

interface LoginVariables {
  username?: string
  password?: string
  remember?: boolean
}

function loginError(error: unknown): Error {
  const result = new Error(
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : 'Unable to contact Open Cinema.',
  )
  result.name = 'Login failed'
  return result
}

function statusCode(error: unknown): number | null {
  if (error instanceof ApiProblemError) return error.status
  if (typeof error === 'object' && error !== null) {
    if ('statusCode' in error && typeof error.statusCode === 'number') return error.statusCode
    if ('status' in error && typeof error.status === 'number') return error.status
  }
  return null
}

export function createAuthProvider(client: AuthSessionClient): AuthProvider {
  const readSession = () => client.get<SessionState>('/auth/session')

  return {
    login: async (variables: LoginVariables) => {
      try {
        // This safe request creates the CSRF cookie required by Django login.
        await readSession()
        const session = await client.post<SessionState>('/auth/login', {
          username: variables.username,
          password: variables.password,
          remember: variables.remember ?? false,
        })
        if (!session.authenticated) {
          return {success: false, error: loginError('Invalid credentials')}
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('open-cinema-session-changed'))
        }
        return {success: true, redirectTo: '/'}
      } catch (error) {
        return {success: false, error: loginError(error)}
      }
    },
    logout: async () => {
      try {
        const session = await readSession()
        if (session.authenticated) {
          await client.post<SessionState>('/auth/logout', {})
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('open-cinema-session-changed'))
        }
        return {success: true, redirectTo: '/login'}
      } catch (error) {
        return {success: false, error: loginError(error)}
      }
    },
    check: async () => {
      try {
        const session = await readSession()
        return session.authenticated
          ? {authenticated: true}
          : {authenticated: false, redirectTo: '/login'}
      } catch (error) {
        return {
          authenticated: false,
          redirectTo: '/login',
          error: loginError(error),
        }
      }
    },
    onError: async (error) => {
      if (![401, 403].includes(statusCode(error) ?? 0)) return {}
      try {
        const session = await readSession()
        return session.authenticated
          ? {}
          : {logout: true, redirectTo: '/login'}
      } catch {
        return {logout: true, redirectTo: '/login'}
      }
    },
    getIdentity: async () => (await readSession()).user,
    getPermissions: async () => {
      const user = (await readSession()).user
      return user?.isSuperuser ? 'admin' : user ? 'user' : null
    },
  }
}

export const authProvider = createAuthProvider(
  new ApiClient(import.meta.env.VITE_API_URL || undefined),
)
