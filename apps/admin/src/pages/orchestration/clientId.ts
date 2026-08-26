interface BrowserCrypto {
  randomUUID?: () => string
  getRandomValues?: (values: Uint8Array) => Uint8Array
}

function randomBytes(source: BrowserCrypto | undefined): Uint8Array {
  const values = new Uint8Array(16)
  if (source?.getRandomValues) return source.getRandomValues(values)
  for (let index = 0; index < values.length; index += 1) {
    values[index] = Math.floor(Math.random() * 256)
  }
  return values
}

/**
 * Generate a client-only UUID on HTTPS, localhost, or a plain-HTTP appliance LAN.
 * `crypto.randomUUID()` is unavailable in browsers outside a secure context, while
 * `getRandomValues()` remains available for this use case.
 */
export function createClientId(source: BrowserCrypto | undefined = globalThis.crypto): string {
  if (source?.randomUUID) return source.randomUUID()
  const values = randomBytes(source)
  values[6] = (values[6] & 0x0f) | 0x40
  values[8] = (values[8] & 0x3f) | 0x80
  const encoded = Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('')
  return [encoded.slice(0, 8), encoded.slice(8, 12), encoded.slice(12, 16), encoded.slice(16, 20), encoded.slice(20)].join('-')
}
