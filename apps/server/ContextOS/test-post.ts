import * as http from 'http';

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

const postReq = http.request('http://localhost:3001/mcp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': postData.length
  }
}, (postRes) => {
  console.log("STATUS:", postRes.statusCode);
  console.log("HEADERS:", postRes.headers);
  postRes.on('data', (c) => console.log("DATA:", c.toString()));
});
postReq.write(postData);
postReq.end();
