import {Edit, useForm} from "@refinedev/antd";
import 'reactflow/dist/style.css';
import './reactflow-custom.css';
import {HttpError, useApiUrl, useCustom, useCustomMutation, useList} from "@refinedev/core";
import {Badge, Button, Dropdown, Form, message, Space, Spin} from "antd";
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
import {ColorModeContext} from "@/contexts/color-mode";
import {AudioDevice} from "@open-cinema/shared";
import GenericNode from "@/components/nodes/GenericNode.tsx";
import {UnifiedNodeData, FieldDefinition, Slot, NodeSaveResponse, NodeReloadResponse} from "@/types/node.ts";

// Re-export types for backward compatibility
export {SlotDirection, SlotType} from "@/types/node.ts";
export type {Slot, FieldDefinition as PipelineFieldSchematic} from "@/types/node.ts";

interface PipelineNodeSchematic {
    type_name: string;
    fields: FieldDefinition[];
    slots: Slot[];
}

interface PipelineSchematics {
    io: PipelineNodeSchematic[];
}

interface PipelineNode {
    id: number;
    type_name: string;
    fields: Record<string, any>;
    dynamic_slots_schematics?: Slot[];
}

interface PipelineEdge {
    id: number;
    node_a: number;
    node_b: number;
}

interface Pipeline {
    id: number;
    name: string;
    nodes: PipelineNode[];
    edges: PipelineEdge[];
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
    const {mutateAsync: saveNodeMutation} = useCustomMutation<NodeSaveResponse>();
    const {mutateAsync: reloadNodeMutation} = useCustomMutation<NodeReloadResponse>();
    const {mutateAsync: deleteNodeMutation} = useCustomMutation();

    const isDark = mode === 'dark';

    const apiUrl = useApiUrl();

    // Handle field values change from nodes
    const handleFieldValuesChange = useCallback((nodeId: string, fieldValues: Record<string, any>) => {
        setNodes((nds) => {
            const updatedNodes = nds.map((node) =>
                node.id === nodeId
                    ? {
                        ...node,
                        data: {
                            ...node.data,
                            fieldValues,
                            isDirty: true,
                        },
                    }
                    : node
            );
            // Trigger graph change to update form (pass current edges via functional setter)
            setEdges((currentEdges) => {
                setTimeout(() => onGraphChange(updatedNodes, currentEdges), 0);
                return currentEdges;
            });
            return updatedNodes;
        });
    }, [onGraphChange, setEdges]);

    // Handle node save
    const handleNodeSave = useCallback(async (nodeId: string) => {
        // Use setNodes to get current nodes state instead of closure
        setNodes((currentNodes) => {
            const node = currentNodes.find((n) => n.id === nodeId);
            if (!node) {
                message.error('Node not found');
                return currentNodes;
            }

            const nodeData = node.data as UnifiedNodeData;

            // Perform async save operation
            (async () => {
                try {
                    const url = nodeData.resource.isNew
                        ? `${apiUrl}/pipelines/${nodeData.resource.pipelineId}/nodes`
                        : `${apiUrl}/pipelines/${nodeData.resource.pipelineId}/nodes/${nodeData.resource.id}`;

                    const response = await saveNodeMutation({
                        url,
                        method: nodeData.resource.isNew ? 'post' : 'patch',
                        values: {
                            type_name: nodeData.resource.kind,
                            fields: nodeData.fieldValues,
                        },
                    });

                    const newNodeId = nodeData.resource.isNew ? `node-${response.data.id}` : nodeId;
                    const savedNodeResourceId = response.data.id || nodeData.resource.id;

                    // Update node with new data from backend
                    setNodes((nds) =>
                        nds.map((n) =>
                            n.id === nodeId
                                ? {
                                    ...n,
                                    id: newNodeId,
                                    data: {
                                        ...n.data,
                                        resource: {
                                            ...nodeData.resource,
                                            id: savedNodeResourceId,
                                            isNew: false,
                                        },
                                        dynamicSlots: response.data.dynamicSlots || nodeData.dynamicSlots,
                                        isDirty: false,
                                    },
                                }
                                : n
                        )
                    );

                    // Reload node to get updated dynamic slots
                    try {
                        const reloadResponse = await reloadNodeMutation({
                            url: `${apiUrl}/pipelines/${nodeData.resource.pipelineId}/nodes/${savedNodeResourceId}`,
                            method: 'get',
                            values: {},
                        });

                        setNodes((nds) =>
                            nds.map((n) =>
                                n.id === newNodeId
                                    ? {
                                        ...n,
                                        data: {
                                            ...n.data,
                                            // Update field values and dynamic slots from backend
                                            fieldValues: reloadResponse.data.fields || n.data.fieldValues,
                                            dynamicSlots: reloadResponse.data.dynamic_slots_schematics || n.data.dynamicSlots,
                                        },
                                    }
                                    : n
                            )
                        );
                    } catch (reloadError) {
                        console.warn('Failed to reload node after save:', reloadError);
                        // Don't fail the save operation if reload fails
                    }

                    message.success('Node saved successfully');
                } catch (error: any) {
                    message.error(error?.message || 'Failed to save node');
                    throw error;
                }
            })();

            return currentNodes;
        });
    }, [apiUrl, saveNodeMutation, reloadNodeMutation, setNodes]);

