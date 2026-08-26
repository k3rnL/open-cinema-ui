import {describe, expect, it, vi} from 'vitest'
import {ApiProblemError} from '@open-cinema/shared'
import {type AuthSessionClient, createAuthProvider, type SessionState} from './authProvider'

const authenticated: SessionState = {
  authenticated: true,
  user: {
    id: '1',
    username: 'admin',
    name: 'admin',
    email: '',
    isStaff: true,
    isSuperuser: true,
  },
}

function mockClient() {
  const get = vi.fn()
  const post = vi.fn()
  return {
    client: {get, post} as unknown as AuthSessionClient,
    get,
    post,
  }
}

describe('Refine session auth provider', () => {
  it('bootstraps CSRF and signs in with a username', async () => {
    const {client, get, post} = mockClient()
    get.mockResolvedValueOnce({authenticated: false, user: null})
    post.mockResolvedValueOnce(authenticated)

    const result = await createAuthProvider(client).login({
      username: 'admin',
      password: 'admin',
      remember: false,
    })

    expect(result).toEqual({success: true, redirectTo: '/'})
    expect(get).toHaveBeenCalledWith('/auth/session')
    expect(post).toHaveBeenCalledWith('/auth/login', {
      username: 'admin',
      password: 'admin',
      remember: false,
    })
  })

  it('returns a Refine login error for rejected credentials', async () => {
    const {client, get, post} = mockClient()
    get.mockResolvedValueOnce({authenticated: false, user: null})
    post.mockRejectedValueOnce(new ApiProblemError(401, {detail: 'Incorrect credentials'}))

    const result = await createAuthProvider(client).login({
      username: 'admin',
      password: 'wrong',
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatchObject({name: 'Login failed', message: 'Incorrect credentials'})
  })

  it('protects routes and exposes the Django identity to Refine', async () => {
    const {client, get} = mockClient()
    get.mockResolvedValue(authenticated)
    const provider = createAuthProvider(client)

    await expect(provider.check()).resolves.toEqual({authenticated: true})
    await expect(provider.getIdentity?.()).resolves.toEqual(authenticated.user)
    await expect(provider.getPermissions?.()).resolves.toBe('admin')
  })

  it('redirects an expired session without treating an authorized 403 as logout', async () => {
    const {client, get} = mockClient()
    get
      .mockResolvedValueOnce({authenticated: false, user: null})
      .mockResolvedValueOnce(authenticated)
    const provider = createAuthProvider(client)

    await expect(provider.check()).resolves.toEqual({
      authenticated: false,
      redirectTo: '/login',
    })
    await expect(provider.onError({status: 403})).resolves.toEqual({})
  })

  it('logs out through the CSRF-protected Django endpoint', async () => {
    const {client, get, post} = mockClient()
    get.mockResolvedValueOnce(authenticated)
    post.mockResolvedValueOnce({authenticated: false, user: null})

    await expect(createAuthProvider(client).logout({})).resolves.toEqual({
      success: true,
      redirectTo: '/login',
    })
    expect(post).toHaveBeenCalledWith('/auth/logout', {})
  })
})
