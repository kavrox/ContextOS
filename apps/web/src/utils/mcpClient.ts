/**
 * ContextOS MCP HTTP Client — Track 3 Bridge to Web Dashboard
 *
 * Provides a typed fetch wrapper for the ContextOS NitroStack MCP server.
 * The dashboard uses local dataStore.ts by default (fast, works offline).
 * When VITE_MCP_SERVER_URL is set in apps/web/.env.local, queries are
 * routed live to the server for the true end-to-end demo.
 *
 * Usage in ChatPanel.tsx:
 *   import { mcpPlanAndExecute, mcpBuildContextGraph } from './mcpClient';
 *   const task = await mcpPlanAndExecute("Why are we using Redis?");
 *
 * Server must be running:
 *   cd apps/server/ContextOS && npm run dev
 *   (listens on http://localhost:3001 by default)
 */

import type {
  AgentTask,
  ContextGraph,
  MemoryEntry,
  EnterpriseEntity,
} from '@contextos/shared-types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Base URL for the ContextOS MCP server. Falls back to localhost:3001. */
const MCP_SERVER_URL =
  (import.meta as any).env?.VITE_MCP_SERVER_URL ?? 'http://localhost:3001';

let _requestId = 1;

// ---------------------------------------------------------------------------
// Core JSON-RPC 2.0 transport
// ---------------------------------------------------------------------------

interface JsonRpcResponse<T> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

let activePostUrl: string | null = null;
let sseConnectionPromise: Promise<string> | null = null;
const pendingRequests = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();

async function getMcpPostUrl(): Promise<string> {
  if (activePostUrl) return activePostUrl;
  if (sseConnectionPromise) return sseConnectionPromise;

  sseConnectionPromise = new Promise((resolve, reject) => {
    try {
      const eventSource = new EventSource(`${MCP_SERVER_URL}/mcp`);

      eventSource.addEventListener('endpoint', (e: any) => {
        const postUrl = new URL(e.data, MCP_SERVER_URL).toString();
        activePostUrl = postUrl;
        resolve(postUrl);
      });

      eventSource.addEventListener('message', (e: any) => {
        try {
          const json = JSON.parse(e.data) as JsonRpcResponse<any>;
          if (json.id !== undefined && pendingRequests.has(json.id)) {
            const { resolve, reject } = pendingRequests.get(json.id)!;
            pendingRequests.delete(json.id);
            if (json.error) {
              reject(new Error(json.error.message));
            } else {
              let resObj = json.result;
              if (resObj && typeof resObj === 'object' && 'content' in resObj) {
                const textObj = resObj.content.find((c: any) => c.type === 'text');
                if (textObj && textObj.text) {
                  try {
                    resObj = JSON.parse(textObj.text);
                  } catch (e) {
                    resObj = { answer: textObj.text };
                  }
                }
              }
              resolve(resObj);
            }
          }
        } catch (err) {
          console.error("Failed to parse MCP message", err);
        }
      });

      eventSource.onerror = () => {
        reject(new Error("Failed to connect to MCP SSE endpoint"));
        eventSource.close();
      };
    } catch (err) {
      reject(err);
    }
  });

  return sseConnectionPromise;
}

async function callTool<T = unknown>(
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const postUrl = await getMcpPostUrl();
  const id = _requestId++;

  return new Promise<T>(async (resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });

    try {
      const response = await fetch(postUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: args,
          },
        }),
      });

      if (!response.ok) {
        pendingRequests.delete(id);
        reject(new Error(`ContextOS MCP server error: ${response.status} ${response.statusText}`));
      }
    } catch (err) {
      pendingRequests.delete(id);
      reject(err);
    }
  });
}

// ---------------------------------------------------------------------------
// Typed tool wrappers — mirrors the 7 server-side @Tool methods
// ---------------------------------------------------------------------------

/**
 * Run the full agent pipeline for an engineering question.
 * Returns a completed AgentTask with execution trace and evidence.
 */
