import {Create, useForm} from '@refinedev/antd'
import {Form, Input, Select, InputNumber, Badge, Space} from 'antd'
import {HttpError, useList} from "@refinedev/core";

interface Device {
    id: number
    name: string
    active: boolean
    device_type: 'CAPTURE' | 'PLAYBACK'
}

interface Mixer {
    id: number
    name: string
    input_channels: number
    output_channels: number
}

export default function PipelineCreate() {
    const {formProps, saveButtonProps} = useForm({
        redirect: 'list',
    })

    const { result: devicesResult } = useList<Device, HttpError>({
        resource: "devices",
    })

    const devices = devicesResult.data || []
    const inputDevices = devices.filter((device) => device.device_type === 'CAPTURE')
    const outputDevices = devices.filter((device) => device.device_type === 'PLAYBACK')

    const { result: mixersResult} = useList<Mixer, HttpError>({
        resource: "camilladsp/mixers",
    })

    const mixers = mixersResult.data || []

    return (
        <Create saveButtonProps={saveButtonProps}>
            <Form {...formProps} layout="vertical">
                <Form.Item
                    label="Name"
                    name="name"
                    rules={[{required: true, message: 'Please enter pipeline name'}]}
                >
                    <Input placeholder="e.g., Living Room Audio"/>
                </Form.Item>

                <Form.Item
                    label="Description"
                    name="description"
                    rules={[{required: true, message: 'Please enter description'}]}
                >
                    <Input.TextArea
                        placeholder="e.g., PulseAudio input to DAC output"
                        rows={3}
                    />
                </Form.Item>

                <Form.Item
                    label="Input Device"
                    name="input_device_id"
                    rules={[{required: true, message: 'Please select input device'}]}
                >
                    <Select placeholder="Select input device">
                        {inputDevices.map((device) => (
                            <Select.Option key={device.id} value={device.id}>
                                <Space>
                                    <Badge status={device.active ? 'success' : 'error'}/>
                                    {device.name}
                                </Space>
                            </Select.Option>
                        ))}
                    </Select>
                </Form.Item>

                <Form.Item
                    label="Output Device"
                    name="output_device_id"
                    rules={[{required: true, message: 'Please select output device'}]}
                >
                    <Select placeholder="Select output device">
                        {outputDevices.map((device) => (
                            <Select.Option key={device.id} value={device.id}>
                                <Space>
                                    <Badge status={device.active ? 'success' : 'error'}/>
                                    {device.name}
                                </Space>
                            </Select.Option>
                        ))}
                    </Select>
                </Form.Item>

                <Form.Item
                    label="Mixer (Optional)"
                    name="mixer_id"
                >
                    <Select placeholder="No mixer" allowClear>
                        {mixers.map((mixer) => (
                            <Select.Option key={mixer.id} value={mixer.id}>
                                {mixer.name} ({mixer.input_channels}→{mixer.output_channels} ch)
                            </Select.Option>
                        ))}
                    </Select>
                </Form.Item>

                <Form.Item
                    label="Sample Rate (Hz)"
                    name="samplerate"
                    rules={[{required: true, message: 'Please enter sample rate'}]}
                    initialValue={48000}
                >
                    <Select placeholder="Select sample rate">
                        <Select.Option value={44100}>44100 Hz (CD Quality)</Select.Option>
                        <Select.Option value={48000}>48000 Hz (Standard)</Select.Option>
                        <Select.Option value={96000}>96000 Hz (High-Res)</Select.Option>
                        <Select.Option value={192000}>192000 Hz (Ultra High-Res)</Select.Option>
                    </Select>
                </Form.Item>

                <Form.Item
                    label="Chunk Size"
                    name="chunksize"
                    rules={[{required: true, message: 'Please enter chunk size'}]}
                    initialValue={1024}
                >
                    <InputNumber min={64} max={8192} step={64} style={{width: '100%'}}/>
                </Form.Item>
            </Form>
        </Create>
    )
}
