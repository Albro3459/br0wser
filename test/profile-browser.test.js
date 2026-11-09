import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import net from "node:net";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(packageRoot, "scripts", "br0wser.js");
const home = fs.mkdtempSync(path.join(os.tmpdir(), "br0wser-profile-browser-home-"));
const profileRoot = path.join(home, ".br0wser", "profiles");
const chromePath = process.env.BROWSER_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const execFileAsync = promisify(execFile);

// With HOME redirected, Chrome finds no login keychain and macOS offers to reset it
const chromeLauncher = path.join(home, "chrome-mock-keychain");
fs.writeFileSync(chromeLauncher, `#!/bin/sh\nexec "${chromePath}" --use-mock-keychain "$@"\n`, { mode: 0o755 });

const runCli = async (args, env = {}) => {
  try {
    const result = await execFileAsync(process.execPath, [cliPath, ...args], {
      cwd: packageRoot,
      encoding: "utf8",
      timeout: 20000,
      env: {
        ...process.env,
        HOME: home,
        BROWSER_CHROME_PATH: chromeLauncher,
        CDP_ENDPOINT: "",
        CDP_CHROME_PORT: "",
        CDP_PAGE_URL: "",
        CDP_USER_DATA_DIR: "",
        ...env,
      },
    });
    return { status: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return { status: error.code ?? 1, stdout: error.stdout || "", stderr: error.stderr || error.message };
  }
};

const getUnusedPort = async () => {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
};

const getTargets = async (browser) => {
  const session = await browser.newBrowserCDPSession();
  try {
    const { targetInfos } = await session.send("Target.getTargets");
    return targetInfos.filter((target) => target.type === "page")
      .map(({ targetId, url }) => ({ targetId, url }))
      .sort((a, b) => a.targetId.localeCompare(b.targetId));
  } finally {
    await session.detach();
  }
};

const unsupportedReason = process.platform !== "darwin"
  ? "Named profile browser integration is currently supported only on macOS"
  : !fs.existsSync(chromePath)
    ? `Chrome not found at ${chromePath}`
    : null;

test("named profiles launch, verify, reconnect, and reject a mismatched session", { skip: unsupportedReason || false }, async (t) => {
  const created = await runCli(["profile", "create", "primary"]);
  assert.equal(created.status, 0, created.stderr);
  const profileDir = path.join(profileRoot, "primary");
  const port = await getUnusedPort();
  t.after(async () => {
    try {
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 3000 });
      const session = await browser.newBrowserCDPSession();
      try {
        await session.send("Browser.close");
      } finally {
        await session.detach();
        await browser.close();
      }
    } catch {}
  });

  const opened = await runCli(["--profile", "primary", "--chrome-port", String(port), "open", "about:blank"]);
  assert.equal(opened.status, 0, opened.stderr);
  assert.match(opened.stdout, /profile=primary/);
  assert.ok(opened.stdout.includes(profileDir));

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const baseline = await getTargets(browser);
  assert.equal(baseline.length, 1);
  assert.equal(baseline[0].url, "about:blank");
  await browser.close();

  const evalResult = await runCli(["--profile", "primary", "--chrome-port", String(port), "eval", "location.href"]);
  assert.equal(evalResult.status, 0, evalResult.stderr);
  assert.equal(evalResult.stdout.trim(), '"about:blank"');

  const info = await runCli(["--profile", "primary", "--chrome-port", String(port), "info"]);
  assert.equal(info.status, 0, info.stderr);
  assert.match(info.stdout, /pages=1/);
  assert.equal(info.stdout.includes("chrome://version"), false);
  const legacy = await runCli(["--chrome-port", String(port), "eval", "location.href"]);
  assert.equal(legacy.status, 0, legacy.stderr);
  assert.equal(legacy.stdout.trim(), '"about:blank"');

  const afterReconnect = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  assert.deepEqual(await getTargets(afterReconnect), baseline);
  await afterReconnect.close();

  const wrongCreated = await runCli(["profile", "create", "wrong"]);
  assert.equal(wrongCreated.status, 0, wrongCreated.stderr);
  const wrongProfile = await runCli(["--profile", "wrong", "--chrome-port", String(port), "open", "https://example.invalid/should-not-open"]);
  assert.notEqual(wrongProfile.status, 0);
  assert.match(wrongProfile.stderr, /mismatch|profile/i);
  const wrongEval = await runCli(["--profile", "wrong", "--chrome-port", String(port), "eval", "document.title = 'must-not-run'"]);
  assert.notEqual(wrongEval.status, 0);
  assert.match(wrongEval.stderr, /mismatch/i);
  const stillRunning = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  assert.deepEqual(await getTargets(stillRunning), baseline);
  assert.notEqual(await stillRunning.contexts()[0].pages()[0].title(), "must-not-run");
  await stillRunning.close();

  const secondPort = await getUnusedPort();
  const conflict = await runCli(["--profile", "primary", "--chrome-port", String(secondPort), "open", "https://example.invalid/should-not-forward"]);
  assert.notEqual(conflict.status, 0);
  assert.match(conflict.stderr, /singleton|already|in use|active/i);
  assert.equal(await new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: secondPort });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
  }), false);
});

