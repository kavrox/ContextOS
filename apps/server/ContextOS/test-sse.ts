import EventSource from 'eventsource';

async function main() {
  console.log("Connecting to SSE...");
  const es = new EventSource('http://localhost:3001/mcp');

  let postUrl = '';

  es.addEventListener('endpoint', async (e: any) => {
    postUrl = new URL(e.data, 'http://localhost:3001').toString();
    console.log("Endpoint event received. POST URL:", postUrl);

    console.log("Making POST request...");
    const res = await fetch(postUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'get_all_tasks',
          arguments: {}
        }
      })
    });
    console.log("POST Response status:", res.status, await res.text());
  });

  es.addEventListener('message', (e: any) => {
    console.log("MESSAGE EVENT:", e.data);
  });
  
  es.on('error', (e) => {
    console.error("SSE Error", e);
  });
}
main().catch(console.error);
