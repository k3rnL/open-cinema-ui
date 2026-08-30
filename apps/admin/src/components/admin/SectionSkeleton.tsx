import { Card, Skeleton, Space } from 'antd'

export function SectionSkeleton({ title, rows = 3 }: { title?: string; rows?: number }) {
  return (
    <Card title={title} aria-busy="true">
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Skeleton active title={false} paragraph={{ rows }} />
      </Space>
    </Card>
  )
}
