/**
 * ContextOS MCP Tools — Track 3 (The Plumber)
 *
 * Exposes Track 2's agent logic as clean, callable MCP tools via the
 * NitroStack @Tool decorator pattern. All inputs are validated by Zod
 * schemas and all outputs conform to @contextos/shared-types.
 *
 * Tool inventory:
 *   1. plan_and_execute        — Full agent pipeline (Planner → Retriever → ContextBuilder)
 *   2. get_task_status         — Fetch a task + its full execution trace by ID
 *   3. get_all_tasks           — List all tasks in the current session store
 *   4. search_memories         — Keyword + tag search over the memory store
 *   5. get_all_memories        — Return every MemoryEntry (seeded from enterprise-data.json)
 *   6. build_context_graph     — Build and return a validated ContextGraph for a query
 *   7. get_enterprise_entities — Return all EnterpriseEntity records
 */

import { ToolDecorator as Tool, ExecutionContext, z } from '@nitrostack/core';
import {
  planAndExecute,
  getTaskById,
  getAllTasks,
  searchMemories,
  getAllMemories,
  buildContextGraph,
  getEnterpriseEntities,
} from '../../agents/index.js';
import { askLiveGithubRepo } from '../../agents/retriever/retriever.js';

// ---------------------------------------------------------------------------
// ContextOS Tools class
// ---------------------------------------------------------------------------

export class ContextOSTools {

  // ─── 1. plan_and_execute ─────────────────────────────────────────────────

  @Tool({
    name: 'plan_and_execute',
    description:
      'Run the full ContextOS agent pipeline for an engineering question. ' +
      'Creates an AgentTask, runs Planner → Retriever → ContextBuilder → Reflection, ' +
      'and returns the completed task with evidence citations and execution trace. ' +
      'This is the primary entry point for the dashboard chat panel.',
    inputSchema: z.object({
      question: z
        .string()
        .min(3)
        .describe(
          'The natural-language engineering question to answer (e.g. "Why are we using Redis?")',
        ),
    }),
    examples: {
      request: { question: 'Why are we using Redis?' },
      response: {
        id: 'task-1234567-abc',
        question: 'Why are we using Redis?',
        status: 'completed',
        plan: [],
        executionTrace: [],
        createdAt: '2026-07-25T18:30:00Z',
        updatedAt: '2026-07-25T18:30:05Z',
      },
    },
  })
  async planAndExecute(input: { question: string }, ctx: ExecutionContext) {
    ctx.logger.info('[ContextOS] plan_and_execute called', { question: input.question });

    try {
      const task = await planAndExecute(input.question);
      ctx.logger.info('[ContextOS] plan_and_execute completed', {
        taskId: task.id,
        status: task.status,
        traceSteps: task.executionTrace.length,
      });
      return task;
    } catch (err: any) {
      ctx.logger.error('[ContextOS] plan_and_execute failed', { error: err.message });
      throw new Error(`Agent pipeline failed: ${err.message}`);
    }
  }

  // ─── 2. get_task_status ───────────────────────────────────────────────────

  @Tool({
    name: 'get_task_status',
    description:
      'Fetch a previously created AgentTask by its ID. Returns the full task ' +
      'object including current status, execution trace, and planned tool calls. ' +
      'Use after calling plan_and_execute to poll or inspect a specific task.',
    inputSchema: z.object({
      taskId: z
        .string()
        .describe('The unique task ID returned by plan_and_execute (e.g. "task-1234567-abc")'),
    }),
    examples: {
      request: { taskId: 'task-1234567-abc' },
      response: { id: 'task-1234567-abc', status: 'completed' },
    },
  })
  async getTaskStatus(input: { taskId: string }, ctx: ExecutionContext) {
    ctx.logger.info('[ContextOS] get_task_status called', { taskId: input.taskId });

    const task = getTaskById(input.taskId);
    if (!task) {
      throw new Error(`Task with id "${input.taskId}" not found.`);
    }
    return task;
  }

  // ─── 3. get_all_tasks ────────────────────────────────────────────────────

  @Tool({
    name: 'get_all_tasks',
    description:
      'Return all AgentTask objects in the current in-memory session store. ' +
      'Useful for the dashboard task inspector panel to list all recent queries ' +
      'and their statuses in the current server session.',
    inputSchema: z.object({}),
    examples: {
      request: {},
      response: { tasks: [], count: 0 },
    },
  })
  async getAllTasks(_input: Record<string, never>, ctx: ExecutionContext) {
    ctx.logger.info('[ContextOS] get_all_tasks called');

    const tasks = getAllTasks();
    return {
      tasks,
      count: tasks.length,
    };
  }

  // ─── 4. search_memories ──────────────────────────────────────────────────

  @Tool({
    name: 'search_memories',
    description:
      'Search the engineering memory store by keyword query and optional tag filter. ' +
      'Returns matching MemoryEntry records sorted by relevance (substring match on ' +
      'question + answer fields). Seeded from enterprise-data.json via the DataLoader.',
    inputSchema: z.object({
      query: z
        .string()
        .min(1)
        .describe('Keyword query to match against memory question and answer fields'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Optional list of tags — only entries containing ALL tags are returned'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Maximum number of results to return (default: 50)'),
    }),
    examples: {
      request: { query: 'Redis', tags: ['caching'], limit: 10 },
      response: { memories: [], count: 0 },
    },
  })
  async searchMemories(
    input: { query: string; tags?: string[]; limit?: number },
    ctx: ExecutionContext,
  ) {
    ctx.logger.info('[ContextOS] search_memories called', {
      query: input.query,
      tags: input.tags,
      limit: input.limit,
    });

    const memories = await searchMemories(input.query, {
      tags: input.tags,
      limit: input.limit ?? 50,
    });

    return {
      memories,
      count: memories.length,
    };
  }

