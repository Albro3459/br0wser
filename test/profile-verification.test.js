import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { requireUnusedProfile, verifyProfileDirectory } from "../scripts/profiles.js";

const makeBrowser = (browserPid) => ({
  newBrowserCDPSession: async () => ({
    send: async () => ({ processInfo: [{ type: "GPU", id: 7 }, { type: "browser", id: browserPid }] }),
  }),
});

const makeLockedProfile = (lockOwner) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "br0wser-profile-verification-"));
  fs.symlinkSync(lockOwner, path.join(directory, "SingletonLock"));
  return directory;
};

test("a browser that holds the profile lock passes verification", async () => {
  await verifyProfileDirectory(makeBrowser(4321), makeLockedProfile("my-mac.local-4321"));
});

test("a browser that does not hold the profile lock fails verification", async () => {
  await assert.rejects(verifyProfileDirectory(makeBrowser(4321), makeLockedProfile("my-mac.local-999")), /mismatch.*pid 4321.*pid 999/);
});

test("a profile without a lock fails verification", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "br0wser-profile-unlocked-"));

  await assert.rejects(verifyProfileDirectory(makeBrowser(4321), directory), /mismatch.*No running Chrome/);
});

test("unreadable singleton inspection stops launch", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "br0wser-profile-unreadable-entry-"));
  const regularFile = path.join(parent, "not-a-profile-directory");
  fs.writeFileSync(regularFile, "");

  assert.throws(() => requireUnusedProfile(regularFile), /Cannot inspect profile entry SingletonLock/);
});
