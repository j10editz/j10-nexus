const { spawn } = require("node:child_process");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const TARGET_URL = "http://localhost:3000/dashboard?demo=true";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("Launching Chrome...");
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

    if (!versionData) throw new Error("Could not connect to Chrome on 9222");

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
    await sendCommand("Runtime.enable");

    for (const width of [2048, 1920, 1440]) {
      console.log(`\n=================== VIEWPORT: ${width}px ===================`);
      await sendCommand("Emulation.setDeviceMetricsOverride", {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: false,
      });

      await sendCommand("Page.navigate", { url: TARGET_URL });
      await sleep(2000);

      const evalRes = await sendCommand("Runtime.evaluate", {
        expression: `(() => {
          const sidebar = document.querySelector('aside') || document.querySelector('div.fixed.inset-y-0');
          const layoutWrapper = document.querySelector('div.lg\\\\:pl-\\\\[260px\\\\]') || document.querySelector('main')?.parentElement;
          const main = document.querySelector('main');
          const header = document.querySelector('header');
          const rccRoot = document.querySelector('main > div');
          const rccInner = document.querySelector('main > div > div.mx-auto') || document.querySelector('main > div > div');
          const headerInRcc = document.querySelector('main header');
          const cardsGrid = document.querySelector('main div.grid');

          const elements = [
            { name: 'Sidebar', el: sidebar },
            { name: 'Layout Wrapper (lg:pl-[260px])', el: layoutWrapper },
            { name: 'Header (Topbar)', el: header },
            { name: 'Main', el: main },
            { name: 'RCC Root', el: rccRoot },
            { name: 'RCC Inner Container', el: rccInner },
            { name: 'Header in RCC', el: headerInRcc },
            { name: 'Cards Grid in RCC', el: cardsGrid },
          ];

          return elements.map(item => {
            if (!item.el) return { name: item.name, missing: true };
            const rect = item.el.getBoundingClientRect();
            const style = window.getComputedStyle(item.el);
            return {
              name: item.name,
              classes: item.el.className,
              rect: {
                left: Math.round(rect.left),
                right: Math.round(rect.right),
                width: Math.round(rect.width),
                x: Math.round(rect.x),
              },
              computed: {
                maxWidth: style.maxWidth,
                width: style.width,
                marginLeft: style.marginLeft,
                marginRight: style.marginRight,
                paddingLeft: style.paddingLeft,
                paddingRight: style.paddingRight,
              }
            };
          });
        })()`,
        returnByValue: true,
      });

      console.log(JSON.stringify(evalRes.result.value, null, 2));
    }

    ws.close();
  } finally {
    try {
      chromeProcess.kill();
    } catch {}
  }
}

run().catch(console.error);

