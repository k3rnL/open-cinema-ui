import { ApiClient } from './client'

export { ApiClient, apiClient } from './client'

// Helper to create a configured API client for apps
export function createApiClient(apiUrl?: string) {
  return new ApiClient(apiUrl)
}
