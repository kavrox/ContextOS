import { mcpAskLiveGithubRepo } from './src/utils/mcpClient.js';

async function test() {
  try {
    const result = await mcpAskLiveGithubRepo('test', 'https://github.com/lucide-icons/lucide');
    console.log("RESULT:", JSON.stringify(result, null, 2));
    console.log("ANSWER:", result.answer);
  } catch (e) {
    console.error("ERROR:", e);
  }
}
test();