export async function mcpPlanAndExecute(question: string): Promise<AgentTask> {
  return callTool<AgentTask>('plan_and_execute', { question });
}

/**
 * Fetch an AgentTask by its ID. Throws if not found.
 */
export async function mcpGetTaskStatus(taskId: string): Promise<AgentTask> {
  return callTool<AgentTask>('get_task_status', { taskId });
}

/**
 * List all AgentTask objects in the current server session.
 */
export async function mcpGetAllTasks(): Promise<{
  tasks: AgentTask[];
  count: number;
}> {
  return callTool('get_all_tasks');
}

/**
 * Search memories by keyword + optional tag filter.
 */
export async function mcpSearchMemories(
  query: string,
  opts?: { tags?: string[]; limit?: number },
): Promise<{ memories: MemoryEntry[]; count: number }> {
  return callTool('search_memories', { query, ...opts });
}

/**
 * Return all MemoryEntry records from the server memory store.
 */
export async function mcpGetAllMemories(): Promise<{
  memories: MemoryEntry[];
  count: number;
}> {
  return callTool('get_all_memories');
}

/**
 * Build and return a ContextGraph for a given query.
 * Plug the result directly into the KnowledgeGraph component.
 */
export async function mcpBuildContextGraph(
  query: string,
  maxMemories?: number,
): Promise<ContextGraph & { nodeCount: number; edgeCount: number }> {
  return callTool('build_context_graph', {
    query,
    ...(maxMemories !== undefined && { maxMemories }),
  });
}

/**
 * Return enterprise entities, optionally filtered by type.
 */
export async function mcpGetEnterpriseEntities(
  type?: 'Organization' | 'Repository' | 'SlackWorkspace' | 'Channel' | 'TeamMember',
): Promise<{ entities: EnterpriseEntity[]; count: number }> {
  return callTool('get_enterprise_entities', type ? { type } : {});
}

/**
 * Call the LLM to query a live GitHub repository.
 * Calls the standalone REST API on port 3002, bypassing MCP.
 */
export async function mcpAskLiveGithubRepo(
  query: string,
  repoUrl: string,
): Promise<{ answer: string }> {
  const LIVE_API_URL =
    (import.meta as any).env?.VITE_LIVE_API_URL ?? 'http://localhost:3002';

  const response = await fetch(`${LIVE_API_URL}/api/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, repoUrl }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(errBody.error || `Live API error: ${response.status}`);
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

/**
 * Ping the server to verify connectivity. Returns true if reachable.
 */
export async function mcpIsServerReachable(): Promise<boolean> {
  try {
    const response = await fetch(`${MCP_SERVER_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Convenience: integrated scenario builder
// Adapts mcpPlanAndExecute output to the DemoScenario shape used by ChatPanel
// ---------------------------------------------------------------------------

import type { DemoScenario } from './dataStore';

/**
 * Call the live server and reshape the AgentTask into a DemoScenario
 * compatible with the existing ChatPanel / KnowledgeGraph components.
 */
export async function mcpQueryScenario(question: string): Promise<DemoScenario> {
  const [task, graphResult] = await Promise.all([
    mcpPlanAndExecute(question),
    mcpBuildContextGraph(question, 8),
  ]);

  // Extract the synthesized answer from the top memory retrieval result
  // (the planner embeds retrieval results in the plan's tool call results)
  const retrieveCall = task.plan.find((c) => c.toolName === 'retrieve_memories');
  const memoriesResult = await mcpSearchMemories(question, { limit: 1 });
  const topMemory = memoriesResult.memories[0];

  return {
    question: task.question,
    answer: topMemory?.answer ?? `Agent completed task ${task.id} (${task.status}).`,
    citations: topMemory?.citations ?? [],
    graph: { nodes: graphResult.nodes, edges: graphResult.edges },
    task,
  };
}
