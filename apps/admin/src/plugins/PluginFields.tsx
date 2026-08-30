import type {JsonObject, JsonValue, PluginFieldDto} from '@open-cinema/shared'
import {DeleteOutlined, PlusOutlined} from '@ant-design/icons'
import {Button, Card, Form, Input, InputNumber, Select, Space, Switch, Typography} from 'antd'

function segments(pointer: string): string[] {
  return pointer
    .split('/')
    .slice(1)
    .map((item) => item.split('~1').join('/').split('~0').join('~'))
}

export function pointerValue(document: JsonObject, pointer: string): JsonValue | undefined {
  let current: JsonValue | undefined = document
  for (const segment of segments(pointer)) {
    if (current === null || typeof current !== 'object') return undefined
    current = Array.isArray(current)
      ? current[Number(segment)]
      : current[segment]
  }
  return current
}

export function withPointer(document: JsonObject, pointer: string, value: JsonValue): JsonObject {
  const clone = JSON.parse(JSON.stringify(document)) as JsonObject
  const parts = segments(pointer)
  let current: JsonObject | JsonValue[] = clone
  parts.forEach((segment, index) => {
    if (index === parts.length - 1) {
      if (Array.isArray(current)) current[Number(segment)] = value
      else current[segment] = value
      return
    }
    const next = Array.isArray(current) ? current[Number(segment)] : current[segment]
    if (next === null || typeof next !== 'object') {
      const created: JsonObject = {}
      if (Array.isArray(current)) current[Number(segment)] = created
      else current[segment] = created
      current = created
    } else {
      current = next
    }
  })
  return clone
}

export function fieldVisible(field: PluginFieldDto, document: JsonObject): boolean {
  const condition = field.visibleWhen
  if (!condition) return true
  const path = typeof condition.path === 'string' ? condition.path : null
  if (!path) return false
  const value = pointerValue(document, path)
  if ('equals' in condition) return value === condition.equals
  if ('notEquals' in condition) return value !== condition.notEquals
  if (Array.isArray(condition.in)) return condition.in.includes(value ?? null)
  if (typeof condition.present === 'boolean') return condition.present === (value !== undefined && value !== null)
  return false
}

function numericConstraint(field: PluginFieldDto, key: string): number | undefined {
  const value = field.constraints?.[key]
  return typeof value === 'number' ? value : undefined
}

function textConstraint(field: PluginFieldDto, key: string): string | undefined {
  const value = field.constraints?.[key]
  return typeof value === 'string' ? value : undefined
}

function defaultItem(field: PluginFieldDto): JsonValue {
  if (field.widget === 'number' || field.widget === 'duration') return 0
  if (field.widget === 'boolean') return false
  if (field.widget === 'multiselect' || field.widget === 'repeatable') return []
  if (field.widget === 'group') return {}
  return ''
}

export function PluginField({
  field,
  document,
  onChange,
}: {
  field: PluginFieldDto
  document: JsonObject
  onChange: (document: JsonObject) => void
}) {
  if (!fieldVisible(field, document)) return null
  const value = pointerValue(document, field.path)
  const update = (next: JsonValue) => onChange(withPointer(document, field.path, next))
  const common = {
    disabled: field.readOnly,
    'aria-label': field.label,
  }
  let control

  switch (field.widget) {
    case 'boolean':
      control = <Switch {...common} checked={value === true} onChange={update}/>
      break
    case 'number':
    case 'duration': {
      const numericInput = (
        <InputNumber
          {...common}
          value={typeof value === 'number' ? value : null}
          min={numericConstraint(field, 'minimum') ?? numericConstraint(field, 'min')}
          max={numericConstraint(field, 'maximum') ?? numericConstraint(field, 'max')}
          step={numericConstraint(field, 'step')}
          onChange={(next) => update(next ?? 0)}
          style={{width: '100%'}}
        />
      )
      control = field.widget === 'duration'
        ? <Space.Compact block>{numericInput}<Button disabled>ms</Button></Space.Compact>
        : numericInput
      break
    }
    case 'enum':
      control = (
        <Select
          {...common}
          value={value as string | number | boolean | undefined}
          placeholder={field.placeholder}
          options={field.choices?.map((choice) => ({
            value: choice.value as string | number,
            label: choice.label,
            title: choice.help,
          }))}
          onChange={update}
          style={{width: '100%'}}
        />
      )
      break
    case 'multiselect':
      control = (
        <Select
          {...common}
          mode="multiple"
          value={Array.isArray(value) ? value as Array<string | number> : []}
          placeholder={field.placeholder}
          options={field.choices?.map((choice) => ({
            value: choice.value as string | number,
            label: choice.label,
          }))}
          onChange={(next) => update(next)}
          maxTagCount="responsive"
          style={{width: '100%'}}
        />
      )
      break
    case 'secret': {
      const configured = value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value.configured === true
        : false
      control = (
        <Space direction="vertical" size="small" style={{width: '100%'}}>
          <Input.Password
            {...common}
            value={typeof value === 'string' ? value : ''}
            placeholder={configured ? 'Configured — enter a value to replace it' : field.placeholder}
            autoComplete="new-password"
            onChange={(event) => update(event.target.value)}
          />
          {configured ? <Typography.Text type="success">A secret is configured.</Typography.Text> : null}
        </Space>
      )
      break
    }
    case 'repeatable': {
      const items = Array.isArray(value) ? value : []
      control = (
        <Space direction="vertical" size="small" style={{width: '100%'}}>
          {items.map((item, index) => (
            <Card
              key={index}
              size="small"
              extra={(
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined/>}
                  aria-label={`Remove ${field.label} ${index + 1}`}
                  onClick={() => update(items.filter((_, itemIndex) => itemIndex !== index))}
                />
              )}
            >
              {field.item ? (
                <PluginField
                  field={{...field.item, path: '/value', label: `${field.label} ${index + 1}`}}
                  document={{value: item}}
                  onChange={(next) => update(items.map((current, itemIndex) => itemIndex === index ? next.value : current))}
                />
              ) : null}
            </Card>
          ))}
          <Button
            icon={<PlusOutlined/>}
            disabled={field.readOnly}
            aria-label={`Add ${field.label.toLowerCase()}`}
            onClick={() => update([...items, defaultItem(field.item ?? field)])}
          >
            Add {field.label.toLowerCase()}
          </Button>
        </Space>
      )
      break
    }
    case 'group': {
      const group = value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as JsonObject
        : {}
      control = (
        <Card size="small">
          {field.fields?.map((child) => (
            <PluginField
              key={child.id}
              field={child}
              document={group}
              onChange={(next) => update(next)}
            />
          ))}
        </Card>
      )
      break
    }
    case 'url':
    case 'path':
    case 'text':
      control = (
        <Input
          {...common}
          type={field.widget === 'url' ? 'url' : 'text'}
          value={typeof value === 'string' ? value : ''}
          placeholder={field.placeholder}
          minLength={numericConstraint(field, 'minLength')}
          maxLength={numericConstraint(field, 'maxLength')}
          pattern={textConstraint(field, 'pattern')}
          onChange={(event) => update(event.target.value)}
        />
      )
      break
  }

  return (
    <Form.Item
      label={field.label}
      required={field.required}
      help={field.help}
      style={{marginBottom: 20}}
    >
      {control}
    </Form.Item>
  )
}
