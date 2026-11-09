import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { requireUnusedProfile, verifyProfileDirectory } from "../scripts/profiles.js";

const makeBrowser = (page) => ({ contexts: () => [{ newPage: async () => page }] });

test("missing profile metadata closes the temporary page and fails verification", async () => {
  let closed = 0;
  const page = {
    goto: async () => {},
    locator: () => ({ textContent: async () => null }),
    close: async () => { closed += 1; },
  };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "br0wser-profile-missing-metadata-"));

  await assert.rejects(verifyProfileDirectory(makeBrowser(page), directory, 100), /did not report an absolute profile path/);
  assert.equal(closed, 1);
});

test("profile metadata tab creation is bounded", async () => {
  const browser = { contexts: () => [{ newPage: () => new Promise(() => {}) }] };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "br0wser-profile-stalled-create-"));
  const started = Date.now();

  await assert.rejects(verifyProfileDirectory(browser, directory, 25), /verification timed out/);
  assert.ok(Date.now() - started < 250);
});

test("a metadata page that arrives after timeout is closed", async () => {
  let closed = 0;
  let releasePage;
  const browser = {
    contexts: () => [{ newPage: () => new Promise((resolve) => { releasePage = resolve; }) }],
  };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "br0wser-profile-late-create-"));

  await assert.rejects(verifyProfileDirectory(browser, directory, 25), /verification timed out/);
  releasePage({ close: async () => { closed += 1; } });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(closed, 1);
});

test("metadata cleanup is bounded and reports failure", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "br0wser-profile-stalled-close-"));
  const page = {
    goto: async () => {},
    locator: () => ({ textContent: async () => path.join(directory, "Default") }),
    close: () => new Promise(() => {}),
  };

  await assert.rejects(verifyProfileDirectory(makeBrowser(page), directory, 25), /close the profile verification tab/);
});

test("unreadable singleton inspection stops launch", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "br0wser-profile-unreadable-entry-"));
  const regularFile = path.join(parent, "not-a-profile-directory");
  fs.writeFileSync(regularFile, "");

  assert.throws(() => requireUnusedProfile(regularFile), /Cannot inspect profile entry SingletonLock/);
});
