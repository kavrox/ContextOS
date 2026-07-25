import { useEffect, useState, useRef } from 'react';
import type { ContextGraph, ContextNode } from '@contextos/shared-types';
import { 
  FileCode, 
  Settings, 
  GitPullRequest, 
  User, 
  Lightbulb, 
  MessageSquare,
  Maximize2,
  Info
} from 'lucide-react';

interface KnowledgeGraphProps {
  graphData: ContextGraph;
}

interface SimNode extends ContextNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

export default function KnowledgeGraph({ graphData }: KnowledgeGraphProps) {
  const [nodes, setNodes] = useState<SimNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<SimNode | null>(null);
  const dragNodeRef = useRef<number | null>(null);
  const containerRef = useRef<SVGSVGElement | null>(null);

  // Initialize nodes and run force layout simulation
  useEffect(() => {
    const width = 600;
    const height = 380;
    
    // Position nodes in a circle initially
    const initialNodes: SimNode[] = graphData.nodes.map((node, i) => {
      const angle = (i / graphData.nodes.length) * 2 * Math.PI;
      const radius = 25;
      return {
        ...node,
        x: width / 2 + Math.cos(angle) * 120 + (Math.random() - 0.5) * 20,
        y: height / 2 + Math.sin(angle) * 120 + (Math.random() - 0.5) * 20,
        vx: 0,
        vy: 0,
        radius
      };
    });

    setNodes(initialNodes);
    setSelectedNode(null);
  }, [graphData]);

  // Spring-force layout simulation loop
  useEffect(() => {
    if (nodes.length === 0) return;

    let animFrame: number;
    const width = 600;
    const height = 380;
    const repulsion = 800; // force pushing nodes apart
    const springLength = 100; // ideal edge length
    const springStrength = 0.05; // attraction factor
    const centerGravity = 0.02; // pull to center
    const damping = 0.85; // friction

    const tick = () => {
      setNodes((currentNodes) => {
        // Create a copy of coordinates to update
        const updated = currentNodes.map(n => ({ ...n }));

        // 1. Repulsion between all nodes
        for (let i = 0; i < updated.length; i++) {
          for (let j = i + 1; j < updated.length; j++) {
            const dx = updated[j].x - updated[i].x;
            const dy = updated[j].y - updated[i].y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            
            // Push force
            const force = repulsion / (dist * dist);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            // Apply force to velocities
            if (i !== dragNodeRef.current) {
              updated[i].vx -= fx;
              updated[i].vy -= fy;
            }
            if (j !== dragNodeRef.current) {
              updated[j].vx += fx;
              updated[j].vy += fy;
            }
          }
        }

        // 2. Attraction along edges
        graphData.edges.forEach((edge) => {
          const idxFrom = updated.findIndex(n => n.id === edge.fromId);
          const idxTo = updated.findIndex(n => n.id === edge.toId);
          if (idxFrom === -1 || idxTo === -1) return;

          const dx = updated[idxTo].x - updated[idxFrom].x;
          const dy = updated[idxTo].y - updated[idxFrom].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (dist - springLength) * springStrength;

          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (idxFrom !== dragNodeRef.current) {
            updated[idxFrom].vx += fx;
            updated[idxFrom].vy += fy;
          }
          if (idxTo !== dragNodeRef.current) {
            updated[idxTo].vx -= fx;
            updated[idxTo].vy -= fy;
          }
        });

        // 3. Center Gravity & Boundary constraints
        updated.forEach((node, idx) => {
          if (idx === dragNodeRef.current) return;

          // Pull to center
          const dx = width / 2 - node.x;
          const dy = height / 2 - node.y;
          node.vx += dx * centerGravity;
          node.vy += dy * centerGravity;

          // Apply velocity and damping
          node.x += node.vx;
          node.y += node.vy;
          node.vx *= damping;
          node.vy *= damping;

          // Keep in bounds
          node.x = Math.max(30, Math.min(width - 30, node.x));
          node.y = Math.max(30, Math.min(height - 30, node.y));
        });

        return updated;
      });

      animFrame = requestAnimationFrame(tick);
    };

    animFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrame);
  }, [nodes.length, graphData.edges]);

  // Dragging event handlers
  const handleMouseDown = (_e: React.MouseEvent<SVGElement>, index: number) => {
    dragNodeRef.current = index;
    setSelectedNode(nodes[index]);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (dragNodeRef.current === null || !containerRef.current) return;

    // Get cursor position relative to SVG coordinates
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setNodes((currentNodes) => {
      const copy = [...currentNodes];
      const nodeIdx = dragNodeRef.current!;
      if (nodeIdx >= 0 && nodeIdx < copy.length) {
        copy[nodeIdx] = {
          ...copy[nodeIdx],
          x,
          y,
          vx: 0,
          vy: 0
        };
      }
      return copy;
    });
  };

  const handleMouseUp = () => {
    dragNodeRef.current = null;
  };

  const getNodeIcon = (type: string) => {
    const iconClass = "w-4 h-4 text-white";
    switch (type) {
      case 'File':
        return <FileCode className={iconClass} />;
      case 'Service':
        return <Settings className={iconClass} />;
      case 'PullRequest':
        return <GitPullRequest className={iconClass} />;
      case 'Person':
        return <User className={iconClass} />;
      case 'Decision':
        return <Lightbulb className={iconClass} />;
      default:
        return <MessageSquare className={iconClass} />;
    }
  };

  const getNodeColor = (type: string) => {
    switch (type) {
      case 'File': return 'fill-accent-indigo stroke-accent-indigo/60';
      case 'Service': return 'fill-accent-purple stroke-accent-purple/60';
      case 'PullRequest': return 'fill-accent-blue stroke-accent-blue/60';
      case 'Person': return 'fill-accent-emerald stroke-accent-emerald/60';
      case 'Decision': return 'fill-amber-500 stroke-amber-500/60';
      default: return 'fill-accent-rose stroke-accent-rose/60';
    }
  };

  return (
    <div className="glass-panel p-6 rounded-2xl flex flex-col h-[520px] w-full relative overflow-hidden">
      <div className="flex justify-between items-center mb-4 border-b border-border/50 pb-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2 text-white">
            <GitPullRequest className="w-5 h-5 text-accent-indigo" />
            Context Graph Node Observability
          </h3>
          <p className="text-xs text-gray-400">
            Interactive relational map of files, code services, PRs, and authors. Drag nodes to inspect links.
          </p>
        </div>
        <div className="flex gap-2">
          <span className="text-[10px] bg-accent-indigo/10 border border-accent-indigo/20 text-accent-indigo px-2 py-0.5 rounded font-mono">
            Nodes: {nodes.length}
          </span>
          <span className="text-[10px] bg-accent-purple/10 border border-accent-purple/20 text-accent-purple px-2 py-0.5 rounded font-mono">
            Edges: {graphData.edges.length}
          </span>
        </div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* SVG Drawing Canvas */}
        <div className="flex-1 bg-background/50 border border-border/80 rounded-xl relative overflow-hidden">
          <svg
            ref={containerRef}
            width="100%"
            height="100%"
            viewBox="0 0 600 380"
            className="select-none cursor-grab active:cursor-grabbing"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {/* Draw edge link lines */}
            {graphData.edges.map((edge) => {
              const fromNode = nodes.find(n => n.id === edge.fromId);
              const toNode = nodes.find(n => n.id === edge.toId);
              if (!fromNode || !toNode) return null;

              return (
                <g key={edge.id} className="group">
                  <line
                    x1={fromNode.x}
                    y1={fromNode.y}
                    x2={toNode.x}
                    y2={toNode.y}
                    stroke="#1f2530"
                    strokeWidth="2"
                  />
                  {/* Glowing animate stream for edge flow */}
                  <line
                    x1={fromNode.x}
                    y1={fromNode.y}
                    x2={toNode.x}
                    y2={toNode.y}
                    stroke="rgba(92, 107, 192, 0.4)"
                    strokeWidth="1.5"
                    className="animate-edge-flow"
                  />
                  {/* Invisible thick line for easier edge hover detection */}
                  <line
                    x1={fromNode.x}
                    y1={fromNode.y}
                    x2={toNode.x}
                    y2={toNode.y}
                    stroke="transparent"
                    strokeWidth="8"
                    className="cursor-pointer"
                  />
                  <title>{edge.type}</title>
                </g>
              );
            })}

            {/* Draw nodes */}
            {nodes.map((node, index) => {
              const isSelected = selectedNode?.id === node.id;
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  className="cursor-pointer"
                  onMouseDown={(e) => handleMouseDown(e, index)}
                >
                  {/* Outer shadow glow ring */}
                  <circle
                    r={isSelected ? 24 : 19}
                    className={`fill-transparent stroke-transparent transition-all duration-300 ${
                      isSelected ? 'stroke-accent-indigo/40 ring-4' : 'group-hover:stroke-border/40'
                    }`}
                    strokeWidth="4"
                  />
                  {/* Main Circle shape */}
                  <circle
                    r={isSelected ? 18 : 15}
                    className={`stroke-2 transition-all duration-200 ${getNodeColor(node.type)}`}
                  />
                  {/* Node icon inside */}
                  <g transform="translate(-8, -8)">
                    {getNodeIcon(node.type)}
                  </g>
                  {/* Node Label Text */}
                  <text
                    y="28"
                    textAnchor="middle"
                    className="text-[10px] fill-gray-300 font-mono font-medium drop-shadow-md select-none pointer-events-none"
                  >
                    {node.name.length > 15 ? `${node.name.slice(0, 12)}...` : node.name}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Node detail side panel */}
        <div className="w-56 bg-surface-hover/50 border border-border/80 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-semibold text-white mb-3 flex items-center gap-1.5 border-b border-border/50 pb-2">
              <Info className="w-3.5 h-3.5 text-accent-indigo" />
              Node Details
            </h4>
            {selectedNode ? (
              <div className="space-y-3">
                <div>
                  <span className="text-[9px] uppercase tracking-wider font-mono text-gray-500 block">Node Type</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-surface border border-border text-white inline-block mt-0.5">
                    {selectedNode.type}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] uppercase tracking-wider font-mono text-gray-500 block">Identifier</span>
                  <span className="text-xs text-white font-semibold font-mono break-all block mt-0.5">
                    {selectedNode.id}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] uppercase tracking-wider font-mono text-gray-500 block">Label</span>
                  <span className="text-xs text-gray-300 block mt-0.5 leading-relaxed">
                    {selectedNode.name}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center py-10">
                <Maximize2 className="w-8 h-8 text-gray-600 mx-auto mb-2 stroke-1" />
                <p className="text-xs text-gray-500 leading-normal">
                  Click a node in the graph workspace to view its relationships.
                </p>
              </div>
            )}
          </div>
          
          <div className="text-[9px] font-mono text-gray-500 bg-background/50 p-2.5 rounded border border-border/30">
            💡 <span className="text-gray-400">ContextNodes are automatically indexed as the agent processes git/slack hooks.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
