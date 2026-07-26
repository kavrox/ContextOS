/**
 * Context Builder — Constructs a ContextGraph from retrieved evidence
 *
 * Takes a user query, retrieves relevant memories, and builds a
 * typed ContextGraph of nodes and edges that visualise the
 * relationships between people, PRs, files, Slack threads, and
 * engineering decisions.
 *
 * Output validates against ContextGraphSchema from shared-types.
 */

import {
  ContextGraphSchema,
  type ContextGraph,
  type ContextNode,
  type ContextEdge,
  type EvidenceItem,
  type MemoryEntry,
} from '../../shared-types/index.js';
import { retrieveMemories, type ScoredMemory } from '../retriever/retriever.js';
import { getEnterpriseEntities } from '../data/data-loader.js';

// ---------------------------------------------------------------------------
// Helpers — Derive node type from EvidenceItem type
// ---------------------------------------------------------------------------

function evidenceTypeToNodeType(
  evidenceType: EvidenceItem['type'],
): ContextNode['type'] {
  switch (evidenceType) {
    case 'pr':
      return 'PullRequest';
    case 'commit':
      return 'File'; // commits relate to files
    case 'slack_thread':
      return 'SlackThread';
    case 'file':
      return 'File';
    case 'doc':
      return 'File'; // docs are treated as file nodes
    default:
      return 'File';
  }
}

function evidenceTypeToEdgeType(
  evidenceType: EvidenceItem['type'],
): ContextEdge['type'] {
  switch (evidenceType) {
    case 'pr':
      return 'MODIFIES';
    case 'commit':
      return 'MODIFIES';
    case 'slack_thread':
      return 'DISCUSSED_IN';
    case 'file':
      return 'DEPENDS_ON';
    case 'doc':
      return 'IMPLEMENTS';
    default:
      return 'DEPENDS_ON';
  }
}

// ---------------------------------------------------------------------------
// Graph construction
// ---------------------------------------------------------------------------

/**
 * Build a ContextGraph for a given query.
 *
 * Steps:
 *   1. Retrieve top memories via the Retriever.
 *   2. Create a "Decision" node for each MemoryEntry.
 *   3. Create evidence nodes from each citation.
 *   4. Link evidence nodes to their parent decision node.
 *   5. Cross-reference enterprise entities (people, orgs) and add edges.
 *   6. Validate the final graph through ContextGraphSchema.
 */
export async function buildContextGraph(
  query: string,
  options: { maxMemories?: number } = {},
): Promise<ContextGraph> {
  const { maxMemories = 8 } = options;

  // Step 1 — Retrieve relevant memories
  const scoredMemories = await retrieveMemories(query, {
    maxResults: maxMemories,
  });

  const nodes: ContextNode[] = [];
  const edges: ContextEdge[] = [];
  const nodeIdSet = new Set<string>();

  // Helper: add a node only if it hasn't been added yet
  const addNode = (node: ContextNode) => {
    if (!nodeIdSet.has(node.id)) {
      nodeIdSet.add(node.id);
      nodes.push(node);
    }
  };

  // Helper: add an edge
  const addEdge = (edge: ContextEdge) => {
    edges.push(edge);
  };

  // Step 2 — Decision nodes from memories
  for (const { entry, score } of scoredMemories) {
    const decisionNodeId = `decision:${entry.id}`;

    addNode({
      id: decisionNodeId,
      type: 'Decision',
      name: entry.question,
      metadata: {
        answer: entry.answer,
        relevanceScore: score,
        tags: entry.tags,
        timestamp: entry.timestamp,
      },
    });

    // Step 3 — Evidence nodes from citations
    for (const citation of entry.citations) {
      const evidenceNodeId = `evidence:${citation.sourceId}`;

      addNode({
        id: evidenceNodeId,
        type: evidenceTypeToNodeType(citation.type),
        name: citation.sourceId,
        metadata: {
          excerpt: citation.excerpt,
          url: citation.url,
          timestamp: citation.timestamp,
          relevanceScore: citation.relevanceScore,
          evidenceType: citation.type,
        },
      });

      // Step 4 — Link evidence → decision
      addEdge({
        id: `edge:${citation.sourceId}-supports-${entry.id}`,
        fromId: evidenceNodeId,
        toId: decisionNodeId,
        type: evidenceTypeToEdgeType(citation.type),
        metadata: {
          relevanceScore: citation.relevanceScore,
        },
      });
    }
  }

  // Step 5 — Cross-reference enterprise entities (people)
  await enrichWithEntities(nodes, edges, nodeIdSet, scoredMemories);

  // Step 6 — Validate and return
  const graph: ContextGraph = { nodes, edges };
  return ContextGraphSchema.parse(graph);
}

