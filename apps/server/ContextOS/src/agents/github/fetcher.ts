import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import ignore from 'ignore';

const execAsync = promisify(exec);

async function readFilesRecursive(dir: string, ig: ReturnType<typeof ignore>, baseDir: string): Promise<string> {
  let context = '';
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath);

    // Skip hidden files/dirs like .git
    if (entry.name.startsWith('.')) continue;
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') continue;

    if (ig.ignores(relPath)) continue;

    if (entry.isDirectory()) {
      context += await readFilesRecursive(fullPath, ig, baseDir);
    } else {
      // Basic text file check (skip binaries/images)
      const ext = path.extname(entry.name).toLowerCase();
      const binaryExts = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip', '.tar', '.gz', '.mp4'];
      if (binaryExts.includes(ext)) continue;

      try {
        const stat = await fs.promises.stat(fullPath);
        if (stat.size > 1000000) continue; // Skip files > 1MB

        const content = await fs.promises.readFile(fullPath, 'utf-8');
        context += `\n\n--- FILE: ${relPath} ---\n`;
        context += content;
      } catch (e) {
        console.warn(`Could not read ${fullPath}`);
      }
    }
  }
  return context;
}

export async function fetchAndBundleRepo(repoUrl: string): Promise<string> {
  // Extract owner/repo to build clone URL
  let sanitizedUrl = repoUrl.trim();
  if (!sanitizedUrl.startsWith('http')) {
    sanitizedUrl = `https://github.com/${sanitizedUrl}`;
  }
  if (sanitizedUrl.endsWith('.git')) {
    sanitizedUrl = sanitizedUrl.slice(0, -4);
  }

  // Prevent basic command injection
  if (!sanitizedUrl.match(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/)) {
    throw new Error('Invalid GitHub repository URL. Must be in the format https://github.com/owner/repo or owner/repo');
  }

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'repo-'));
  
  try {
    console.log(`Cloning ${sanitizedUrl} to ${tempDir}...`);
    await execAsync(`git clone --depth 1 ${sanitizedUrl}.git "${tempDir}"`);

    const ig = ignore();
    // Try to load .gitignore
    const gitignorePath = path.join(tempDir, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = await fs.promises.readFile(gitignorePath, 'utf-8');
      ig.add(gitignoreContent);
    }
    
    // Always ignore common bloated directories
    ig.add(['node_modules/', 'dist/', 'build/', 'coverage/', '.git/']);

    console.log(`Reading codebase files...`);
    const bundledContext = await readFilesRecursive(tempDir, ig, tempDir);
    return bundledContext;
  } finally {
    // Cleanup
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(console.error);
  }
}
