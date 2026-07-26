/**
 * Retriever — Top-K evidence retrieval with budget enforcement
 *
 * Implements the "retrieve narrow, reason deep" strategy.
 * Scores every MemoryEntry against the user query using the
 * relevance module, then returns the top-N citations within
 * the hard evidence budget (default: 8 items).
 */

import type { MemoryEntry, EvidenceItem } from '../../shared-types/index.js';
import { getAllMemories } from '../memory/memory-manager.js';
import { computeRelevance } from './relevance.js';
import { askCodebase } from '../llm/client.js';
import { fetchAndBundleRepo } from '../github/fetcher.js';

// ---------------------------------------------------------------------------
// Constants — per team decision (mem:retriever-token-limits)
// ---------------------------------------------------------------------------

/** Hard ceiling on evidence items returned. */
const DEFAULT_MAX_RESULTS = 8;

/** Minimum relevance score to be considered. */
const DEFAULT_MIN_SCORE = 0.1;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A scored MemoryEntry for internal ranking. */
export interface ScoredMemory {
  entry: MemoryEntry;
  score: number;
}

/** Options for the retriever. */
export interface RetrieveOptions {
  /** Maximum number of evidence items to return. Default: 8 */
  maxResults?: number;
  /** Minimum relevance score threshold. Default: 0.1 */
  minScore?: number;
  /** Only consider memories that have ALL of these tags. */
  tags?: string[];
  /** Optional query embedding for cosine similarity scoring. */
  queryEmbedding?: number[];
}

// ---------------------------------------------------------------------------
// Core retriever
// ---------------------------------------------------------------------------

/**
 * Retrieve the most relevant MemoryEntry items for a given query.
 *
 * Returns an array of ScoredMemory objects sorted by score descending,
 * capped at options.maxResults.
 */
export async function retrieveMemories(
  query: string,
  options: RetrieveOptions = {},
): Promise<ScoredMemory[]> {
  const {
    maxResults = DEFAULT_MAX_RESULTS,
    minScore = DEFAULT_MIN_SCORE,
    tags,
    queryEmbedding,
  } = options;

  const allMemories = await getAllMemories();

  // Score each memory
  const scored: ScoredMemory[] = allMemories
    .map((entry) => {
      // Tag pre-filter
      if (tags && tags.length > 0) {
        const entryTags = entry.tags ?? [];
        const hasAllTags = tags.every((t) =>
          entryTags.some((et: string) => et.toLowerCase() === t.toLowerCase()),
        );
        if (!hasAllTags) return null;
      }

      const score = computeRelevance(
        query,
        entry.question,
        entry.answer,
        entry.embeddings,
        queryEmbedding,
      );

      return { entry, score };
    })
    .filter((item): item is ScoredMemory => item !== null && item.score >= minScore);

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  // Enforce budget
  return scored.slice(0, maxResults);
}

/**
 * Retrieve flattened evidence items from top-scoring memories.
 *
 * This is a convenience wrapper that extracts and deduplicates
 * the EvidenceItem citations from the top memories, sorted by
 * their individual relevanceScore.
 */
export async function retrieveEvidence(
  query: string,
  options: RetrieveOptions = {},
): Promise<EvidenceItem[]> {
  const topMemories = await retrieveMemories(query, options);

  // Collect all citations, deduplicate by sourceId
  const seen = new Set<string>();
  const evidence: EvidenceItem[] = [];

  for (const { entry } of topMemories) {
    for (const citation of entry.citations) {
      if (!seen.has(citation.sourceId)) {
        seen.add(citation.sourceId);
        evidence.push(citation);
      }
    }
  }

  // Sort by relevanceScore descending
  evidence.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Enforce the same budget on evidence items
  const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
  return evidence.slice(0, maxResults);
}

/**
 * Live GitHub Repository QA using Gemini LLM
 */
export async function askLiveGithubRepo(query: string, repoUrl: string): Promise<string> {
  console.log(`[Live QA] Fetching repository: ${repoUrl}`);
  const codebaseContext = await fetchAndBundleRepo(repoUrl);
  
  console.log(`[Live QA] Sending ${codebaseContext.length} chars of context to LLM...`);
  const answer = await askCodebase(query, codebaseContext);
  
  return answer;
}