// ---------------------------------------------------------------------------
// Entity enrichment
// ---------------------------------------------------------------------------

/**
 * Scan evidence excerpts for person mentions and link them
 * to the graph as Person nodes.
 */
async function enrichWithEntities(
  nodes: ContextNode[],
  edges: ContextEdge[],
  nodeIdSet: Set<string>,
  scoredMemories: ScoredMemory[],
): Promise<void> {
  const entities = await getEnterpriseEntities();
  const teamMembers = entities.filter((e) => e.type === 'TeamMember');

  // Build a quick lookup: lowercase name → entity
  const nameLookup = new Map(
    teamMembers.map((m) => [m.name.toLowerCase(), m]),
  );

  for (const { entry } of scoredMemories) {
    // Check answer text for name mentions
    const answerLower = entry.answer.toLowerCase();

    for (const [nameLower, member] of nameLookup) {
      // Also check for first name match
      const firstName = nameLower.split(' ')[0];
      if (answerLower.includes(nameLower) || answerLower.includes(firstName)) {
        const personNodeId = `person:${member.id}`;

        // Add person node
        if (!nodeIdSet.has(personNodeId)) {
          nodeIdSet.add(personNodeId);
          nodes.push({
            id: personNodeId,
            type: 'Person',
            name: member.name,
            metadata: {
              email: member.metadata?.email,
              avatarUrl: member.metadata?.avatarUrl,
              role: member.metadata?.description,
            },
          });
        }

        // Link person → decision
        const decisionNodeId = `decision:${entry.id}`;
        edges.push({
          id: `edge:${member.id}-authored-${entry.id}`,
          fromId: personNodeId,
          toId: decisionNodeId,
          type: 'AUTHORED_BY',
          metadata: {},
        });
      }
    }
  }
}

/**
 * Build a ContextGraph from pre-supplied memories (no retrieval step).
 * Useful when the caller has already retrieved the memories.
 */
export async function buildContextGraphFromMemories(
  memories: MemoryEntry[],
): Promise<ContextGraph> {
  const scoredMemories: ScoredMemory[] = memories.map((entry) => ({
    entry,
    score: 1.0,
  }));

  const nodes: ContextNode[] = [];
  const edges: ContextEdge[] = [];
  const nodeIdSet = new Set<string>();

  const addNode = (node: ContextNode) => {
    if (!nodeIdSet.has(node.id)) {
      nodeIdSet.add(node.id);
      nodes.push(node);
    }
  };

  for (const { entry, score } of scoredMemories) {
    const decisionNodeId = `decision:${entry.id}`;

    addNode({
      id: decisionNodeId,
      type: 'Decision',
      name: entry.question,
      metadata: {
        answer: entry.answer,
        relevanceScore: score,
        tags: entry.tags,
        timestamp: entry.timestamp,
      },
    });

    for (const citation of entry.citations) {
      const evidenceNodeId = `evidence:${citation.sourceId}`;

      addNode({
        id: evidenceNodeId,
        type: evidenceTypeToNodeType(citation.type),
        name: citation.sourceId,
        metadata: {
          excerpt: citation.excerpt,
          url: citation.url,
          timestamp: citation.timestamp,
          relevanceScore: citation.relevanceScore,
          evidenceType: citation.type,
        },
      });

      edges.push({
        id: `edge:${citation.sourceId}-supports-${entry.id}`,
        fromId: evidenceNodeId,
        toId: decisionNodeId,
        type: evidenceTypeToEdgeType(citation.type),
        metadata: { relevanceScore: citation.relevanceScore },
      });
    }
  }

  await enrichWithEntities(nodes, edges, nodeIdSet, scoredMemories);

  const graph: ContextGraph = { nodes, edges };
  return ContextGraphSchema.parse(graph);
}
