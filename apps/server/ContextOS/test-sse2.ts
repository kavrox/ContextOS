import * as http from 'http';

const req = http.request('http://127.0.0.1:3001/mcp', {
  method: 'GET',
  headers: { 'Accept': 'text/event-stream' }
}, (res) => {
  res.on('data', (chunk) => {
    const data = chunk.toString();
    console.log("SSE CHUNK:", data);
    
    if (data.includes('endpoint')) {
      // Parse endpoint manually
      const match = data.match(/data:\s*(.+)/);
      if (match) {
        const postUrl = new URL(match[1], 'http://127.0.0.1:3001').toString();
        console.log("POST URL:", postUrl);
        
        const postData = JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'ask_live_github_repo',
            arguments: {
              query: 'test',
              repoUrl: 'https://github.com/lucide-icons/lucide'
            }
          }
        });
        
        const postReq = http.request(postUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': postData.length
          }
        }, (postRes) => {
          postRes.on('data', (c) => console.log("POST RES:", c.toString()));
        });
        postReq.write(postData);
        postReq.end();
      }
    }
  });
});
req.end();
