import {Edit, useForm} from "@refinedev/antd";
import 'reactflow/dist/style.css';
import './reactflow-custom.css';
import {HttpError, useList} from "@refinedev/core";
import {Badge, Button, Dropdown, Form, Space, Spin} from "antd";
import ReactFlow, {Background, BackgroundVariant, Controls, MiniMap, ReactFlowProvider, Node, Edge, useNodesState, useEdgesState, addEdge, Connection} from "reactflow";
import {useCallback, useContext, useEffect, useMemo} from "react";
import useLayoutNodes from "../../hooks/useLayoutNodes";
import {PartitionOutlined} from "@ant-design/icons";
import AudioInputNode from "../../components/nodes/AudioInputNode";
import AudioOutputNode from "../../components/nodes/AudioOutputNode";
import {ColorModeContext} from "@/contexts/color-mode";
import {AudioDevice} from "@open-cinema/shared";

interface PipelineNode {
    id: number
    kind: string
    plugin: string
    parameters: any
}

interface PipelineEdge {
    id: number
    node_a: number
    node_b: number
}

interface Pipeline {
    name: string
    nodes: PipelineNode[]
    edges: PipelineEdge[]
}

function PipelineFlowEditor({ pipeline, devices, onGraphChange }: {
    pipeline: Pipeline,
    devices: AudioDevice[],
    onGraphChange: (nodes: Node[], edges: Edge[]) => void
}) {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const { applyAutoLayout } = useLayoutNodes();
    const { mode } = useContext(ColorModeContext);

    const isDark = mode === 'dark';

    // Load pipeline data when component mounts or pipeline changes
    useEffect(() => {
        if (!pipeline.nodes || pipeline.nodes.length === 0) return

        const loadedNodes = pipeline.nodes.map((node, index) => {
            const device = devices.find(d => d.id === node.parameters?.deviceId)

            return {
                id: `node-${node.id}`,
                type: node.kind === 'input' ? 'audioInput' : 'audioOutput',
                position: { x: index * 300, y: index * 150 },
                data: device || {
                    id: node.parameters?.deviceId || '',
                    name: node.plugin,
                    active: false,
                    device_type: node.kind === 'input' ? 'CAPTURE' : 'PLAYBACK'
                } as AudioDevice
            }
        })

        const loadedEdges = pipeline.edges?.map(edge => {
            return {
                id: `edge-${edge.id}`,
                source: `node-${edge.node_a}`,
                target: `node-${edge.node_b}`,
            }
        }) || []

        setNodes(loadedNodes)
        setEdges(loadedEdges)
    }, [pipeline, devices, setNodes, setEdges])

    const nodeTypes = useMemo(() => ({
        audioInput: AudioInputNode,
        audioOutput: AudioOutputNode,
    }), []);

    const onConnect = useCallback(
        (params: Connection) => setEdges((eds) => addEdge(params, eds)),
        [setEdges]
    );

    // Notify parent of changes
    const handleNodesChange = useCallback((changes: any) => {
        onNodesChange(changes);
        setTimeout(() => onGraphChange(nodes, edges), 0);
    }, [onNodesChange, nodes, edges, onGraphChange]);

    const handleEdgesChange = useCallback((changes: any) => {
        onEdgesChange(changes);
        setTimeout(() => onGraphChange(nodes, edges), 0);
    }, [onEdgesChange, nodes, edges, onGraphChange]);

    const handleConnect = useCallback((params: Connection) => {
        const newEdges = addEdge(params, edges);
        setEdges(newEdges);
        onGraphChange(nodes, newEdges);
    }, [edges, nodes, setEdges, onGraphChange]);

    // Add node functions
    const addInputNode = useCallback((device: AudioDevice) => {
        const newNode: Node = {
            id: `input-${device.id}-${Date.now()}`,
            type: 'audioInput',
            position: { x: Math.random() * 400, y: Math.random() * 300 },
            data: device
        };
        const newNodes = [...nodes, newNode];
        setNodes(newNodes);
        onGraphChange(newNodes, edges);
    }, [nodes, edges, setNodes, onGraphChange]);

    const addOutputNode = useCallback((device: AudioDevice) => {
        const newNode: Node = {
            id: `output-${device.id}-${Date.now()}`,
            type: 'audioOutput',
            position: { x: Math.random() * 400, y: Math.random() * 300 },
            data: device
        };
        const newNodes = [...nodes, newNode];
        setNodes(newNodes);
        onGraphChange(newNodes, edges);
    }, [nodes, edges, setNodes, onGraphChange]);

    const inputDevices = devices.filter((device) => device.device_type === 'CAPTURE')
    const outputDevices = devices.filter((device) => device.device_type === 'PLAYBACK')

    const inputDevicesDropdown = inputDevices.map((device) => ({
        key: device.id,
        label: (
            <Space>
                <Badge status={device.active ? 'success' : 'error'}/>
                {device.name}
            </Space>
        ),
        onClick: () => addInputNode(device),
    }))

    const outputDevicesDropdown = outputDevices.map((device) => ({
        key: device.id,
        label: (
            <Space>
                <Badge status={device.active ? 'success' : 'error'}/>
                {device.name}
            </Space>
        ),
        onClick: () => addOutputNode(device),
    }))

    return (
        <>
            <Space style={{ marginBottom: 16 }}>
                <Dropdown menu={{items: inputDevicesDropdown}}>
                    <Button>Add audio source</Button>
                </Dropdown>
                <Dropdown menu={{items: outputDevicesDropdown}}>
                    <Button>Add audio output</Button>
                </Dropdown>
                <Button icon={<PartitionOutlined />} onClick={applyAutoLayout}>
                    Auto Layout
                </Button>
            </Space>
            <div style={{width: '100%', height: 'calc(100vh - 300px)'}}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    onNodesChange={handleNodesChange}
                    onEdgesChange={handleEdgesChange}
                    onConnect={handleConnect}
                    fitView
                    style={{ background: isDark ? '#141414' : '#fff' }}
                >
                    <Controls
                        style={{
                            backgroundColor: isDark ? '#1f1f1f' : '#fff',
                            border: isDark ? '1px solid #434343' : '1px solid #d9d9d9',
                        }}
                    />
                    <MiniMap
                        style={{
                            background: isDark ? '#1f1f1f' : '#fff',
                            border: isDark ? '1px solid #434343' : '1px solid #d9d9d9',
                        }}
                        maskColor={isDark ? "rgba(0, 0, 0, 0.6)" : "rgba(255, 255, 255, 0.6)"}
                    />
                    <Background
                        variant={BackgroundVariant.Dots}
                        gap={12}
                        size={1}
                        color={isDark ? "#434343" : "#d9d9d9"}
                    />
                </ReactFlow>
            </div>
        </>
    )
}

