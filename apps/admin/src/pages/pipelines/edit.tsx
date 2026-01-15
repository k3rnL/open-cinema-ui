import {Edit, useForm} from "@refinedev/antd";
import 'reactflow/dist/style.css';
import './reactflow-custom.css';
import {HttpError, useApiUrl, useCustom, useList} from "@refinedev/core";
import {Badge, Button, Dropdown, Form, Space, Spin} from "antd";
import ReactFlow, {
    Background,
    BackgroundVariant,
    Controls,
    MiniMap,
    ReactFlowProvider,
    Node,
    Edge,
    useNodesState,
    useEdgesState,
    addEdge,
    Connection
} from "reactflow";
import {useCallback, useContext, useEffect, useMemo} from "react";
import useLayoutNodes from "../../hooks/useLayoutNodes";
import {PartitionOutlined} from "@ant-design/icons";
import AudioInputNode from "../../components/nodes/AudioInputNode";
import AudioOutputNode from "../../components/nodes/AudioOutputNode";
import {ColorModeContext} from "@/contexts/color-mode";
import {AudioDevice} from "@open-cinema/shared";
import GenericNode from "@/components/nodes/GenericNode.tsx";

export interface PipelineSchematicsField {
    name: string,
    type: string,
    help_text: string,
    choices: { label: string, value: string }[],
    nullable: boolean,
}

export interface PipelineSchematic {
    name: string,
    fields: PipelineSchematicsField[],
    fieldValues?: Record<string, any>,
    onFieldValuesChange?: (nodeId: string, values: Record<string, any>) => void
}

interface PipelineSchematics {
    io: PipelineSchematic[]
}

