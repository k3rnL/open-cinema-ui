import { apiClient } from './client'
import type { Device } from '../types'

export const devicesApi = {
  getAll: () => apiClient.get<Device[]>('/api/devices'),

  getById: (id: string) => apiClient.get<Device>(`/api/devices/${id}`),

  create: (device: Omit<Device, 'id'>) =>
    apiClient.post<Device>('/api/devices', device),

  update: (id: string, device: Partial<Device>) =>
    apiClient.put<Device>(`/api/devices/${id}`, device),

  delete: (id: string) =>
    apiClient.delete<void>(`/api/devices/${id}`),
}
