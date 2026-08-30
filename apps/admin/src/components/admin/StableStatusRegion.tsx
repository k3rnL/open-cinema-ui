import type { ReactNode } from 'react'
import { Alert, Skeleton } from 'antd'

export type StableStatus = {
  type: 'success' | 'info' | 'warning' | 'error'
  message: ReactNode
  description?: ReactNode
  action?: ReactNode
}

export function StableStatusRegion({
  status,
  loading = false,
  minHeight = 72,
  label = 'Page status',
}: {
  status?: StableStatus | null
  loading?: boolean
  minHeight?: number
  label?: string
}) {
  return (
    <div role="status" aria-live="polite" aria-label={label} style={{ minHeight }}>
      {loading ? (
        <Skeleton.Input active block style={{ height: Math.max(48, minHeight - 8) }} />
      ) : status ? (
        <Alert showIcon {...status} />
      ) : null}
    </div>
  )
}
