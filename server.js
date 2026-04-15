const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = 3456;
const HTML_PATH = path.join(__dirname, 'index.html');

// === Simple HTTP Server ===
const server = http.createServer((req, res) => {
  // CORS headers for safety
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  // Serve the UI
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    try {
      const html = fs.readFileSync(HTML_PATH, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (e) {
      res.writeHead(500); res.end('Failed to load UI');
    }
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
    return;
  }

  // Chat endpoint - streams response
  if (req.method === 'POST' && req.url === '/chat') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { message, conversationId } = JSON.parse(body);
        if (!message || !message.trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'メッセージが空です' }));
          return;
        }

        // Set SSE headers for streaming
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });

        // Spawn claude CLI with --print flag for non-interactive output
        // Use --continue to maintain conversation context if conversationId provided
        const args = ['--print'];
        if (conversationId) {
          args.push('--continue', conversationId);
        }
        args.push(message);

        const claude = spawn('claude', args, {
          cwd: 'C:\\Users\\studi\\Desktop\\projects',
          shell: true,
          env: { ...process.env, FORCE_COLOR: '0' }
        });

        let fullResponse = '';
        let newConversationId = conversationId || null;

        claude.stdout.on('data', (data) => {
          const text = data.toString();
          fullResponse += text;
          // Send as SSE
          res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
        });

        claude.stderr.on('data', (data) => {
          const text = data.toString();
          // Try to extract conversation ID from stderr
          const idMatch = text.match(/Session:\s*([a-f0-9-]+)/i) || text.match(/session_id['":\s]+([a-f0-9-]+)/i);
          if (idMatch) newConversationId = idMatch[1];
        });

        claude.on('close', (code) => {
          res.write(`data: ${JSON.stringify({ type: 'done', conversationId: newConversationId })}\n\n`);
          res.end();
        });

        claude.on('error', (err) => {
          res.write(`data: ${JSON.stringify({ type: 'error', content: 'Claude起動エラー: ' + err.message })}\n\n`);
          res.end();
        });

        // Handle client disconnect
        req.on('close', () => {
          try { claude.kill('SIGTERM'); } catch (e) {}
        });

        // Timeout after 5 minutes
        setTimeout(() => {
          try { claude.kill('SIGTERM'); } catch (e) {}
          try {
            res.write(`data: ${JSON.stringify({ type: 'error', content: 'タイムアウト（5分）' })}\n\n`);
            res.end();
          } catch (e) {}
        }, 300000);

      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'リクエスト解析エラー: ' + e.message }));
      }
    });
    return;
  }

  // 404
  res.writeHead(404); res.end('Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ Claude Mobile Server running on http://0.0.0.0:${PORT}`);
  console.log(`  Local:     http://localhost:${PORT}`);
  console.log(`  Tailscale: http://100.79.34.10:${PORT}`);
  console.log(`  Phone:     http://100.79.34.10:${PORT} (via Tailscale)`);
  console.log('');
  console.log('Press Ctrl+C to stop');
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`ポート ${PORT} は既に使用中です。別のポートを試してください。`);
  } else {
    console.error('サーバーエラー:', e.message);
  }
  process.exit(1);
});
