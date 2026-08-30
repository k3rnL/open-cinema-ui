import type { ReactNode } from 'react'
import { Button, Popconfirm, Tooltip } from 'antd'
import type { ButtonProps } from 'antd'

export interface CapabilityActionDescriptor {
  id: string
  label: string
  available: boolean
  reason: string | null
}

export function CapabilityAction({
  action,
  onConfirm,
  confirmation,
  loading,
  danger,
  icon,
  size,
}: {
  action: CapabilityActionDescriptor
  onConfirm: () => void | Promise<void>
  confirmation?: { title: ReactNode; description?: ReactNode }
  loading?: boolean
  danger?: boolean
  icon?: ReactNode
  size?: ButtonProps['size']
}) {
  const button = (
    <Button
      disabled={!action.available}
      loading={loading}
      danger={danger}
      icon={icon}
      size={size}
      onClick={confirmation ? undefined : () => void onConfirm()}
    >
      {action.label}
    </Button>
  )
  const explained = action.available ? button : <Tooltip title={action.reason}>{button}</Tooltip>
  if (!confirmation || !action.available) return explained
  return (
    <Popconfirm
      title={confirmation.title}
      description={confirmation.description}
      okText={action.label}
      onConfirm={onConfirm}
    >
      {button}
    </Popconfirm>
  )
}
