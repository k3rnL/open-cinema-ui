import {useCallback} from "react";
import ELK from "elkjs/lib/elk.bundled.js";
import {Edge, Node, useReactFlow} from "reactflow";

// elk layouting options can be found here:
// https://www.eclipse.org/elk/reference/algorithms/org-eclipse-elk-layered.html
const layoutOptions = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  nodeLayering: "INTERACTIVE",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.unnecessaryBendpoints": "true",
  "elk.layered.spacing.edgeNodeBetweenLayers": "10",
  "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
  "elk.layered.cycleBreaking.strategy": "DEPTH_FIRST",
  "elk.insideSelfLoops.activate": "true",
  separateConnectedComponents: "false",
  "spacing.componentComponent": "50",
  spacing: "50",
  "elk.layered.spacing.nodeNodeBetweenLayers": "20",
  "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
  "elk.layered.crossingMinimization.semiInteractive": "true",
  "elk.layered.mergeEdges": "true", // if portAlignment and portConstraint were to be removed, this makes the edges use only one port and not spread
};

const elk = new ELK();

// uses elkjs to give each node a layouted position
export const getLayoutedNodes = async (nodes: Node[], edges: Edge[]) => {
  const validEdges = edges.filter((edge) => {
    const sourceNode = nodes.find((node) => node.id === edge.source);
    const targetNode = nodes.find((node) => node.id === edge.target);
    return sourceNode && targetNode;
  });
  const graph = {
    id: "root",
    layoutOptions,
    children: nodes.map((n) => {
      // Use actual measured dimensions if available, otherwise estimate based on content
      const width = n.width || 240;
      const height = n.height || 120;

      return {
        id: n.id,
        width,
        height,
        targetPosition: "left",
        sourcePosition: "right",
        layoutOptions: {
          "portAlignment.default": "CENTER",
          portConstraints: "FIXED_SIDE",
        },
      };
    }),
    edges: validEdges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  const layoutedGraph = await elk.layout(graph);

  return nodes.map((node) => {
      const layoutedNode = layoutedGraph.children?.find(
          (lgNode) => lgNode.id === node.id
      );
      return {
          ...node,
          position: {
              x: layoutedNode?.x ?? 0,
              y: layoutedNode?.y ?? 0,
          },
      };
  });
};

export default function useLayoutNodes() {
  const { getNodes, getEdges, setNodes } = useReactFlow();

  const applyAutoLayout = useCallback(async () => {
    const layoutedNodes = await getLayoutedNodes(getNodes(), getEdges());
    setNodes(() => layoutedNodes);
  }, [getNodes, getEdges, setNodes]);

  return { applyAutoLayout };
}