    // Handle node reload
    const handleNodeReload = useCallback(async (nodeId: string) => {
        // Use setNodes to get current nodes state
        setNodes((currentNodes) => {
            const node = currentNodes.find((n) => n.id === nodeId);
            if (!node) {
                message.error('Node not found');
                return currentNodes;
            }

            const nodeData = node.data as UnifiedNodeData;

            // Perform async reload operation
            (async () => {
                try {
                    const response = await reloadNodeMutation({
                        url: `${apiUrl}/pipelines/${nodeData.resource.pipelineId}/nodes/${nodeData.resource.id}`,
                        method: 'get',
                        values: {},
                    });

                    setNodes((nds) =>
                        nds.map((n) =>
                            n.id === nodeId
                                ? {
                                    ...n,
                                    data: {
                                        ...n.data,
                                        // Update field values and dynamic slots from backend
                                        fieldValues: response.data.fields || nodeData.fieldValues,
                                        dynamicSlots: response.data.dynamic_slots_schematics || nodeData.dynamicSlots,
                                    },
                                }
                                : n
                        )
                    );

                    message.success('Node reloaded successfully');
                } catch (error: any) {
                    message.error(error?.message || 'Failed to reload node');
                    throw error;
                }
            })();

            return currentNodes;
        });
    }, [apiUrl, reloadNodeMutation, setNodes]);

