import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(packageRoot, "scripts", "br0wser.js");
export const chromePath = process.env.BROWSER_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const unsupportedReason = process.platform !== "darwin"
  ? "Background browser integration requires macOS"
  : !fs.existsSync(chromePath) ? `Chrome not found at ${chromePath}` : false;
export const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export const listen = async (server) => {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server.address().port;
};

export const unusedPort = async () => {
  const server = net.createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
};

export const makeFixture = (appName = "Chromium") => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "br0wser-background-"));
  const contents = path.join(home, `${appName}.app`, "Contents");
  const executable = path.join(contents, "MacOS", appName);
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.writeFileSync(path.join(contents, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>${appName}</string>
<key>CFBundleIdentifier</key><string>dev.br0wser.background-test.${path.basename(home)}</string>
<key>CFBundleName</key><string>${appName}</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
`);
  const quotedChrome = `'${chromePath.replaceAll("'", "'\\''")}'`;
  // Keep Chrome away from the user's keychain when HOME points at the fixture
  fs.writeFileSync(executable, `#!/bin/sh\nexec ${quotedChrome} --use-mock-keychain --no-first-run --no-default-browser-check "$@"\n`, { mode: 0o755 });
  return {
    home,
    executable,
    run: async (args, env = {}) => {
      try {
        const result = await execFileAsync(process.execPath, [cliPath, ...args], {
          cwd: packageRoot,
          encoding: "utf8",
          timeout: 30000,
          env: {
            ...process.env,
            HOME: home,
            CODEX_HOME: path.join(home, ".codex"),
            BROWSER_CHROME_PATH: executable,
            BROWSER_ENDPOINT_WAIT_MS: "10000",
            BROWSER_ACTION_TIMEOUT_MS: "10000",
            CDP_ENDPOINT: "",
            CDP_CHROME_PORT: "",
            CDP_PAGE_URL: "",
            CDP_USER_DATA_DIR: "",
            ...env,
          },
        });
        return { status: 0, ...result };
      } catch (error) {
        return { status: error.code ?? 1, stdout: error.stdout || "", stderr: error.stderr || error.message };
      }
    },
  };
};

export const runOk = async (fixture, args) => {
  const result = await fixture.run(args);
  assert.equal(result.status, 0, `${args.join(" ")}\n${result.stderr}`);
  return result;
};

export const getTargets = async (browser) => {
  const session = await browser.newBrowserCDPSession();
  try {
    const { targetInfos } = await session.send("Target.getTargets");
    return targetInfos.filter((target) => target.type === "page")
      .map(({ targetId, url }) => ({ targetId, url }))
      .sort((left, right) => left.targetId.localeCompare(right.targetId));
  } finally {
    await session.detach();
  }
};

export const getBrowserPid = async (browser) => {
  const session = await browser.newBrowserCDPSession();
  try {
    const { processInfo } = await session.send("SystemInfo.getProcessInfo");
    return processInfo.find((info) => info.type === "browser").id;
  } finally {
    await session.detach();
  }
};

export const closeOwnedBrowser = async (endpoint, directory) => {
  let browser;
  try {
    browser = await chromium.connectOverCDP(endpoint, { timeout: 3000 });
  } catch (error) {
    if (/ECONNREFUSED/.test(error.message)) return;
    throw error;
  }
  try {
    const lock = fs.readlinkSync(path.join(directory, "SingletonLock"));
    const ownerPid = Number(lock.slice(lock.lastIndexOf("-") + 1));
    assert.equal(await getBrowserPid(browser), ownerPid, "Refusing to close a browser outside the test profile");
    const session = await browser.newBrowserCDPSession();
    await session.send("Browser.close");
  } finally {
    await browser.close();
  }
};

export const frontmostApplication = async () => {
  const result = await execFileAsync("/usr/bin/osascript", ["-l", "JavaScript", "-e", `
ObjC.import("AppKit");
const app = $.NSWorkspace.sharedWorkspace.frontmostApplication;
JSON.stringify({ pid: Number(app.processIdentifier), name: ObjC.unwrap(app.localizedName) });
`]);
  return JSON.parse(result.stdout);
};

export const requireInteractiveDesktop = async () => {
  const original = await frontmostApplication();
  assert.notEqual(original.name, "loginwindow", "Real foreground checks require an unlocked macOS desktop");
  return original;
};

export const activateApplication = async (pid) => {
  await execFileAsync("/usr/bin/osascript", ["-l", "JavaScript", "-e", `
ObjC.import("AppKit");
function run(argv) {
  const app = $.NSRunningApplication.runningApplicationWithProcessIdentifier(Number(argv[0]));
  if (!app.activateWithOptions(2)) throw new Error("Could not activate application " + argv[0]);
}
`, String(pid)]);
  await waitForFrontmost(pid);
};

export const waitForFrontmost = async (pid) => {
  const deadline = Date.now() + 5000;
  let current;
  do {
    current = await frontmostApplication();
    if (current.pid === pid) return;
    await delay(50);
  } while (Date.now() < deadline);
  assert.equal(current.pid, pid, `Expected pid ${pid} in front, found ${current.name} (pid ${current.pid})`);
};

export const withFrontmost = async (application, action) => {
  await activateApplication(application.pid);
  const observed = [];
  let finished = false;
  const monitor = (async () => {
    while (!finished) {
      observed.push(await frontmostApplication());
      await delay(50);
    }
  })();
  let result;
  try {
    result = await action();
    await delay(100);
  } finally {
    finished = true;
    await monitor;
  }
  assert.ok(observed.length > 0);
  assert.deepEqual([...new Set(observed.map((app) => app.pid))], [application.pid],
    `Background work changed the frontmost application: ${JSON.stringify(observed)}`);
  return result;
};

// Delay the requested target until a competing blank page reaches the CLI
export const createTargetRaceProxy = async (browser, endpoint) => {
  const version = await new Promise((resolve, reject) => {
    http.get(`${endpoint}/json/version`, (response) => {
      let body = "";
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve(JSON.parse(body)));
    }).on("error", reject);
  });
  const upstreamUrl = new URL(version.webSocketDebuggerUrl);
  const control = await browser.newBrowserCDPSession();
  const sockets = new Set();
  const errors = [];
  let competitorId;
  const server = http.createServer((_request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ ...version, webSocketDebuggerUrl: `ws://127.0.0.1:${server.address().port}${upstreamUrl.pathname}` }));
  });
  server.on("upgrade", (request, client, head) => {
    const upstream = net.createConnection({ host: upstreamUrl.hostname, port: Number(upstreamUrl.port) });
    for (const socket of [client, upstream]) {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      socket.on("error", (error) => errors.push(error));
    }
    upstream.on("connect", () => {
      const headers = Object.entries(request.headers).filter(([key]) => key !== "sec-websocket-extensions");
      upstream.write(`${request.method} ${upstreamUrl.pathname} HTTP/1.1\r\n${headers.map(([key, value]) => `${key}: ${value}`).join("\r\n")}\r\n\r\n`);
    });
    upstream.pipe(client);
    client.on("end", () => upstream.end());
    let pending = Buffer.alloc(0);
    let queue = Promise.resolve();
    const receive = (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= 2) {
        let length = pending[1] & 127;
        let offset = 2;
        if (length === 126) {
          if (pending.length < 4) return;
          length = pending.readUInt16BE(2);
          offset = 4;
        } else if (length === 127) {
          if (pending.length < 10) return;
          length = Number(pending.readBigUInt64BE(2));
          offset = 10;
        }
        const masked = Boolean(pending[1] & 128);
        const payloadOffset = offset + (masked ? 4 : 0);
        if (pending.length < payloadOffset + length) return;
        const frame = pending.subarray(0, payloadOffset + length);
        pending = pending.subarray(frame.length);
        queue = queue.then(async () => {
          if ((frame[0] & 15) === 1) {
            const payload = Buffer.from(frame.subarray(payloadOffset));
            if (masked) {
              for (let index = 0; index < payload.length; index += 1) payload[index] ^= frame[offset + index % 4];
            }
            const message = JSON.parse(payload.toString());
            if (message.method === "Target.createTarget" && !competitorId) {
              const target = await control.send("Target.createTarget", { url: "about:blank", background: true, newWindow: true });
              competitorId = target.targetId;
              await delay(150);
            }
          }
          upstream.write(frame);
        }).catch((error) => {
          errors.push(error);
          client.destroy();
          upstream.destroy();
        });
      }
    };
    client.on("data", receive);
    if (head.length > 0) receive(head);
  });
  const port = await listen(server);
  return {
    endpoint: `http://127.0.0.1:${port}`,
    get competitorId() { return competitorId; },
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
      await control.detach();
      assert.deepEqual(errors, []);
    },
  };
};
