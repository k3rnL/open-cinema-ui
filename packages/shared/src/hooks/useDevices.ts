import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { devicesApi } from '../api/devices'
import type { Device } from '../types'

export function useDevices() {
  return useQuery({
    queryKey: ['devices'],
    queryFn: devicesApi.getAll,
  })
}

export function useDevice(id: string) {
  return useQuery({
    queryKey: ['devices', id],
    queryFn: () => devicesApi.getById(id),
    enabled: !!id,
  })
}

export function useCreateDevice() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (device: Omit<Device, 'id'>) => devicesApi.create(device),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
    },
  })
}

export function useUpdateDevice() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Device> }) =>
      devicesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
    },
  })
}

export function useDeleteDevice() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => devicesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
    },
  })
}
