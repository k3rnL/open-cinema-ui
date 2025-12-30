import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { systemApi } from '../api/system'
import type { AudioSettings } from '../types'

export function useSystemStatus() {
  return useQuery({
    queryKey: ['system', 'status'],
    queryFn: systemApi.getStatus,
    refetchInterval: 5000, // Poll every 5 seconds
  })
}

export function useSetPower() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (power: boolean) => systemApi.setPower(power),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'status'] })
    },
  })
}

export function useSetSource() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (sourceId: string) => systemApi.setSource(sourceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'status'] })
    },
  })
}

export function useSetVolume() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (volume: number) => systemApi.setVolume(volume),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'status'] })
    },
  })
}

export function useSetMute() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (muted: boolean) => systemApi.setMute(muted),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'status'] })
    },
  })
}

export function useUpdateAudioSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (settings: Partial<AudioSettings>) =>
      systemApi.updateAudioSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'status'] })
    },
  })
}

export function useSources() {
  return useQuery({
    queryKey: ['system', 'sources'],
    queryFn: systemApi.getSources,
  })
}
