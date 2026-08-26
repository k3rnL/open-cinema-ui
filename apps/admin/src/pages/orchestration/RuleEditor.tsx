import { useMemo } from 'react'
import { Alert, Button, Card, Input, InputNumber, Select, Space, Typography } from 'antd'
import {
  compileSelectorRules,
  readableRule,
  type DesiredGraphDocumentDto,
  type LogicalEndpointDto,
  type SelectorRuleDraft,
} from '@open-cinema/shared'
import {createClientId} from './clientId'

const { Text, Title } = Typography

interface RuleEditorProps {
  graphId: string
  graphName: string
  endpoints: LogicalEndpointDto[]
  inputEndpointId: string
  rules: SelectorRuleDraft[]
  scene: string
  supported: boolean
  editable: boolean
  onInputChange: (endpointId: string) => void
  onRulesChange: (rules: SelectorRuleDraft[], document: DesiredGraphDocumentDto) => void
  onSceneChange: (scene: string) => void
}

export function RuleEditor({
  graphId,
  graphName,
  endpoints,
  inputEndpointId,
  rules,
  scene,
  supported,
  editable,
  onInputChange,
  onRulesChange,
  onSceneChange,
}: RuleEditorProps) {
  const inputs = endpoints.filter((item) => item.direction === 'input')
  const outputs = endpoints.filter((item) => item.direction === 'output')
  const endpointNames = Object.fromEntries(endpoints.map((item) => [item.id, item.name]))

  const update = (next: SelectorRuleDraft[]) => {
    onRulesChange(next, compileSelectorRules(graphId, graphName, inputEndpointId, next, scene))
  }

  const add = () => {
    const preferred = outputs[0]?.id ?? ''
    const fallback = outputs[1]?.id
    update([
      ...rules,
      {
        id: createClientId(),
        name: 'New routing rule',
        fact: preferred ? `endpoint.${preferred}.availability` : 'runtime.available',
        operator: 'equals',
        value: 'available',
        thenEndpointId: preferred,
        otherwiseEndpointId: fallback,
        priority: 100 - rules.length,
      },
    ])
  }

  const preview = useMemo(
    () => rules.map((rule) => readableRule(rule, endpointNames)),
    [rules, endpointNames],
  )

  return (
    <section aria-labelledby="rule-editor-title">
      <Title level={4} id="rule-editor-title">
        Simple routing rules
      </Title>
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {!supported && (
          <Alert
            type="info"
            showIcon
            message="This advanced graph cannot be expressed safely as simple rules"
            description="The advanced graph remains authoritative. Start a new graph or remove unsupported advanced processing before creating a rule-oriented graph; no parallel rule configuration is stored."
          />
        )}
        <Card size="small">
          <Space wrap>
            <Text strong>Main input</Text>
            <Select
              aria-label="Main programme input"
              value={inputEndpointId || undefined}
              style={{ minWidth: 240 }}
              options={inputs.map((item) => ({ value: item.id, label: item.name }))}
              disabled={!editable || !supported}
              onChange={onInputChange}
            />
            <Text strong>Scene</Text>
            <Input
              aria-label="Scene name"
              value={scene}
              placeholder="cinema"
              style={{ width: 180 }}
              disabled={!editable || !supported}
              onChange={(event) => onSceneChange(event.target.value)}
            />
          </Space>
        </Card>

        {supported && rules.map((rule, index) => (
          <Card
            key={rule.id}
            size="small"
            title={`Rule ${index + 1}: ${rule.name}`}
            extra={
              <Button danger type="text" disabled={!editable} onClick={() => update(rules.filter((item) => item.id !== rule.id))}>
                Remove
              </Button>
            }
          >
            <Space wrap align="center">
              <Text strong>WHEN</Text>
              <Input
                aria-label={`Rule ${index + 1} fact`}
                value={rule.fact}
                disabled={!editable}
                style={{ width: 300 }}
                onChange={(event) =>
                  update(
                    rules.map((item) =>
                      item.id === rule.id ? { ...item, fact: event.target.value } : item,
                    ),
                  )
                }
              />
              <Select
                aria-label={`Rule ${index + 1} operator`}
                value={rule.operator}
                disabled={!editable}
                options={[
                  { value: 'equals', label: 'equals' },
                  { value: 'notEquals', label: 'does not equal' },
                  { value: 'exists', label: 'is known' },
                ]}
                onChange={(operator) =>
                  update(
                    rules.map((item) => (item.id === rule.id ? { ...item, operator } : item)),
                  )
                }
              />
              {rule.operator !== 'exists' && (
                <Input
                  aria-label={`Rule ${index + 1} value`}
                  value={String(rule.value ?? '')}
                  disabled={!editable}
                  style={{ width: 140 }}
                  onChange={(event) =>
                    update(
                      rules.map((item) =>
                        item.id === rule.id ? { ...item, value: event.target.value } : item,
                      ),
                    )
                  }
                />
              )}
              <Text strong>THEN</Text>
              <Select
                aria-label={`Rule ${index + 1} preferred output`}
                value={rule.thenEndpointId || undefined}
                disabled={!editable}
                style={{ minWidth: 200 }}
                options={outputs.map((item) => ({ value: item.id, label: item.name }))}
                onChange={(thenEndpointId) =>
                  update(
                    rules.map((item) =>
                      item.id === rule.id ? { ...item, thenEndpointId } : item,
                    ),
                  )
                }
              />
              <Text strong>OTHERWISE</Text>
              <Select
                aria-label={`Rule ${index + 1} fallback output`}
                allowClear
                value={rule.otherwiseEndpointId}
                disabled={!editable}
                style={{ minWidth: 200 }}
                options={outputs.map((item) => ({ value: item.id, label: item.name }))}
                onChange={(otherwiseEndpointId) =>
                  update(
                    rules.map((item) =>
                      item.id === rule.id ? { ...item, otherwiseEndpointId } : item,
                    ),
                  )
                }
              />
              <Text>Priority</Text>
              <InputNumber
                aria-label={`Rule ${index + 1} priority`}
                value={rule.priority}
                disabled={!editable}
                onChange={(priority) =>
                  update(
                    rules.map((item) =>
                      item.id === rule.id ? { ...item, priority: Number(priority ?? 0) } : item,
                    ),
                  )
                }
              />
            </Space>
          </Card>
        ))}
        <Button disabled={!editable || !supported} onClick={add}>Add WHEN / THEN / OTHERWISE rule</Button>
        <Card size="small" title="Plain-language preview">
          {preview.length ? (
            preview.map((item) => <div key={item}>{item}</div>)
          ) : (
            <Text type="secondary">Add a rule to describe automatic routing.</Text>
          )}
        </Card>
      </Space>
    </section>
  )
}