export default function PipelineEdit() {
    const {formProps, saveButtonProps, query, form} = useForm<Pipeline>({
        redirect: 'list',
    })

    const {result: devicesResult} = useList<AudioDevice, HttpError>({
        resource: "devices",
    })

    // Transform ReactFlow graph to backend format
    const handleGraphChange = useCallback((nodes: Node[], edges: Edge[]) => {
        const transformedNodes = nodes.map((node) => ({
            kind: node.type === 'audioInput' ? 'input' : 'output',
            plugin: node.data.name || node.data.label,
            parameters: {
                deviceId: node.data.id,
            },
        }))

        const transformedEdges = edges.map((edge) => {
            const sourceIndex = nodes.findIndex((n) => n.id === edge.source)
            const targetIndex = nodes.findIndex((n) => n.id === edge.target)
            return {
                node_a: sourceIndex,
                node_b: targetIndex,
            }
        })

        // Update form values
        form?.setFieldsValue({
            nodes: transformedNodes,
            edges: transformedEdges,
        })
    }, [form])

    const isLoading = query?.isLoading
    const isError = query?.isError

    if (isLoading) {
        return <Spin/>
    }

    if (isError) {
        return <div>Failed to load pipeline</div>
    }

    const devices = devicesResult.data || []
    const pipeline = query?.data?.data!

    return (
        <Edit saveButtonProps={saveButtonProps} canDelete>
            <Form {...formProps} layout="vertical">
                <Form.Item name="nodes" hidden>
                    <input />
                </Form.Item>
                <Form.Item name="edges" hidden>
                    <input />
                </Form.Item>
                <ReactFlowProvider>
                    <PipelineFlowEditor
                        pipeline={pipeline}
                        devices={devices}
                        onGraphChange={handleGraphChange}
                    />
                </ReactFlowProvider>
            </Form>
        </Edit>
    )
}