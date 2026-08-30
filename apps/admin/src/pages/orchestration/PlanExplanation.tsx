import {
  Alert,
  Card,
  Collapse,
  Descriptions,
  Empty,
  List,
  Result,
  Space,
  Steps,
  Tag,
  Typography,
} from 'antd'
import type {
  CurrentPlanDto,
  JsonObject,
  RuntimeExplanationPresentationDto,
} from '@open-cinema/shared'

const {Paragraph, Text, Title} = Typography

interface PlanExplanationProps {
  current: CurrentPlanDto | null
}

function JSONEvidence({value}: {value: unknown}) {
  return (
    <pre style={{whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0, maxHeight: 360, overflow: 'auto'}}>
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

function humanValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not reported'
  if (Array.isArray(value)) return value.map(humanValue).join(', ')
  if (typeof value === 'object') {
    return Object.entries(value as JsonObject)
      .filter(([, item]) => item !== null && item !== undefined && item !== '')
      .map(([key, item]) => `${key.replace(/([a-z])([A-Z])/g, '$1 $2')}: ${humanValue(item)}`)
      .join(' · ') || 'No change reported'
  }
  return String(value)
}

function resultStatus(status: RuntimeExplanationPresentationDto['headline']['status']) {
  if (status === 'active') return 'success' as const
  if (status === 'failed') return 'error' as const
  if (status === 'waiting') return 'info' as const
  return 'warning' as const
}

export function PlanExplanation({current}: PlanExplanationProps) {
  const plan = current?.plan
  if (!plan) return <Empty description="No plan has been resolved for this graph yet."/>
  const presentation = plan.explanation.presentation

  if (!presentation) {
    return (
      <Space direction="vertical" style={{width: '100%'}}>
        <Alert
          type={plan.status === 'invalid' ? 'error' : 'warning'}
          showIcon
          message="A human explanation is not available for this older plan"
          description="Reapply the graph to generate the current explanation format. The technical plan remains available below."
        />
        <Collapse items={[{key: 'technical', label: 'Technical plan', children: <JSONEvidence value={plan}/>}]}/>
      </Space>
    )
  }

  const selectionWinner = presentation.selection.winner
    ?? presentation.route.find((segment) => segment.role === 'output')?.name
    ?? 'No output selected'
  const transitionDuration = presentation.transition.durationMs === null
    ? 'Not measured'
    : `${presentation.transition.durationMs} ms`

  return (
    <section aria-labelledby="plan-explanation-title">
      <Title level={4} id="plan-explanation-title">Resolved audio</Title>
      <Space direction="vertical" size="large" style={{width: '100%'}}>
        <Card size="small" title="Result">
          <Result
            status={resultStatus(presentation.headline.status)}
            title={presentation.headline.title}
            subTitle={presentation.headline.summary}
          />
        </Card>

        <Card size="small" title="Audio path">
          {presentation.route.length ? (
            <Steps
              responsive
              size="small"
              current={presentation.route.length - 1}
              items={presentation.route.map((segment) => ({
                title: segment.name,
                description: segment.detail ?? segment.role,
                status: 'finish',
              }))}
            />
          ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No complete audio path is currently available."/>}
        </Card>

        <Card size="small" title="Why this route">
          <Descriptions size="small" bordered column={{xs: 1, md: 2}}>
            <Descriptions.Item label="Selected">{selectionWinner}</Descriptions.Item>
            <Descriptions.Item label="Trigger">{presentation.selection.trigger}</Descriptions.Item>
            <Descriptions.Item label="Reason">{presentation.selection.reason}</Descriptions.Item>
          </Descriptions>
          {presentation.alternatives.length ? (
            <List
              style={{marginTop: 12}}
              header={<Text strong>Other available choices</Text>}
              dataSource={presentation.alternatives}
              renderItem={(alternative) => (
                <List.Item>
                  <List.Item.Meta
                    title={<Space><Text>{alternative.name}</Text><Tag>{alternative.status.replace('-', ' ')}</Tag></Space>}
                    description={alternative.reason}
                  />
                </List.Item>
              )}
            />
          ) : <Paragraph type="secondary" style={{margin: '12px 0 0'}}>No rejected or unavailable alternative affected this route.</Paragraph>}
        </Card>

        <Card size="small" title="Signal and processing">
          <Space direction="vertical" size="middle" style={{width: '100%'}}>
            <Descriptions size="small" bordered column={1}>
              <Descriptions.Item label="Input signal">{humanValue(presentation.signals.input)}</Descriptions.Item>
              {presentation.signals.path.map((signal, index) => (
                <Descriptions.Item key={`${signal.edgeId}:${index}`} label={`${signal.from ?? 'Source'} → ${signal.to ?? 'Output'}`}>
                  <Space direction="vertical" size={0}>
                    <Text>{humanValue(signal.signal)}</Text>
                    {Object.keys(signal.changes).length ? <Text type="secondary">Changes: {humanValue(signal.changes)}</Text> : null}
                    {!signal.compatible ? <Tag color="error">Incompatible</Tag> : null}
                  </Space>
                </Descriptions.Item>
              ))}
            </Descriptions>
            {presentation.processors.length ? (
              <List
                size="small"
                header={<Text strong>Processors</Text>}
                dataSource={presentation.processors}
                renderItem={(processor) => (
                  <List.Item>
                    <List.Item.Meta title={processor.name} description={processor.detail ?? `Used for ${processor.role}`}/>
                  </List.Item>
                )}
              />
            ) : <Text type="secondary">No processor is active in this path.</Text>}
            {presentation.overrides.length ? (
              <Alert
                type="info"
                showIcon
                message={`${presentation.overrides.length} manual override(s) affect this route`}
                description={presentation.overrides.map((override, index) => (
                  <div key={override.id ?? index}>{override.reason ?? `${override.scopeType ?? 'Route'} override`}: {humanValue(override.value)}</div>
                ))}
              />
            ) : null}
          </Space>
        </Card>

        <Card size="small" title="Transition">
          <Descriptions size="small" bordered column={{xs: 1, md: 3}}>
            <Descriptions.Item label="Status"><Tag>{presentation.transition.status}</Tag></Descriptions.Item>
            <Descriptions.Item label="Duration">{transitionDuration}</Descriptions.Item>
            <Descriptions.Item label="Observed">{presentation.transition.observedAt ? new Date(presentation.transition.observedAt).toLocaleString() : 'Not reported'}</Descriptions.Item>
            {presentation.transition.message ? <Descriptions.Item label="What happened">{presentation.transition.message}</Descriptions.Item> : null}
          </Descriptions>
        </Card>

        {presentation.errors.map((error, index) => (
          <Alert
            key={`${error.code}:${error.path}:${index}`}
            type={error.severity === 'error' ? 'error' : 'warning'}
            showIcon
            message={error.message}
            description={<><Text>{error.nextStep}</Text><br/><Text type="secondary">Stage: {error.stage}</Text></>}
          />
        ))}

        <Collapse
          items={[{
            key: 'technical',
            label: 'Technical details',
            children: (
              <Space direction="vertical" style={{width: '100%'}}>
                <Descriptions bordered size="small" column={1}>
                  <Descriptions.Item label="Plan"><Text copyable>{plan.id}</Text></Descriptions.Item>
                  <Descriptions.Item label="Correlation"><Text copyable>{plan.correlationId}</Text></Descriptions.Item>
                  <Descriptions.Item label="Revision"><Text copyable>{plan.revisionId}</Text></Descriptions.Item>
                  <Descriptions.Item label="Runtime">{plan.runtimeVersion ?? 'Not available'} · world {plan.worldGeneration}:{plan.worldSequence}</Descriptions.Item>
                </Descriptions>
                <JSONEvidence value={{references: presentation.technicalReferences, explanation: plan.explanation, document: plan.document, applied: current.applied}}/>
              </Space>
            ),
          }]}
        />
      </Space>
    </section>
  )
}
