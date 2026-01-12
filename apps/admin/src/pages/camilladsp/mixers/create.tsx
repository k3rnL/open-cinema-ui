import { Create, useForm } from '@refinedev/antd'
import { Form, Input, InputNumber, Button, Card, Space, Checkbox, Select } from 'antd'
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons'

export default function MixerCreate() {
  const { formProps, saveButtonProps } = useForm({
    redirect: 'list',
  })

  return (
    <Create saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Form.Item
          label="Name"
          name="name"
          rules={[{ required: true, message: 'Please enter mixer name' }]}
        >
          <Input placeholder="e.g., auto_2ch_to_6ch" />
        </Form.Item>

        <Form.Item
          label="Description"
          name="description"
          rules={[{ required: true, message: 'Please enter description' }]}
        >
          <Input.TextArea
            placeholder="e.g., Auto-generated mixer: 2 to 6 channels"
            rows={2}
          />
        </Form.Item>

        <Space size="large">
          <Form.Item
            label="Input Channels"
            name="input_channels"
            rules={[{ required: true, message: 'Required' }]}
            initialValue={2}
          >
            <InputNumber min={1} max={32} />
          </Form.Item>

          <Form.Item
            label="Output Channels"
            name="output_channels"
            rules={[{ required: true, message: 'Required' }]}
            initialValue={6}
          >
            <InputNumber min={1} max={32} />
          </Form.Item>
        </Space>

        <Form.Item
          label="Quick Setup"
          tooltip="Choose a preset or configure manually below"
        >
          <Select
            placeholder="Select a preset (optional)"
            allowClear
            onChange={(value) => {
              if (value === '2to6_surround') {
                formProps.form?.setFieldsValue({
                  input_channels: 2,
                  output_channels: 6,
                  mapping: [
                    { dest: 0, sources: [{ channel: 0, gain: 0, inverted: false }] },
                    { dest: 1, sources: [{ channel: 1, gain: 0, inverted: false }] },
                    { dest: 2, sources: [{ channel: 0, gain: -6, inverted: false }, { channel: 1, gain: -6, inverted: false }] },
                    { dest: 3, sources: [{ channel: 0, gain: -12, inverted: false }, { channel: 1, gain: -12, inverted: false }] },
                    { dest: 4, sources: [{ channel: 0, gain: -3, inverted: false }] },
                    { dest: 5, sources: [{ channel: 1, gain: -3, inverted: false }] },
                  ]
                })
              } else if (value === 'passthrough') {
                const channels = formProps.form?.getFieldValue('input_channels') || 2
                const mapping = Array.from({ length: channels }, (_, i) => ({
                  dest: i,
                  sources: [{ channel: i, gain: 0, inverted: false }]
                }))
                formProps.form?.setFieldsValue({ mapping })
              }
            }}
          >
            <Select.Option value="2to6_surround">2.0 to 5.1 Surround</Select.Option>
            <Select.Option value="passthrough">Passthrough (1:1)</Select.Option>
          </Select>
        </Form.Item>

        <Card title="Channel Mappings" size="small">
          <Form.List name="mapping">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <Card key={key} size="small" style={{ marginBottom: 16 }}>
                    <Space align="start" style={{ display: 'flex' }}>
                      <Form.Item
                        {...restField}
                        label="Dest Channel"
                        name={[name, 'dest']}
                        rules={[{ required: true, message: 'Required' }]}
                      >
                        <InputNumber min={0} placeholder="0" />
                      </Form.Item>

                      <div style={{ flex: 1 }}>
                        <Form.List name={[name, 'sources']}>
                          {(sourceFields, { add: addSource, remove: removeSource }) => (
                            <>
                              {sourceFields.map(({ key: srcKey, name: srcName, ...srcRestField }) => (
                                <Space key={srcKey} align="baseline">
                                  <Form.Item
                                    {...srcRestField}
                                    label="Ch"
                                    name={[srcName, 'channel']}
                                    rules={[{ required: true }]}
                                  >
                                    <InputNumber min={0} placeholder="0" style={{ width: 60 }} />
                                  </Form.Item>

                                  <Form.Item
                                    {...srcRestField}
                                    label="Gain (dB)"
                                    name={[srcName, 'gain']}
                                    rules={[{ required: true }]}
                                    initialValue={0}
                                  >
                                    <InputNumber step={0.5} placeholder="0" style={{ width: 80 }} />
                                  </Form.Item>

                                  <Form.Item
                                    {...srcRestField}
                                    name={[srcName, 'inverted']}
                                    valuePropName="checked"
                                    initialValue={false}
                                  >
                                    <Checkbox>Inverted</Checkbox>
                                  </Form.Item>

                                  <MinusCircleOutlined onClick={() => removeSource(srcName)} />
                                </Space>
                              ))}
                              <Button
                                type="dashed"
                                onClick={() => addSource({ channel: 0, gain: 0, inverted: false })}
                                icon={<PlusOutlined />}
                                size="small"
                              >
                                Add Source
                              </Button>
                            </>
                          )}
                        </Form.List>
                      </div>

                      <MinusCircleOutlined onClick={() => remove(name)} style={{ marginTop: 30 }} />
                    </Space>
                  </Card>
                ))}
                <Button
                  type="dashed"
                  onClick={() => add({ dest: fields.length, sources: [{ channel: 0, gain: 0, inverted: false }] })}
                  block
                  icon={<PlusOutlined />}
                >
                  Add Mapping
                </Button>
              </>
            )}
          </Form.List>
        </Card>
      </Form>
    </Create>
  )
}