interface PipelineNode {
    id: number
    name: string
    fields: Record<string, any>
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

function pipelineNodeToReactFlowNode(node: PipelineNode, index: number, devices: AudioDevice[], schematics: PipelineSchematics, handleFieldValuesChange: (nodeId: string, fieldValues: Record<string, any>) => void): Node {
    if (node.name === 'AudioPipelineDeviceNode') {
        const device = devices.find(d => d.id === node.fields['device'])!

        return {
            id: `node-${node.id}`,
            type: device?.device_type === 'CAPTURE' ? 'audioInput' : 'audioOutput',
            position: {x: index * 300, y: index * 150},
            data: device
        }
    }

    console.warn(node)

    const schematic = schematics.io.find(s => s.name === node.name);

    if (!schematic)
        console.warn(`Schematic for ${node.name} not found`)

    return {
        id: `ionode-${node.name}-${Date.now()}`,
        type: 'generic',
        position: {x: Math.random() * 400, y: Math.random() * 300},
        data: {
            ...schematic,
            fieldValues: node.fields,
            onFieldValuesChange: handleFieldValuesChange
        }
    }
}

function PipelineFlowEditor({pipeline, devices, onGraphChange, schematics}: {
    pipeline: Pipeline,
    devices: AudioDevice[],
    onGraphChange: (nodes: Node[], edges: Edge[]) => void,
    schematics: PipelineSchematics
}) {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const {applyAutoLayout} = useLayoutNodes();
    const {mode} = useContext(ColorModeContext);

    const isDark = mode === 'dark';

    // Load pipeline data when component mounts or pipeline changes
    useEffect(() => {
        if (!pipeline.nodes || pipeline.nodes.length === 0) return

        const loadedNodes = pipeline.nodes.map((node, index) => {
            return pipelineNodeToReactFlowNode(node, index, devices, schematics, handleFieldValuesChange)
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

    // Delete node function
    const deleteNode = useCallback((nodeId: string) => {
        setNodes((nds) => nds.filter((n) => n.id !== nodeId));
        setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    }, [setNodes, setEdges]);

    const nodeTypes = useMemo(() => ({
        audioInput: (props: any) => <AudioInputNode {...props} data={props.data}
                                                    onDelete={() => deleteNode(props.id)}/>,
        audioOutput: (props: any) => <AudioOutputNode {...props} data={props.data}
                                                      onDelete={() => deleteNode(props.id)}/>,
        generic: (props: any) => <GenericNode {...props} data={props.data} onDelete={() => deleteNode(props.id)}/>,
    }), [deleteNode]);

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
            position: {x: Math.random() * 400, y: Math.random() * 300},
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
            position: {x: Math.random() * 400, y: Math.random() * 300},
            data: device
        };
        const newNodes = [...nodes, newNode];
        setNodes(newNodes);
        onGraphChange(newNodes, edges);
    }, [nodes, edges, setNodes, onGraphChange]);

    // Handle field values change from GenericNode
    const handleFieldValuesChange = useCallback((nodeId: string, fieldValues: Record<string, any>) => {
        setNodes((nds) => {
            const updatedNodes = nds.map((node) =>
                node.id === nodeId
                    ? { ...node, data: { ...node.data, fieldValues } }
                    : node
            );
            // Trigger graph change to update form with the updated nodes
            setTimeout(() => onGraphChange(updatedNodes, edges), 0);
            return updatedNodes;
        });
    }, [edges, onGraphChange]);

    const addIONode = useCallback((name: string) => {
        const schematic = schematics.io.find(s => s.name === name)!;
        const newNode: Node = {
            id: `ionode-${name}-${Date.now()}`,
            type: 'generic',
            position: {x: Math.random() * 400, y: Math.random() * 300},
            data: {
                ...schematic,
                fieldValues: {},
                onFieldValuesChange: handleFieldValuesChange
            }
        }

        const newNodes = [...nodes, newNode];
        setNodes(newNodes);
        onGraphChange(newNodes, edges);
    }, [nodes, edges, setNodes, onGraphChange, handleFieldValuesChange, schematics.io]);

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

    const schematicsDropdown = schematics.io.map(({name}) => ({
        key: name,
        label: (
            <Space>{name}</Space>
        ),
        onClick: () => addIONode(name),
    }))

    return (
        <>
            <Space style={{marginBottom: 16}}>
                <Dropdown menu={{items: inputDevicesDropdown}}>
                    <Button>Add audio source</Button>
                </Dropdown>
                <Dropdown menu={{items: outputDevicesDropdown}}>
                    <Button>Add audio output</Button>
                </Dropdown>
                <Dropdown menu={{items: schematicsDropdown}}>
                    <Button>Add Others</Button>
                </Dropdown>
                <Button icon={<PartitionOutlined/>} onClick={applyAutoLayout}>
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
                    style={{background: isDark ? '#141414' : '#fff'}}
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
    const {formProps, saveButtonProps, query: pipelineQuery, form} = useForm<Pipeline>({
        redirect: false,
    })

    const {result: devicesResult} = useList<AudioDevice, HttpError>({
        resource: "devices",
    })

    const apiUrl = useApiUrl()

    const {query: schematicsQuery} = useCustom<PipelineSchematics>({
        url: `${apiUrl}/pipelines/schematics`,
        method: 'get'
    })

    // Transform ReactFlow graph to backend format
    const handleGraphChange = useCallback((nodes: Node[], edges: Edge[]) => {
        const transformedNodes = nodes.map((node) => {
            const common = {
                name: node.data.name
            }
            if (node.type === 'generic')
                return {
                    ...common,
                    fields: node.data.fieldValues || {}
                }

            return common
        })

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

    const isLoading = pipelineQuery?.isLoading || schematicsQuery?.isLoading
    const isError = pipelineQuery?.isError || schematicsQuery?.isError

    if (isLoading) {
        return <Spin/>
    }

    if (isError) {
        return <div>Failed to load pipeline</div>
    }

    const devices = devicesResult.data || []
    const pipeline = pipelineQuery?.data?.data!
    const schematics = schematicsQuery?.data?.data!

    return (
        <Edit saveButtonProps={saveButtonProps} canDelete>
            <Form {...formProps} layout="vertical">
                <Form.Item name="nodes" hidden>
                    <input/>
                </Form.Item>
                <Form.Item name="edges" hidden>
                    <input/>
                </Form.Item>
                <ReactFlowProvider>
                    <PipelineFlowEditor
                        pipeline={pipeline}
                        devices={devices}
                        schematics={schematics}
                        onGraphChange={handleGraphChange}
                    />
                </ReactFlowProvider>
            </Form>
        </Edit>
    )
}