const { RealtimeClient } = require("@supabase/realtime-js");
const crypto = require("crypto");

function signJwt(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

const JWT_SECRET = "37c304f85e132065da818625621445c5b5f029e768373b5224e2a08c071a610f";

async function testConnection() {
  console.log("Testing Realtime WebSocket connection...");
  const token = signJwt(
    {
      role: "authenticated",
      sub: "user-tenant-1",
      iss: "supabase",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    JWT_SECRET
  );

  const client = new RealtimeClient("ws://localhost:54323/socket", {
    params: {
      apikey: token,
      log_level: "info",
    },
  });

  client.connect();

  const channel = client.channel("test-room");
  
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.disconnect();
      reject(new Error("Timeout waiting for subscription"));
    }, 5000);

    channel.subscribe((status, err) => {
      console.log("Realtime Channel Status:", status, err ? JSON.stringify(err) : "");
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        console.log("SUCCESS: Connected and Subscribed to Realtime WebSocket!");
        client.disconnect();
        resolve(true);
      } else if (status === "CHANNEL_ERROR") {
        clearTimeout(timeout);
        client.disconnect();
        reject(new Error("Channel error received"));
      }
    });
  });
}

testConnection()
  .then(() => {
    console.log("Realtime connection test passed!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  });
