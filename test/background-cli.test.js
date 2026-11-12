import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { makeFixture, unusedPort } from "./background-helpers.js";

const fixture = makeFixture();

test("help describes background launch and explicit focus", async () => {
  const result = await fixture.run(["--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--background/);
  assert.match(result.stdout, /\bfocus\b/);
});

test("background rejects headless and focus combinations before connecting", async () => {
  for (const args of [
    ["--background", "--headless", "open", "about:blank"],
    ["--headless", "--background", "open", "about:blank"],
    ["--background", "focus"],
  ]) {
    const result = await fixture.run(args, { BROWSER_CHROME_PATH: path.join(fixture.home, "must-not-launch") });
    assert.notEqual(result.status, 0, `${args.join(" ")} unexpectedly succeeded`);
    assert.match(result.stderr, /background/i);
    assert.match(result.stderr, /headless|focus|macOS/i);
    assert.doesNotMatch(result.stderr, /ECONNREFUSED|ENOENT|Could not reach/);
  }
});

test("background rejects non-browser commands without changing installed skills or profiles", async () => {
  for (const args of [
    ["--background", "profile", "create", "must-not-create"],
    ["--background", "install", "--skills", "codex"],
    ["--background", "unknown-command"],
  ]) {
    const result = await fixture.run(args);
    assert.notEqual(result.status, 0, `${args.join(" ")} unexpectedly succeeded`);
    assert.match(result.stderr, /background|browser command|Unknown command/i);
  }
  assert.equal(fs.existsSync(path.join(fixture.home, ".br0wser", "profiles", "must-not-create")), false);
  assert.equal(fs.existsSync(path.join(fixture.home, ".codex", "skills", "br0wser")), false);
});

test("background after the command is rejected instead of becoming a command argument", async () => {
  for (const args of [
    ["open", "about:blank", "--background"],
    ["info", "--background"],
    ["goto", "about:blank", "--background"],
    ["focus", "--background"],
    ["profile", "create", "must-not-create", "--background"],
  ]) {
    const result = await fixture.run(args);
    assert.notEqual(result.status, 0, `${args.join(" ")} unexpectedly succeeded`);
    assert.match(result.stderr, /before the command/i);
  }
});

test("background rejects unsupported platforms before launching", { skip: process.platform === "darwin" }, async () => {
  const result = await fixture.run(["--background", "open", "about:blank"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /macOS|darwin/i);
});

test("background rejects a bare executable wrapper without running it", { skip: process.platform !== "darwin" }, async () => {
  const wrapper = path.join(fixture.home, "bare-chrome-wrapper");
  const marker = path.join(fixture.home, "wrapper-was-run");
  fs.writeFileSync(wrapper, `#!/bin/sh\necho unexpected > '${marker}'\n`, { mode: 0o755 });
  const port = await unusedPort();
  const result = await fixture.run(["--background", "--chrome-port", String(port), "--user-data-dir", path.join(fixture.home, "bare-wrapper-profile"), "open", "about:blank"], {
    BROWSER_CHROME_PATH: wrapper,
    BROWSER_ENDPOINT_WAIT_MS: "500",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /app|bundle|Contents\/MacOS|executable layout/i);
  assert.equal(fs.existsSync(marker), false);
});

test("background reports open failures without falling back to the executable", { skip: process.platform !== "darwin" }, async () => {
  const invalidApp = makeFixture();
  const marker = path.join(invalidApp.home, "must-not-run-directly");
  fs.writeFileSync(invalidApp.executable, `#!/bin/sh\necho unexpected > '${marker}'\n`, { mode: 0o755 });
  const infoPath = path.join(path.dirname(invalidApp.executable), "..", "Info.plist");
  fs.writeFileSync(infoPath, fs.readFileSync(infoPath, "utf8").replace("<string>Chromium</string>", "<string>missing-executable</string>"));
  const port = await unusedPort();
  const result = await invalidApp.run(["--background", "--chrome-port", String(port), "open", "about:blank"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /launcher.*code=[1-9]/i);
  assert.match(result.stderr, /kLS|LSOpen|Error Domain|application.*(?:opened|launch)|executable.*missing/i);
  assert.equal(fs.existsSync(marker), false);
});

test("successful open handoff still requires a reachable CDP endpoint", { skip: process.platform !== "darwin" }, async () => {
  const app = makeFixture();
  const marker = path.join(app.home, "launches");
  fs.writeFileSync(app.executable, `#!/bin/sh\necho launch >> '${marker}'\n`, { mode: 0o755 });
  const port = await unusedPort();
  const result = await app.run(["--background", "--chrome-port", String(port), "open", "about:blank"], {
    BROWSER_ENDPOINT_WAIT_MS: "1500",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Could not reach.*endpoint.*1500ms/i);
  assert.doesNotMatch(result.stderr, /launcher exited.*code=0/i);
  assert.equal(fs.readFileSync(marker, "utf8"), "launch\n");
});

test("focus accepts named profile selection and reports a missing profile before connecting", { skip: process.platform !== "darwin" }, async () => {
  const result = await fixture.run(["--profile", "missing", "focus"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing/i);
  assert.match(result.stderr, /profile create missing/);
  assert.doesNotMatch(result.stderr, /supported only on browser commands/);
});
