/**
 * ContextOS Live LLM API — Lightweight REST bridge
 * 
 * Runs alongside the NitroStack MCP server on port 3002.
 * Provides a simple POST /api/ask endpoint that the React
 * dashboard calls directly for Live GitHub Repo Q&A.
 */

import * as http from 'http';
import { askLiveGithubRepo } from './agents/retriever/retriever.js';

const PORT = 3002;

const server = http.createServer(async (req, res) => {
  // CORS headers for the React dashboard
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/api/ask') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const { query, repoUrl } = JSON.parse(body);
        if (!query || !repoUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing "query" or "repoUrl" in request body' }));
          return;
        }

        console.log(`[Live API] Query: "${query}" | Repo: ${repoUrl}`);
        const answer = await askLiveGithubRepo(query, repoUrl);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ answer }));
      } catch (err: any) {
        console.error('[Live API] Error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'contextos-live-api' }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`🚀 ContextOS Live LLM API running on http://localhost:${PORT}`);
});
