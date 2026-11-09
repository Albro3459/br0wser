import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(packageRoot, "scripts", "br0wser.js");
const home = fs.mkdtempSync(path.join(os.tmpdir(), "br0wser-profile-cli-home-"));
const profileRoot = path.join(home, ".br0wser", "profiles");
const supported = process.platform === "darwin";

const runCli = (args, env = {}) => spawnSync(process.execPath, [cliPath, ...args], {
  cwd: packageRoot,
  encoding: "utf8",
  timeout: 10000,
  env: { ...process.env, HOME: home, CDP_ENDPOINT: "", CDP_CHROME_PORT: "", CDP_PAGE_URL: "", CDP_USER_DATA_DIR: "", ...env },
});

test("named profile setup honors platform support and validates names", () => {
  if (!supported) {
    const unsupported = runCli(["profile", "create", "unsupported"]);
    assert.notEqual(unsupported.status, 0);
    assert.match(unsupported.stderr, /require macOS/);
    assert.equal(fs.existsSync(profileRoot), false);
    return;
  }
  const create = runCli(["profile", "create", "fantasy-football_2026"]);
  assert.equal(create.status, 0, create.stderr);
  const expected = path.join(profileRoot, "fantasy-football_2026");
  assert.ok(fs.statSync(expected).isDirectory());
  assert.match(create.stdout, /profile=fantasy-football_2026/);
  assert.ok(create.stdout.includes(expected));
  assert.equal(fs.statSync(profileRoot).mode & 0o777, 0o700);

  const secondCreate = runCli(["profile", "create", "fantasy-football_2026"]);
  assert.equal(secondCreate.status, 0, secondCreate.stderr);

  for (const name of ["../escape", "Upper", "-leading", "two words"]) {
    const invalid = runCli(["profile", "create", name]);
    assert.notEqual(invalid.status, 0, `accepted invalid profile name: ${name}`);
  }
  assert.equal(fs.existsSync(path.join(home, ".br0wser", "escape")), false);
});

test("named browser commands reject conflicting selectors and port values before connecting", { skip: !supported }, () => {
  const explicitDir = path.join(home, "explicit-profile");
  fs.mkdirSync(explicitDir);
  const cases = [
    { args: ["--profile", "team", "--user-data-dir", explicitDir, "info"], env: {}, pattern: /profile.*user-data-dir|user-data-dir.*profile/i },
    { args: ["--profile", "team", "--endpoint", "http://127.0.0.1:9222", "info"], env: {}, pattern: /profile.*endpoint|endpoint.*profile/i },
    { args: ["--profile", "team", "--chrome-port", "0", "info"], env: {}, pattern: /port/i },
    { args: ["--profile", "team", "info"], env: { CDP_USER_DATA_DIR: explicitDir }, pattern: /profile.*user-data-dir|user-data-dir.*profile/i },
    { args: ["--profile", "team", "info"], env: { CDP_ENDPOINT: "http://127.0.0.1:9222" }, pattern: /profile.*endpoint|endpoint.*profile/i },
  ];
  for (const { args, env, pattern } of cases) {
    const result = runCli(args, env);
    assert.notEqual(result.status, 0, `${args.join(" ")} unexpectedly succeeded`);
    assert.match(result.stderr, pattern, result.stderr);
  }
});

test("named command reports missing profile and creation hint", { skip: !supported }, () => {
  const result = runCli(["--profile", "missing", "info"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing/i);
  assert.match(result.stderr, /profile create missing/);
});

test("named profiles reject escaping directory links and regular files", { skip: !supported }, () => {
  const created = runCli(["profile", "create", "contained"]);
  assert.equal(created.status, 0, created.stderr);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "br0wser-outside-profile-"));
  fs.symlinkSync(outside, path.join(profileRoot, "escaping"));
  fs.writeFileSync(path.join(profileRoot, "regular-file"), "");
  for (const name of ["escaping", "regular-file"]) {
    const rejected = runCli(["--profile", name, "info"]);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /inside|directory/);
  }
  for (const port of ["65536", "-1", "2.5", "port"]) {
    const rejected = runCli(["--profile", "contained", "--chrome-port", port, "info"]);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /port/i);
  }
});


test("named open refuses each standalone Chrome singleton entry", { skip: !supported }, async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  for (const [name, kind] of [["SingletonLock", "symlink"], ["SingletonSocket", "directory"], ["SingletonCookie", "file"]]) {
    const profile = name.toLowerCase();
    const created = runCli(["profile", "create", profile]);
    assert.equal(created.status, 0, created.stderr);
    const entry = path.join(profileRoot, profile, name);
    if (kind === "symlink") fs.symlinkSync("missing-owner", entry);
    else if (kind === "directory") fs.mkdirSync(entry);
    else fs.writeFileSync(entry, "synthetic");
    const refused = runCli(["--profile", profile, "--chrome-port", String(port), "open", "about:blank"], {
      BROWSER_CHROME_PATH: path.join(home, "must-not-launch"),
    });
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /in use|unresolved Chrome state/);
    assert.ok(fs.lstatSync(entry));
  }
});
