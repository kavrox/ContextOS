import { askLiveGithubRepo } from './src/agents/retriever/retriever.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("Please set GEMINI_API_KEY in your environment or .env file");
    process.exit(1);
  }
  
  const query = "What is the primary function of this codebase?";
  const repo = "https://github.com/lucide-icons/lucide"; 
  
  console.log(`Starting QA on ${repo}...`);
  console.log(`Question: ${query}`);
  
  const answer = await askLiveGithubRepo(query, repo);
  console.log("\n==================== ANSWER ====================");
  console.log(answer);
  console.log("================================================\n");
}

main().catch(console.error);
