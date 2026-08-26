import { Alert, Card, Collapse, Descriptions, Empty, Space, Tag, Timeline, Typography } from 'antd'
import type { CurrentPlanDto, JsonObject } from '@open-cinema/shared'

const { Text, Title } = Typography

interface PlanExplanationProps {
  current: CurrentPlanDto | null
}

function entries(value: unknown): Array<[string, unknown]> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.entries(value)
    : []
}

function JSONEvidence({ value }: { value: unknown }) {
  return (
    <pre style={{ whiteSpace: 'pre-wrap', margin: 0, maxHeight: 280, overflow: 'auto' }}>
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

export function PlanExplanation({ current }: PlanExplanationProps) {
  const plan = current?.plan
  if (!plan) return <Empty description="No plan has been resolved for this graph yet." />
  const document = plan.document as JsonObject
  const explanation = plan.explanation as JsonObject
  const summary = explanation.summary as JsonObject | undefined
  const warnings = Array.isArray(document.warnings) ? document.warnings : []
  const errors = Array.isArray(document.errors) ? document.errors : []
  const bindings = Array.isArray(document.endpointBindings) ? document.endpointBindings : []
  const stages = Array.isArray(explanation.stages) ? explanation.stages : []

  return (
    <section aria-labelledby="plan-explanation-title">
      <Title level={4} id="plan-explanation-title">
        Why audio is routed this way
      </Title>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Alert
          type={plan.status === 'resolved' ? 'success' : plan.status === 'invalid' ? 'error' : 'warning'}
          showIcon
          message={`Resolution: ${plan.status}; applied: ${current.applied.status}`}
          description={`Desired v${plan.desiredStateVersion}, world ${plan.worldGeneration}:${plan.worldSequence}, transition ${current.applied.transitionGeneration}`}
        />
        <Descriptions bordered size="small" column={{ xs: 1, md: 3 }}>
          <Descriptions.Item label="Selected endpoints">
            {Array.isArray(summary?.selectedEndpoints)
              ? summary.selectedEndpoints.map(String).join(', ') || 'none'
              : 'none'}
          </Descriptions.Item>
          <Descriptions.Item label="Selected paths">
            {Array.isArray(summary?.selectedEdges) ? summary.selectedEdges.length : 0}
          </Descriptions.Item>
          <Descriptions.Item label="Correlation">{plan.correlationId}</Descriptions.Item>
        </Descriptions>
        <Card size="small" title="Endpoint decisions">
          {bindings.length ? (
            bindings.map((binding, index) => (
              <Tag key={index} color={(binding as JsonObject).runtimeKey ? 'green' : 'orange'}>
                {String((binding as JsonObject).logicalEndpointId)}: {String((binding as JsonObject).status)}
              </Tag>
            ))
          ) : (
            <Text type="secondary">No endpoint decision was recorded.</Text>
          )}
        </Card>
        <Timeline
          items={stages.map((stage, index) => ({
            key: index,
            color: Number((stage as JsonObject).errors ?? 0) > 0 ? 'red' : 'green',
            children: `${String((stage as JsonObject).stage)} — ${String(
              (stage as JsonObject).warnings ?? 0,
            )} warning(s), ${String((stage as JsonObject).errors ?? 0)} error(s)`,
          }))}
        />
        {errors.length > 0 && (
          <Alert type="error" message="Blocking resolution errors" description={<JSONEvidence value={errors} />} />
        )}
        {warnings.length > 0 && (
          <Alert type="warning" message="Degraded or rejected alternatives" description={<JSONEvidence value={warnings} />} />
        )}
        <Collapse
          items={[
            ['Triggers and conditions', explanation.conditionResults],
            ['Winning and rejected selections', explanation.selectionDecisions],
            ['Manual overrides', explanation.overrideDecisions],
            ['Signal and processor decisions', document.signalContracts],
            ['Processor resources and profiles', document.resourceDecisions],
            ['Planned actions', document.actionIntent],
          ].map(([label, value], index) => ({
            key: index,
            label: `${label} (${entries(value).length || (Array.isArray(value) ? value.length : 0)})`,
            children: <JSONEvidence value={value ?? {}} />,
          }))}
        />
      </Space>
    </section>
  )
}
