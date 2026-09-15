const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:\\Users\\riche\\.gemini\\antigravity-ide\\brain\\97987ca0-c545-4ffc-9c54-c026a39ad150";
const TARGET_URL = "http://localhost:3000/dashboard?demo=true";

const VIEWPORTS = [
  { name: "1440px", width: 1440, height: 1100, isMobile: false },
  { name: "1024px", width: 1024, height: 1000, isMobile: false },
  { name: "768px", width: 768, height: 1200, isMobile: false },
  { name: "390px", width: 390, height: 1200, isMobile: true, deviceScaleFactor: 2 },
];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("Launching headless Chrome on port 9222...");
  const chromeProcess = spawn(CHROME_PATH, [
    "--headless=new",
    "--remote-debugging-port=9222",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-extensions",
    "--hide-scrollbars",
  ], {
    detached: false,
    stdio: "ignore",
  });

  try {
    let versionData = null;
    for (let i = 0; i < 20; i++) {
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
      throw new Error("Could not connect to Chrome remote debugging port 9222");
    }

    console.log("Connected to Chrome via CDP:", versionData.Browser);

    // Create a new target/page
    const newPageRes = await fetch("http://127.0.0.1:9222/json/new?" + encodeURIComponent(TARGET_URL), { method: "PUT" });
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

    await new Promise((resolve) => ws.onopen = resolve);

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
    await sendCommand("CSS.enable");

    for (const vp of VIEWPORTS) {
      console.log(`Setting viewport: ${vp.name} (${vp.width}x${vp.height})...`);
      await sendCommand("Emulation.setDeviceMetricsOverride", {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: vp.deviceScaleFactor || 1,
        mobile: Boolean(vp.isMobile),
      });

      console.log(`Navigating to ${TARGET_URL}...`);
      await sendCommand("Page.navigate", { url: TARGET_URL });
      await sleep(2500); // Wait for React hydration and chart rendering

      console.log(`Capturing screenshot for ${vp.name}...`);
      const screenshot = await sendCommand("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      });

      const outPath = path.join(ARTIFACTS_DIR, `revenue_command_${vp.name}.png`);
      fs.writeFileSync(outPath, Buffer.from(screenshot.data, "base64"));
      console.log(`Saved screenshot: ${outPath} (${fs.statSync(outPath).size} bytes)`);
    }

    ws.close();
    console.log("All screenshots captured successfully!");
  } finally {
    try {
      chromeProcess.kill();
    } catch {}
  }
}

run().catch((err) => {
  console.error("Screenshot capture failed:", err);
  process.exit(1);
});
