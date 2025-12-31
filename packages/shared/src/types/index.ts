export interface Device {
  id: string
  name: string
  device_type: 'CAPTURE' | 'PLAYBACK'
  active: boolean
  lastSeen?: Date
}

export interface AudioSettings {
  volume: number
  muted: boolean
  balance: number
  bass: number
  treble: number
}

export interface VideoSource {
  id: string
  name: string
  type: 'hdmi' | 'optical' | 'analog' | 'network'
  port: number
}

export interface SystemStatus {
  power: boolean
  currentSource?: VideoSource
  audio: AudioSettings
  devices: Device[]
}
