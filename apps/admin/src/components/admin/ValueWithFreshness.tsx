import type { ReactNode } from 'react'
import { Badge, Flex, Tooltip, Typography } from 'antd'

const { Text } = Typography

export function ValueWithFreshness({
  value,
  observedAt,
  stale = false,
  unknownLabel = 'Unknown',
}: {
  value: ReactNode | null | undefined
  observedAt?: string | null
  stale?: boolean
  unknownLabel?: string
}) {
  const age = observedAt ? new Date(observedAt).toLocaleString() : 'No observation timestamp'
  return (
    <Flex gap="small" align="center" wrap="wrap">
      <Text type={value === null || value === undefined ? 'secondary' : undefined}>
        {value ?? unknownLabel}
      </Text>
      <Tooltip title={age}>
        <Badge status={stale ? 'warning' : observedAt ? 'success' : 'default'} text={stale ? 'Stale' : observedAt ? 'Current' : 'Unknown'} />
      </Tooltip>
    </Flex>
  )
}
