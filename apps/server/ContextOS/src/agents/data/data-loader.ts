/**
 * Data Loader — Ingests and validates enterprise-data.json
 *
 * Reads the mock JSON database from @contextos/shared-types,
 * validates every record through Zod schemas, and exposes
 * typed getters for downstream modules.
 *
 * Design: The JSON file is loaded once and cached in memory.
 * Call reloadData() to force a re-read during development.
 */

import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { z } from 'zod';
import {
  MemoryEntrySchema,
  EnterpriseEntitySchema,
  type MemoryEntry,
  type EnterpriseEntity,
} from '../../shared-types/index.js';

// ---------------------------------------------------------------------------
// Internal cache
// ---------------------------------------------------------------------------
let cachedMemoryEntries: MemoryEntry[] = [];
let cachedEnterpriseEntities: EnterpriseEntity[] = [];
let isLoaded = false;

// ---------------------------------------------------------------------------
// Schema for the top-level JSON structure
// ---------------------------------------------------------------------------
const EnterpriseDataFileSchema = z.object({
  enterpriseEntities: z.array(EnterpriseEntitySchema),
  memoryEntries: z.array(MemoryEntrySchema),
});

// ---------------------------------------------------------------------------
// Resolve the path to enterprise-data.json
// ---------------------------------------------------------------------------
function resolveDataPath(): string {
  // Works for both ESM (__dirname equivalent) and fallback
  try {
    const currentFile = fileURLToPath(import.meta.url);
    const currentDir = dirname(currentFile);
    // Navigate from agents/data/ → src/ → ContextOS/ → server/ → apps/ → root → packages/shared-types/src/
    return resolve(
      currentDir,
      '..',
      '..',
      '..',
      '..',
      '..',
      '..',
      'packages',
      'shared-types',
      'src',
      'enterprise-data.json',
    );
  } catch {
    // Fallback for environments where import.meta.url is unavailable
    return resolve(
      process.cwd(),
      '..',
      '..',
      '..',
      'packages',
      'shared-types',
      'src',
      'enterprise-data.json',
    );
  }
}

// ---------------------------------------------------------------------------
// Core loader
// ---------------------------------------------------------------------------

/**
 * Load and validate enterprise-data.json.
 * Called lazily on first getter access or explicitly via reloadData().
 */
export async function loadData(): Promise<void> {
  const dataPath = resolveDataPath();
  const raw = await readFile(dataPath, 'utf-8');
  const json = JSON.parse(raw);

  // Validate the entire file through Zod
  const parsed = EnterpriseDataFileSchema.parse(json);

  cachedMemoryEntries = parsed.memoryEntries;
  cachedEnterpriseEntities = parsed.enterpriseEntities;
  isLoaded = true;
}

/**
 * Force a re-read from disk. Useful during hot-reload dev cycles.
 */
export async function reloadData(): Promise<void> {
  isLoaded = false;
  await loadData();
}

// ---------------------------------------------------------------------------
// Ensure data is loaded before any getter returns
// ---------------------------------------------------------------------------
async function ensureLoaded(): Promise<void> {
  if (!isLoaded) {
    await loadData();
  }
}

// ---------------------------------------------------------------------------
// Public typed getters
// ---------------------------------------------------------------------------

/** Return all validated MemoryEntry items from the mock database. */
export async function getMemoryEntries(): Promise<MemoryEntry[]> {
  await ensureLoaded();
  return cachedMemoryEntries;
}

/** Return all validated EnterpriseEntity items from the mock database. */
export async function getEnterpriseEntities(): Promise<EnterpriseEntity[]> {
  await ensureLoaded();
  return cachedEnterpriseEntities;
}

/** Find a single MemoryEntry by its id. Returns undefined if not found. */
export async function getMemoryById(
  id: string,
): Promise<MemoryEntry | undefined> {
  await ensureLoaded();
  return cachedMemoryEntries.find((entry) => entry.id === id);
}

/** Find a single EnterpriseEntity by its id. Returns undefined if not found. */
export async function getEntityById(
  id: string,
): Promise<EnterpriseEntity | undefined> {
  await ensureLoaded();
  return cachedEnterpriseEntities.find((entity) => entity.id === id);
}

/**
 * Filter enterprise entities by type.
 * e.g. getEntitiesByType('TeamMember') returns all team members.
 */
export async function getEntitiesByType(
  type: EnterpriseEntity['type'],
): Promise<EnterpriseEntity[]> {
  await ensureLoaded();
  return cachedEnterpriseEntities.filter((entity) => entity.type === type);
}
