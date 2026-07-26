import { z } from 'zod';

// ==========================================
// 1. EvidenceItem Schema
// ==========================================
export const EvidenceItemSchema = z.object({
  sourceId: z.string(), // Stable ID, e.g., "gh-pr-482", "slack-msg-12345"
  type: z.enum(['pr', 'commit', 'slack_thread', 'file', 'doc']),
  excerpt: z.string(), // Trimmed, relevant slice of code/discussion/documentation
  url: z.string(), // Link to the original item (e.g. GitHub PR URL, Slack permalink)
  timestamp: z.string(), // ISO 8601 string of the creation/modification time
  relevanceScore: z.number(), // Score used by Retriever / Context Builder to rank and budget evidence
});

export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

// ==========================================
// 2. MemoryEntry Schema (Engineering Memory)
// ==========================================
export const MemoryEntrySchema = z.object({
  id: z.string(), // Unique ID, e.g., UUID or hash of the question
  question: z.string(), // Raw user question
  answer: z.string(), // Synthesized markdown answer with citation placeholders (e.g. [gh-pr-482])
  citations: z.array(EvidenceItemSchema), // The actual evidence items referenced by the answer
  embeddings: z.array(z.number()).optional(), // Question embedding for semantic retrieval matching
  timestamp: z.string(), // ISO 8601 string when the memory was written/updated
  sourceHash: z.string(), // Hash representing the state of files/messages when reasoning occurred (for invalidation)
  tags: z.array(z.string()).optional(), // Tags for grouping/filtering memory entries
});

export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

// ==========================================
// 3. ContextGraph Schema (Knowledge Graph)
// ==========================================
export const ContextNodeSchema = z.object({
  id: z.string(), // Unique node ID, e.g., "file:src/services/checkout.ts", "person:alice"
  type: z.enum(['File', 'Service', 'PullRequest', 'Person', 'Decision', 'SlackThread']),
  name: z.string(), // User-friendly label for rendering
  metadata: z.record(z.any()).optional(), // Node-type specific properties (e.g., author, filepath, permalink, channel)
});

export type ContextNode = z.infer<typeof ContextNodeSchema>;

export const ContextEdgeSchema = z.object({
  id: z.string(), // Unique edge identifier, e.g., "edge:pr-482-modifies-checkout.ts"
  fromId: z.string(), // Reference to source node ID
  toId: z.string(), // Reference to target node ID
  type: z.enum(['MODIFIES', 'AUTHORED_BY', 'DISCUSSED_IN', 'DEPENDS_ON', 'IMPLEMENTS']),
  metadata: z.record(z.any()).optional(), // Edge-specific properties
});

export type ContextEdge = z.infer<typeof ContextEdgeSchema>;

export const ContextGraphSchema = z.object({
  nodes: z.array(ContextNodeSchema),
  edges: z.array(ContextEdgeSchema),
});

export type ContextGraph = z.infer<typeof ContextGraphSchema>;

// ==========================================
// 4. AgentTask Schema (Planner & Execution Trace)
// ==========================================
export const ToolCallSchema = z.object({
  id: z.string(), // Unique tool call execution ID
  toolName: z.string(), // Name of the MCP tool called (e.g. "search_pull_requests")
  arguments: z.record(z.any()), // Arguments sent to the tool call
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  result: z.any().optional(), // Normalized output of the tool execution
  error: z.string().optional(), // Error description if tool call failed
  timestamp: z.string(), // ISO 8601 string when execution started/completed
});

export type ToolCall = z.infer<typeof ToolCallSchema>;

export const AgentTaskSchema = z.object({
  id: z.string(), // Unique task/trace ID
  question: z.string(), // Question the agent is answering
  status: z.enum([
    'received',
    'planning',
    'retrieving',
    'reasoning',
    'reflecting',
    'completed',
    'failed',
  ]),
  plan: z.array(ToolCallSchema), // Ordered list of planned and executed tool calls
  executionTrace: z.array(
    z.object({
      step: z.string(), // Step label (e.g., "planner_decision", "retriever_fetch")
      timestamp: z.string(), // ISO 8601 string
      description: z.string(), // Text explanation of what the agent did in this step
    })
  ),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AgentTask = z.infer<typeof AgentTaskSchema>;

// ==========================================
// 5. EnterpriseEntity Schema
// ==========================================
export const EnterpriseEntitySchema = z.object({
  id: z.string(), // Unique enterprise identifier, e.g., "org:contextos", "slack-team:T0123"
  type: z.enum(['Organization', 'Repository', 'SlackWorkspace', 'Channel', 'TeamMember']),
  name: z.string(), // Human-friendly name of the entity
  externalId: z.string(), // ID of the entity in the provider system (GitHub org ID, Slack team ID, etc.)
  metadata: z.object({
    url: z.string().optional(), // Link to Github organization/repo or slack settings
    description: z.string().optional(), // Optional description of the entity
    email: z.string().optional(), // Email (only for TeamMember)
    avatarUrl: z.string().optional(), // Avatar image URL
    isActive: z.boolean().optional(), // Entity active state
    createdAt: z.string().optional(), // Date created in provider system
  }).optional(),
});

export type EnterpriseEntity = z.infer<typeof EnterpriseEntitySchema>;