  // ─── 5. get_all_memories ─────────────────────────────────────────────────

  @Tool({
    name: 'get_all_memories',
    description:
      'Return all MemoryEntry records from the in-memory store, which is seeded ' +
      'from enterprise-data.json on first call. Useful for populating the full ' +
      'engineering memory browser in the dashboard.',
    inputSchema: z.object({}),
    examples: {
      request: {},
      response: { memories: [], count: 0 },
    },
  })
  async getAllMemories(_input: Record<string, never>, ctx: ExecutionContext) {
    ctx.logger.info('[ContextOS] get_all_memories called');

    const memories = await getAllMemories();
    return {
      memories,
      count: memories.length,
    };
  }

  // ─── 6. build_context_graph ──────────────────────────────────────────────

  @Tool({
    name: 'build_context_graph',
    description:
      'Build and return a ContextGraph for a given engineering query. Retrieves ' +
      'the most relevant memories, constructs Decision + Evidence + Person nodes, ' +
      'and links them with typed edges (MODIFIES, AUTHORED_BY, DISCUSSED_IN, etc.). ' +
      'Output is validated against ContextGraphSchema from @contextos/shared-types. ' +
      'Use to feed the KnowledgeGraph visualiser in the dashboard.',
    inputSchema: z.object({
      query: z
        .string()
        .min(3)
        .describe('The engineering question or topic to build the context graph for'),
      maxMemories: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe('Maximum number of memory entries to use as graph seeds (default: 8)'),
    }),
    examples: {
      request: { query: 'Why are we using Redis?', maxMemories: 8 },
      response: { nodes: [], edges: [], nodeCount: 0, edgeCount: 0 },
    },
  })
  async buildContextGraph(
    input: { query: string; maxMemories?: number },
    ctx: ExecutionContext,
  ) {
    ctx.logger.info('[ContextOS] build_context_graph called', {
      query: input.query,
      maxMemories: input.maxMemories,
    });

    try {
      const graph = await buildContextGraph(input.query, {
        maxMemories: input.maxMemories ?? 8,
      });

      ctx.logger.info('[ContextOS] build_context_graph completed', {
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
      });

      return {
        ...graph,
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
      };
    } catch (err: any) {
      ctx.logger.error('[ContextOS] build_context_graph failed', { error: err.message });
      throw new Error(`Context graph build failed: ${err.message}`);
    }
  }

  // ─── 7. get_enterprise_entities ──────────────────────────────────────────

  @Tool({
    name: 'get_enterprise_entities',
    description:
      'Return all EnterpriseEntity records from the mock database. Includes ' +
      'Organizations, Repositories, SlackWorkspaces, Channels, and TeamMembers. ' +
      'Used by the EntityGrid panel in the dashboard to display org structure.',
    inputSchema: z.object({
      type: z
        .enum(['Organization', 'Repository', 'SlackWorkspace', 'Channel', 'TeamMember'])
        .optional()
        .describe('Optional filter — return only entities of this type'),
    }),
    examples: {
      request: { type: 'TeamMember' },
      response: { entities: [], count: 0 },
    },
  })
  async getEnterpriseEntities(
    input: { type?: 'Organization' | 'Repository' | 'SlackWorkspace' | 'Channel' | 'TeamMember' },
    ctx: ExecutionContext,
  ) {
    ctx.logger.info('[ContextOS] get_enterprise_entities called', { type: input.type });

    let entities = await getEnterpriseEntities();

    // Optional type filter
    if (input.type) {
      entities = entities.filter((e) => e.type === input.type);
    }

    return {
      entities,
      count: entities.length,
    };
  }

  // ─── 8. ask_live_github_repo ──────────────────────────────────────────────

  @Tool({
    name: 'ask_live_github_repo',
    description:
      'Download a GitHub repository, bundle its text files, and pass it to an LLM ' +
      'to answer a natural language question. Used for live Q&A over real repositories.',
    inputSchema: z.object({
      query: z.string().min(3).describe('The engineering question'),
      repoUrl: z.string().url().describe('The full GitHub repository URL'),
    }),
    examples: {
      request: { query: 'What does this repo do?', repoUrl: 'https://github.com/user/repo' },
      response: { answer: 'This repo is a...' },
    },
  })
  async askLiveGithubRepo(
    input: { query: string; repoUrl: string },
    ctx: ExecutionContext,
  ) {
    ctx.logger.info('[ContextOS] ask_live_github_repo called', {
      query: input.query,
      repoUrl: input.repoUrl,
    });

    try {
      const answer = await askLiveGithubRepo(input.query, input.repoUrl);
      return { answer };
    } catch (err: any) {
      ctx.logger.error('[ContextOS] ask_live_github_repo failed', { error: err.message });
      throw new Error(`Failed to query LLM for repo: ${err.message}`);
    }
  }
}
