import {Create, useForm} from '@refinedev/antd'
import {Form, Input, Select, InputNumber, Badge, Space} from 'antd'
import {useState, useEffect} from 'react'

interface Device {
    id: number
    name: string
    active: boolean
}

export default function PipelineCreate() {
    const {formProps, saveButtonProps} = useForm({
        redirect: 'list',
    })

    const [devices, setDevices] = useState<Device[]>([])

    useEffect(() => {
        const fetchDevices = async () => {
            try {
                const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'
                const response = await fetch(`${apiUrl}/devices`)
                const data = await response.json()
                setDevices(data)
            } catch (error) {
                console.error('Failed to fetch devices:', error)
            }
        }
        fetchDevices()
    }, [])

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
                        {devices.map((device) => (
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
                        {devices.map((device) => (
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
            </Form>
        </Create>
    )
}
