import {apiClient} from './client'
import type {AudioDevice} from '../types'

export const devicesApi = {
    getAll: () => apiClient.get<AudioDevice[]>('/devices'),

    getById: (id: string) => apiClient.get<AudioDevice>(`/devices/${id}`),

    create: (device: Omit<AudioDevice, 'id' | 'active' | 'lastSeen'>) =>
        apiClient.post<AudioDevice>('/devices', device),

    delete: (id: string) => apiClient.delete<void>(`/devices/${id}`),

    update: () => apiClient.post<void>('/devices/update', {}),
}
