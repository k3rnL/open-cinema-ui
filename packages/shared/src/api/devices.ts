import {apiClient} from './client'
import type {Device} from '../types'

export const devicesApi = {
    getAll: () => apiClient.get<Device[]>('/devices'),

    getById: (id: string) => apiClient.get<Device>(`/devices/${id}`),

    create: (device: Omit<Device, 'id' | 'status' | 'lastSeen'>) =>
        apiClient.post<Device>('/devices', device),

    delete: (id: string) => apiClient.delete<void>(`/devices/${id}`),

    update: () => apiClient.post<void>('/devices/update', {}),
}
