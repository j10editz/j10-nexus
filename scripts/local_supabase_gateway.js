const http = require("http");
const httpProxy = require("http");

const GATEWAY_PORT = 54320;
const REST_TARGET = { host: "localhost", port: 54321 };
const REALTIME_TARGET = { host: "localhost", port: 54323 };

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  let targetUrl = req.url;
  let targetPort = REST_TARGET.port;

  // Rewrite /rest/v1/foo -> /foo for standalone PostgREST
  if (req.url.startsWith("/rest/v1")) {
    targetUrl = req.url.replace(/^\/rest\/v1/, "") || "/";
  } else if (req.url.startsWith("/realtime/v1")) {
    targetPort = REALTIME_TARGET.port;
  }

  const proxyReq = http.request(
    {
      host: "localhost",
      port: targetPort,
      path: targetUrl,
      method: req.method,
      headers: req.headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    }
  );

  proxyReq.on("error", (err) => {
    console.error("Gateway proxy error:", err.message);
    res.writeHead(502);
    res.end(JSON.stringify({ error: "Gateway error", message: err.message }));
  });

  req.pipe(proxyReq, { end: true });
});

// Proxy WebSocket upgrade for Realtime
server.on("upgrade", (req, socket, head) => {
  let targetPath = req.url;
  // Supabase client uses /realtime/v1/websocket -> rewrite to /socket/websocket
  if (req.url.startsWith("/realtime/v1/websocket")) {
    targetPath = req.url.replace("/realtime/v1/websocket", "/socket/websocket");
  } else if (req.url.startsWith("/socket")) {
    targetPath = req.url;
  }

  const net = require("net");
  const proxySocket = net.connect(REALTIME_TARGET.port, REALTIME_TARGET.host, () => {
    let headers = `${req.method} ${targetPath} HTTP/1.1\r\n`;
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      headers += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
    }
    headers += "\r\n";
    proxySocket.write(headers);
    if (head && head.length) proxySocket.write(head);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });

  socket.on("error", (err) => {
    proxySocket.destroy();
  });

  proxySocket.on("error", (err) => {
    socket.destroy();
  });
});

server.listen(GATEWAY_PORT, () => {
  console.log(`Local Supabase API Gateway listening on http://localhost:${GATEWAY_PORT}`);
});
