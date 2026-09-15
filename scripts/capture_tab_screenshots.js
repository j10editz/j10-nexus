const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:\\Users\\riche\\.gemini\\antigravity-ide\\brain\\97987ca0-c545-4ffc-9c54-c026a39ad150";

const VIEWS_TO_CAPTURE = [
  { name: "revenue_tab_1440px", url: "http://localhost:3000/dashboard?demo=true&view=revenue" },
  { name: "funnel_tab_1440px", url: "http://localhost:3000/dashboard?demo=true&view=funnel" },
  { name: "leads_tab_1440px", url: "http://localhost:3000/dashboard?demo=true&view=leads" },
  { name: "conversations_tab_1440px", url: "http://localhost:3000/dashboard?demo=true&view=conversations" },
  { name: "operations_tab_1440px", url: "http://localhost:3000/dashboard?demo=true&view=operations" },
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

    const newPageRes = await fetch("http://127.0.0.1:9222/json/new?" + encodeURIComponent("http://localhost:3000/dashboard?demo=true"), { method: "PUT" });
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

    await sendCommand("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });

    for (const item of VIEWS_TO_CAPTURE) {
      console.log(`Navigating to ${item.url}...`);
      await sendCommand("Page.navigate", { url: item.url });
      await sleep(1800);

      const shotResult = await sendCommand("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      });

      const buffer = Buffer.from(shotResult.data, "base64");
      const outPath = path.join(ARTIFACTS_DIR, `${item.name}.png`);
      fs.writeFileSync(outPath, buffer);
      console.log(`Saved screenshot: ${outPath} (${buffer.length} bytes)`);
    }

    // Now test opening the Drawer by clicking on the first lead or Ask J10 AI
    console.log("Testing Ask J10 AI Drawer...");
    await sendCommand("Runtime.evaluate", {
      expression: `document.getElementById('btn-ask-j10-ai')?.click();`,
    });
    await sleep(800);
    const drawerShot = await sendCommand("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    const drawerBuffer = Buffer.from(drawerShot.data, "base64");
    const drawerPath = path.join(ARTIFACTS_DIR, "drawer_ai_assistant_1440px.png");
    fs.writeFileSync(drawerPath, drawerBuffer);
    console.log(`Saved screenshot: ${drawerPath} (${drawerBuffer.length} bytes)`);

    console.log("All tab screenshots captured successfully!");
    ws.close();
  } finally {
    try {
      chromeProcess.kill();
    } catch {}
  }
}

run().catch((err) => {
  console.error("Capture failed:", err);
  process.exit(1);
});
