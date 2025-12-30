import { apiClient } from './client'
import type { SystemStatus, AudioSettings, VideoSource } from '../types'

export const systemApi = {
  getStatus: () => apiClient.get<SystemStatus>('/api/system/status'),

  setPower: (power: boolean) =>
    apiClient.post<void>('/api/system/power', { power }),

  setSource: (sourceId: string) =>
    apiClient.post<void>('/api/system/source', { sourceId }),

  setVolume: (volume: number) =>
    apiClient.post<void>('/api/system/audio/volume', { volume }),

  setMute: (muted: boolean) =>
    apiClient.post<void>('/api/system/audio/mute', { muted }),

  updateAudioSettings: (settings: Partial<AudioSettings>) =>
    apiClient.put<AudioSettings>('/api/system/audio', settings),

  getSources: () => apiClient.get<VideoSource[]>('/api/system/sources'),
}
