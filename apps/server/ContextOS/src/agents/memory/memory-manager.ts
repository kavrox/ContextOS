/**
 * Memory Manager — CRUD operations for MemoryEntry items
 *
 * Maintains an in-memory store seeded from enterprise-data.json.
 * New entries, updates, and deletes only affect the runtime store;
 * the on-disk JSON stays immutable to avoid cross-track conflicts.
 *
 * Every write passes through MemoryEntrySchema.parse() for safety.
 */

import { z } from 'zod';
import {
  MemoryEntrySchema,
  type MemoryEntry,
} from '../../shared-types/index.js';
import { getMemoryEntries as loadFromDisk } from '../data/data-loader.js';

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------
let store: MemoryEntry[] = [];
let isSeeded = false;

/** Seed the in-memory store from the mock database (once). */
async function ensureSeeded(): Promise<void> {
  if (!isSeeded) {
    store = [...(await loadFromDisk())]; // shallow clone so mutations don't affect cache
    isSeeded = true;
  }
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

/** Return all memory entries currently in the store. */
export async function getAllMemories(): Promise<MemoryEntry[]> {
  await ensureSeeded();
  return [...store];
}

/** Find a memory entry by its unique id. */
export async function getMemoryById(
  id: string,
): Promise<MemoryEntry | undefined> {
  await ensureSeeded();
  return store.find((entry) => entry.id === id);
}

// ---------------------------------------------------------------------------
// Write operations
// ---------------------------------------------------------------------------

/**
 * Create a new MemoryEntry.
 * The input is validated through MemoryEntrySchema before insertion.
 * Throws a ZodError if validation fails.
 */
export async function createMemory(
  entry: MemoryEntry,
): Promise<MemoryEntry> {
  await ensureSeeded();

  // Validate
  const validated = MemoryEntrySchema.parse(entry);

  // Prevent duplicate IDs
  if (store.some((e) => e.id === validated.id)) {
    throw new Error(`MemoryEntry with id "${validated.id}" already exists.`);
  }

  store.push(validated);
  return validated;
}

/**
 * Update an existing MemoryEntry by id.
 * Merges partial fields onto the existing entry, then re-validates.
 */
export async function updateMemory(
  id: string,
  patch: Partial<MemoryEntry>,
): Promise<MemoryEntry> {
  await ensureSeeded();

  const index = store.findIndex((e) => e.id === id);
  if (index === -1) {
    throw new Error(`MemoryEntry with id "${id}" not found.`);
  }

  const merged = { ...store[index], ...patch, id }; // id is immutable
  const validated = MemoryEntrySchema.parse(merged);
  store[index] = validated;
  return validated;
}

/**
 * Delete a MemoryEntry by id.
 * Returns true if the entry was found and deleted, false otherwise.
 */
export async function deleteMemory(id: string): Promise<boolean> {
  await ensureSeeded();

  const index = store.findIndex((e) => e.id === id);
  if (index === -1) return false;

  store.splice(index, 1);
  return true;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** Options for the searchMemories function. */
export interface MemorySearchOptions {
  /** Only return entries that have ALL of these tags. */
  tags?: string[];
  /** Maximum number of results. Default: 50 */
  limit?: number;
}

/**
 * Search memory entries by keyword and optional tag filter.
 *
 * Matches the query string against the `question` and `answer` fields
 * (case-insensitive substring match). If tags are provided, only entries
 * containing every specified tag are included.
 */
export async function searchMemories(
  query: string,
  options: MemorySearchOptions = {},
): Promise<MemoryEntry[]> {
  await ensureSeeded();

  const { tags, limit = 50 } = options;
  const lowerQuery = query.toLowerCase();

  let results = store.filter((entry) => {
    // Tag filter — every requested tag must be present
    if (tags && tags.length > 0) {
      const entryTags = entry.tags ?? [];
      const hasAllTags = tags.every((t) =>
        entryTags.some((et: string) => et.toLowerCase() === t.toLowerCase()),
      );
      if (!hasAllTags) return false;
    }

    // Keyword filter
    const inQuestion = entry.question.toLowerCase().includes(lowerQuery);
    const inAnswer = entry.answer.toLowerCase().includes(lowerQuery);
    return inQuestion || inAnswer;
  });

  return results.slice(0, limit);
}

/**
 * Reset the in-memory store back to the on-disk snapshot.
 * Useful for testing or hot-reload scenarios.
 */
export async function resetStore(): Promise<void> {
  isSeeded = false;
  store = [];
  await ensureSeeded();
}