test("named open refuses an occupied non-CDP port", { skip: unsupportedReason || false }, async (t) => {
  const created = await runCli(["profile", "create", "occupied-port"]);
  assert.equal(created.status, 0, created.stderr);
  const server = http.createServer((_request, response) => response.end("not CDP"));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  const result = await runCli(["--profile", "occupied-port", "--chrome-port", String(port), "open", "about:blank"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /occupied|CDP|endpoint/i);
  for (const name of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
    assert.throws(() => fs.lstatSync(path.join(profileRoot, "occupied-port", name)), { code: "ENOENT" });
  }
});

test("named profile storage survives a browser restart", { skip: unsupportedReason || false }, async (t) => {
  const server = http.createServer((_request, response) => response.end("<title>profile persistence</title>"));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const port = await getUnusedPort();
  const endpoint = `http://127.0.0.1:${port}`;
  const directory = path.join(profileRoot, "persistent");
  const closeBrowser = async () => {
    const browser = await chromium.connectOverCDP(endpoint, { timeout: 3000 });
    try {
      const session = await browser.newBrowserCDPSession();
      await session.send("Browser.close");
    } finally {
      await browser.close();
    }
    const deadline = Date.now() + 5000;
    while (["SingletonLock", "SingletonSocket", "SingletonCookie"].some((name) => {
      try { fs.lstatSync(path.join(directory, name)); return true; }
      catch (error) { if (error.code === "ENOENT") return false; throw error; }
    })) {
      if (Date.now() > deadline) throw new Error("Owned browser did not release its profile");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };
  let running = false;
  t.after(async () => {
    try { if (running) await closeBrowser(); }
    finally { await new Promise((resolve) => server.close(resolve)); }
  });

  const created = await runCli(["profile", "create", "persistent"]);
  assert.equal(created.status, 0, created.stderr);
  const opened = await runCli(["--profile", "persistent", "--chrome-port", String(port), "open", url]);
  running = true;
  assert.equal(opened.status, 0, opened.stderr);
  const saved = await runCli(["--profile", "persistent", "--chrome-port", String(port), "eval", "localStorage.setItem('br0wser-check', 'retained'); true"]);
  assert.equal(saved.status, 0, saved.stderr);
  await closeBrowser();
  running = false;

  const reopened = await runCli(["--profile", "persistent", "--chrome-port", String(port), "open", url]);
  running = true;
  assert.equal(reopened.status, 0, reopened.stderr);
  const restored = await runCli(["--profile", "persistent", "--chrome-port", String(port), "eval", "localStorage.getItem('br0wser-check')"]);
  assert.equal(restored.status, 0, restored.stderr);
  assert.equal(JSON.parse(restored.stdout), "retained");
});
