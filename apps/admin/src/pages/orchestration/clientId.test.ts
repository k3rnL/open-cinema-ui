import {describe, expect, it, vi} from 'vitest'
import {createClientId} from './clientId'

describe('createClientId', () => {
  it('uses the native UUID API when the browser exposes it', () => {
    const randomUUID = vi.fn(() => 'native-id')
    expect(createClientId({randomUUID})).toBe('native-id')
    expect(randomUUID).toHaveBeenCalledOnce()
  })

  it('creates an RFC 4122 version 4 ID when randomUUID is unavailable on HTTP', () => {
    const getRandomValues = vi.fn((values: Uint8Array) => {
      values.set(Array.from({length: 16}, (_, index) => index))
      return values
    })

    expect(createClientId({getRandomValues})).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f')
    expect(getRandomValues).toHaveBeenCalledOnce()
  })
})
