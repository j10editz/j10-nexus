const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");
const { createServerClient } = require("@supabase/ssr");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:\\Users\\riche\\.gemini\\antigravity-ide\\brain\\9bbba390-0737-4fa7-982f-998dd14d07a5";

const VIEWS = [
  { name: "j10_command_center", path: "/dashboard" },
  { name: "j10_inbox", path: "/dashboard/inbox" },
  { name: "j10_lead_center", path: "/dashboard/crm" },
  { name: "j10_connections", path: "/dashboard/connections" },
  { name: "j10_brand", path: "/dashboard/brand" },
];

const VIEWPORTS = [
  { suffix: "desktop", width: 1440, height: 900, isMobile: false, scale: 1 },
  { suffix: "mobile", width: 390, height: 844, isMobile: true, scale: 2 },
];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAuthCookies() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !anonKey || !secretKey) {
    throw new Error("Missing Supabase credentials in environment");
  }

  const cookiesMap = new Map();
  const ssrClient = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll: () => Array.from(cookiesMap.entries()).map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => cookiesMap.set(name, value)),
    },
  });

  const adminClient = createClient(supabaseUrl, secretKey);
  const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
    type: "magiclink",
    email: "richeder7@gmail.com",
  });

  if (linkErr || !linkData?.properties?.hashed_token) {
    throw new Error("Could not generate auth link: " + (linkErr?.message || "missing hashed token"));
  }

  const { error: verifyErr } = await ssrClient.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });

  if (verifyErr) {
    throw new Error("Could not verify OTP: " + verifyErr.message);
  }

  // Also set the active workspace cookie to J10 NEXUS HQ
  cookiesMap.set("j10_active_workspace_id", "ce593364-2aaf-47e4-a1d2-2272775747c4");

  return Array.from(cookiesMap.entries()).map(([name, value]) => ({
    name,
    value,
    domain: "localhost",
    path: "/",
    httpOnly: false,
    secure: false,
  }));
}

async function run() {
  console.log("Generating authenticated cookies for real workspace...");
  const cookies = await getAuthCookies();
  console.log(`Generated ${cookies.length} auth cookies for workspace.`);

  // Verify Next.js server is up
  let serverUp = false;
  try {
    const res = await fetch("http://localhost:3000");
    serverUp = res.status < 500;
  } catch {}

  let nextProcess = null;
  if (!serverUp) {
    console.log("Starting Next.js production server on port 3000...");
    nextProcess = spawn(process.execPath, [
      path.resolve(__dirname, "../node_modules/next/dist/bin/next"),
      "start",
      "-p",
      "3000",
    ], {
      cwd: path.resolve(__dirname, ".."),
      stdio: "ignore",
    });
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      try {
        const res = await fetch("http://localhost:3000");
        if (res.status < 500) {
          serverUp = true;
          break;
        }
      } catch {}
    }
    if (!serverUp) throw new Error("Next.js server failed to start on port 3000");
  }

  console.log("Launching headless Chrome on port 9222...");
  const chromeProcess = spawn(
    CHROME_PATH,
    [
      "--headless=new",
      "--remote-debugging-port=9222",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-extensions",
      "--hide-scrollbars",
    ],
    {
      detached: false,
      stdio: "ignore",
    }
  );

  try {
    let versionData = null;
    for (let i = 0; i < 25; i++) {
      await sleep(300);
      try {
        const res = await fetch("http://127.0.0.1:9222/json/version");
        if (res.ok) {
          versionData = await res.json();
          break;
        }
      } catch {}
    }

    if (!versionData || !versionData.webSocketDebuggerUrl) {
      throw new Error("Could not connect to Chrome debugging port 9222");
    }

    console.log("Connected to Chrome via CDP:", versionData.Browser);

    const newPageRes = await fetch(
      "http://127.0.0.1:9222/json/new?" + encodeURIComponent("http://localhost:3000/dashboard"),
      { method: "PUT" }
    );
    const pageData = await newPageRes.json();
    const wsUrl = pageData.webSocketDebuggerUrl;

    const ws = new WebSocket(wsUrl);
    let msgId = 1;
    const callbacks = new Map();

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && callbacks.has(msg.id)) {
        callbacks.get(msg.id)(msg);
        callbacks.delete(msg.id);
      }
    };

    await new Promise((resolve) => (ws.onopen = resolve));

    function sendCommand(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = msgId++;
        callbacks.set(id, (res) => {
          if (res.error) reject(new Error(res.error.message));
          else resolve(res.result);
        });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await sendCommand("Page.enable");
    await sendCommand("DOM.enable");
    await sendCommand("Network.enable");

    // Inject authenticated cookies
    for (const c of cookies) {
      await sendCommand("Network.setCookie", {
        name: c.name,
        value: c.value,
        domain: "localhost",
        path: "/",
        httpOnly: false,
        secure: false,
      });
    }

    for (const view of VIEWS) {
      for (const vp of VIEWPORTS) {
        const targetUrl = `http://localhost:3000${view.path}`;
        console.log(`Setting viewport ${vp.suffix} (${vp.width}x${vp.height}) for ${view.name}...`);
        await sendCommand("Emulation.setDeviceMetricsOverride", {
          width: vp.width,
          height: vp.height,
          deviceScaleFactor: vp.scale || 1,
          mobile: Boolean(vp.isMobile),
        });

        console.log(`Navigating to ${targetUrl}...`);
        await sendCommand("Page.navigate", { url: targetUrl });
        await sleep(3500); // Allow render & data fetch to settle

        console.log(`Capturing ${view.name}_${vp.suffix}.png...`);
        const screenshot = await sendCommand("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: false,
        });

        const outPath = path.join(ARTIFACTS_DIR, `${view.name}_${vp.suffix}.png`);
        fs.writeFileSync(outPath, Buffer.from(screenshot.data, "base64"));
        console.log(`Saved screenshot: ${outPath} (${fs.statSync(outPath).size} bytes)`);
      }
    }

    ws.close();
    console.log("All Phase 3A screenshots captured successfully!");
  } finally {
    try {
      chromeProcess.kill();
    } catch {}
    if (nextProcess) {
      try {
        nextProcess.kill();
      } catch {}
    }
  }
}

run().catch((err) => {
  console.error("Screenshot capture failed:", err);
  process.exit(1);
});
