import { Create, useForm } from '@refinedev/antd'
import { Form, Input, Select } from 'antd'
import type { AudioDevice } from '@open-cinema/shared'

export default function DeviceCreate() {
  const { formProps, saveButtonProps } = useForm<AudioDevice>({
    redirect: 'list',
  })

  return (
    <Create saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Form.Item
          label="Name"
          name="name"
          rules={[{ required: true, message: 'Please enter device name' }]}
        >
          <Input placeholder="e.g., Living Room Amplifier" />
        </Form.Item>

        <Form.Item
          label="Type"
          name="type"
          rules={[{ required: true, message: 'Please select device type' }]}
        >
          <Select placeholder="Select device type">
            <Select.Option value="amplifier">Amplifier</Select.Option>
            <Select.Option value="source">Source</Select.Option>
            <Select.Option value="display">Display</Select.Option>
            <Select.Option value="processor">Processor</Select.Option>
          </Select>
        </Form.Item>
      </Form>
    </Create>
  )
}
