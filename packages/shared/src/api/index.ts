import { ApiClient } from './client'

export { ApiClient, apiClient } from './client'
export { devicesApi } from './devices'
export { systemApi } from './system'

// Helper to create a configured API client for apps
export function createApiClient(apiUrl?: string) {
  return new ApiClient(apiUrl)
}