    // Handle node delete
    const handleNodeDelete = useCallback(async (nodeId: string) => {
        // Use setNodes to get current nodes state
        setNodes((currentNodes) => {
            const node = currentNodes.find((n) => n.id === nodeId);
            if (!node) {
                message.error('Node not found');
                return currentNodes;
            }

            const nodeData = node.data as UnifiedNodeData;

            // If it's a new node (not yet saved), just remove it from the graph
            if (nodeData.resource.isNew) {
                setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
                message.success('Node removed');
                return currentNodes.filter((n) => n.id !== nodeId);
            }

            // Otherwise, call the backend delete endpoint
            (async () => {
                try {
                    await deleteNodeMutation({
                        url: `${apiUrl}/pipelines/${nodeData.resource.pipelineId}/nodes/${nodeData.resource.id}`,
                        method: 'delete',
                        values: {},
                    });

                    // Remove node and its edges from the graph
                    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
                    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));

                    message.success('Node deleted successfully');
                } catch (error: any) {
                    message.error(error?.message || 'Failed to delete node');
                    throw error;
                }
            })();

            return currentNodes;
        });
    }, [apiUrl, deleteNodeMutation, setNodes, setEdges]);

    // Convert backend pipeline node to ReactFlow node with unified data structure
    const pipelineNodeToReactFlowNode = useCallback((node: PipelineNode, index: number): Node<UnifiedNodeData> => {
        const schematic = schematics.io.find(s => s.type_name === node.type_name);

        if (!schematic) {
            console.warn(`Schematic for ${node.type_name} not found`);
        }

        return {
            id: `node-${node.id}`,
            type: 'generic',
            position: {x: index * 300, y: index * 150},
            data: {
                name: node.type_name,
                resource: {
                    id: node.id,
                    kind: node.type_name,
                    pipelineId: pipeline.id,
                    isNew: false,
                },
                fieldDefinitions: schematic?.fields || [],
                fieldValues: node.fields || {},
                slotDefinitions: schematic?.slots || [],
                dynamicSlots: node.dynamic_slots_schematics || [],
                isDirty: false,
                isSaving: false,
                onFieldValuesChange: handleFieldValuesChange,
                onSave: handleNodeSave,
                onReload: handleNodeReload,
                onDelete: handleNodeDelete,
            },
        };
    }, [pipeline.id, schematics.io, handleFieldValuesChange, handleNodeSave, handleNodeReload, handleNodeDelete]);

    // Load pipeline data when component mounts or pipeline changes
    useEffect(() => {
        if (!pipeline.nodes || pipeline.nodes.length === 0) return;

        const loadedNodes = pipeline.nodes.map((node, index) =>
            pipelineNodeToReactFlowNode(node, index)
        );

        const loadedEdges = pipeline.edges?.map((edge) => ({
            id: `edge-${edge.id}`,
            source: `node-${edge.node_a}`,
            target: `node-${edge.node_b}`,
        })) || [];

        setNodes(loadedNodes);
        setEdges(loadedEdges);

        // Apply auto layout after nodes are loaded
        setTimeout(() => applyAutoLayout(), 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pipeline.id, pipeline.nodes?.length]); // Only reload when pipeline ID or node count changes

    // All nodes use GenericNode now
    const nodeTypes = useMemo(() => ({
        generic: (props: any) => <GenericNode {...props} />,
    }), []);

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

    // Add new node
    const addNode = useCallback((schematicName: string) => {
        const schematic = schematics.io.find(s => s.type_name === schematicName);
        if (!schematic) {
            message.error(`Schematic ${schematicName} not found`);
            return;
        }

        const tempId = `temp-${Date.now()}`;

        const newNode: Node<UnifiedNodeData> = {
            id: tempId,
            type: 'generic',
            position: {x: Math.random() * 400, y: Math.random() * 300},
            data: {
                name: schematic.type_name,
                resource: {
                    id: tempId,
                    kind: schematic.type_name,
                    pipelineId: pipeline.id,
                    isNew: true,
                },
                fieldDefinitions: schematic.fields,
                fieldValues: {},
                slotDefinitions: schematic.slots,
                dynamicSlots: [],
                isDirty: true, // New nodes are dirty by default
                isSaving: false,
                onFieldValuesChange: handleFieldValuesChange,
                onSave: handleNodeSave,
                onReload: handleNodeReload,
                onDelete: handleNodeDelete,
            },
        };

        const newNodes = [...nodes, newNode];
        setNodes(newNodes);
        onGraphChange(newNodes, edges);
    }, [pipeline.id, schematics.io, nodes, edges, handleFieldValuesChange, handleNodeSave, handleNodeReload, handleNodeDelete, setNodes, onGraphChange]);

    const schematicsDropdown = schematics.io.map(({type_name}) => ({
        key: type_name,
        label: <Space>{type_name}</Space>,
        onClick: () => addNode(type_name),
    }));

    // Audio device dropdown menus
    const inputDevices = devices.filter((device) => device.device_type === 'CAPTURE');
    const outputDevices = devices.filter((device) => device.device_type === 'PLAYBACK');

    const addAudioDeviceNode = useCallback((device: AudioDevice) => {
        const tempId = `temp-${Date.now()}`;
        const schematic = schematics.io.find(s => s.type_name === 'AudioPipelineDeviceNode');

        if (!schematic) {
            message.error('AudioPipelineDeviceNode schematic not found');
            return;
        }

        const newNode: Node<UnifiedNodeData> = {
            id: tempId,
            type: 'generic',
            position: {x: Math.random() * 400, y: Math.random() * 300},
            data: {
                name: 'AudioPipelineDeviceNode',
                resource: {
                    id: tempId,
                    kind: 'AudioPipelineDeviceNode',
                    pipelineId: pipeline.id,
                    isNew: true,
                },
                fieldDefinitions: schematic.fields,
                fieldValues: {device: device.id},
                slotDefinitions: schematic.slots,
                dynamicSlots: [],
                isDirty: true,
                isSaving: false,
                onFieldValuesChange: handleFieldValuesChange,
                onSave: handleNodeSave,
                onReload: handleNodeReload,
                onDelete: handleNodeDelete,
            },
        };

        const newNodes = [...nodes, newNode];
        setNodes(newNodes);
        onGraphChange(newNodes, edges);
    }, [pipeline.id, schematics.io, nodes, edges, handleFieldValuesChange, handleNodeSave, handleNodeReload, handleNodeDelete, setNodes, onGraphChange]);

    const inputDevicesDropdown = inputDevices.map((device) => ({
        key: device.id,
        label: (
            <Space>
                <Badge status={device.active ? 'success' : 'error'}/>
                {device.name}
            </Space>
        ),
        onClick: () => addAudioDeviceNode(device),
    }));

    const outputDevicesDropdown = outputDevices.map((device) => ({
        key: device.id,
        label: (
            <Space>
                <Badge status={device.active ? 'success' : 'error'}/>
                {device.name}
            </Space>
        ),
        onClick: () => addAudioDeviceNode(device),
    }));

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
    );
}

