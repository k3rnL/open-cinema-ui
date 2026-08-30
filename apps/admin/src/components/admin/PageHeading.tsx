import type { ReactNode } from 'react'
import { Flex, Space, Typography } from 'antd'

const { Paragraph, Title } = Typography

export function PageHeading({
  title,
  description,
  actions,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <Flex justify="space-between" align="flex-start" gap="middle" wrap="wrap">
      <Space direction="vertical" size={0}>
        <Title level={2} style={{ margin: 0 }}>
          {title}
        </Title>
        {description ? (
          <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
            {description}
          </Paragraph>
        ) : null}
      </Space>
      {actions ? <Space wrap>{actions}</Space> : null}
    </Flex>
  )
}
