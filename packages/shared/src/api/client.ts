export interface ApiRequestOptions {
  headers?: Record<string, string>
  signal?: AbortSignal
}

export interface ApiResponse<T> {
  data: T
  status: number
  etag: string | null
  apiVersion: string | null
  headers: Headers
}

const CSRF_COOKIE_NAME = 'csrftoken'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE'])

function cookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const prefix = `${name}=`
  const value = document.cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix))
  return value ? decodeURIComponent(value.slice(prefix.length)) : null
}

export class ApiProblemError extends Error {
  constructor(
    readonly status: number,
    readonly problem: unknown,
  ) {
    super(
      typeof problem === 'object' && problem !== null && 'detail' in problem
        ? String(problem.detail)
        : `HTTP error ${status}`,
    )
    this.name = 'ApiProblemError'
  }
}

export class ApiClient {
  private readonly baseUrl: string

  constructor(baseUrl?: string) {
    // Use the same host as the app, or allow override
    if (baseUrl) {
      this.baseUrl = baseUrl
    } else if (typeof window !== 'undefined') {
      // Use current origin + /api path
      this.baseUrl = `${window.location.origin}/api`
    } else {
      // Fallback for SSR or non-browser environments
      this.baseUrl = 'http://localhost/api'
    }
  }

  url(endpoint: string): string {
    return `${this.baseUrl}${endpoint}`
  }

  async request<T>(
    method: string,
    endpoint: string,
    data?: unknown,
    options: ApiRequestOptions = {},
  ): Promise<ApiResponse<T>> {
    const hasBody = data !== undefined
    const csrfToken = SAFE_METHODS.has(method.toUpperCase()) ? null : cookie(CSRF_COOKIE_NAME)
    const response = await fetch(this.url(endpoint), {
      method,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        ...(csrfToken ? { 'X-CSRFToken': csrfToken } : {}),
        ...options.headers,
      },
      body: hasBody ? JSON.stringify(data) : undefined,
      signal: options.signal,
    })
    const text = response.status === 204 ? '' : await response.text()
    let decoded: unknown = null
    if (text) {
      try {
        decoded = JSON.parse(text)
      } catch {
        decoded = text
      }
    }
    if (!response.ok) {
      throw new ApiProblemError(response.status, decoded)
    }
    return {
      data: decoded as T,
      status: response.status,
      etag: response.headers.get('ETag'),
      apiVersion: response.headers.get('Open-Cinema-API-Version'),
      headers: response.headers,
    }
  }

  async get<T>(endpoint: string, options?: ApiRequestOptions): Promise<T> {
    return (await this.request<T>('GET', endpoint, undefined, options)).data
  }

  async post<T>(endpoint: string, data: unknown, options?: ApiRequestOptions): Promise<T> {
    return (await this.request<T>('POST', endpoint, data, options)).data
  }

  async patch<T>(endpoint: string, data: unknown, options?: ApiRequestOptions): Promise<T> {
    return (await this.request<T>('PATCH', endpoint, data, options)).data
  }

  async put<T>(endpoint: string, data: unknown, options?: ApiRequestOptions): Promise<T> {
    return (await this.request<T>('PUT', endpoint, data, options)).data
  }

  async delete<T>(endpoint: string, options?: ApiRequestOptions): Promise<T> {
    return (await this.request<T>('DELETE', endpoint, undefined, options)).data
  }
}

export const apiClient = new ApiClient()