export default function PipelineEdit() {
    const {formProps, saveButtonProps, query: pipelineQuery, form} = useForm<Pipeline>({
        redirect: false
    });

    const apiUrl = useApiUrl();

    const {result: devicesResult} = useList<AudioDevice, HttpError>({
        resource: "devices",
    });

    const {query: schematicsQuery} = useCustom<PipelineSchematics>({
        url: `${apiUrl}/pipelines/schematics`,
        method: 'get'
    });

    // Transform ReactFlow graph to backend format
    const handleGraphChange = useCallback((nodes: Node[], edges: Edge[]) => {
        const transformedNodes = nodes.map((node) => {
            const nodeData = node.data as UnifiedNodeData;
            return {
                type_name: nodeData.resource.kind,
                fields: nodeData.fieldValues || {},
            };
        });

        const transformedEdges = edges.map((edge) => {
            const sourceIndex = nodes.findIndex((n) => n.id === edge.source);
            const targetIndex = nodes.findIndex((n) => n.id === edge.target);
            return {
                node_a: sourceIndex,
                node_b: targetIndex,
            };
        });

        // Update form values
        form?.setFieldsValue({
            nodes: transformedNodes,
            edges: transformedEdges,
        });
    }, [form]);

    const isLoading = pipelineQuery?.isLoading || schematicsQuery?.isLoading;
    const isError = pipelineQuery?.isError || schematicsQuery?.isError;

    if (isLoading) {
        return <Spin />;
    }

    if (isError) {
        return <div>Failed to load pipeline</div>;
    }

    const devices = devicesResult.data || [];
    const pipeline = pipelineQuery?.data?.data!;
    const schematics = schematicsQuery?.data?.data!;

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
                        schematics={schematics}
                        onGraphChange={handleGraphChange}
                    />
                </ReactFlowProvider>
            </Form>
        </Edit>
    );
}
