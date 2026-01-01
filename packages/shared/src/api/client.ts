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

  async get<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    return response.json() as Promise<T>
  }

  async post<T>(endpoint: string, data: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    return response.json() as Promise<T>
  }

  async put<T>(endpoint: string, data: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    return response.json() as Promise<T>
  }

  async delete<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    return response.json() as Promise<T>
  }
}

export const apiClient = new ApiClient()
