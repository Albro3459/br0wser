import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import {
  activateApplication,
  closeOwnedBrowser,
  getBrowserPid,
  getTargets,
  makeFixture,
  requireInteractiveDesktop,
  runOk,
  startPageServer,
  unsupportedReason,
  unusedPort,
  waitForFrontmost,
  withoutFrontmost,
} from "./background-helpers.js";

// These tests bring Chrome forward on purpose. Run them with npm run test:focus while the desktop is free
for (const named of [false, true]) {
  test(`background ${named ? "named profile" : "unnamed profile"} handoff brings the selected page forward and resumes`, { skip: unsupportedReason }, async (t) => {
    const fixture = makeFixture(named ? "Chromium" : "Google Chrome for Testing");
    const original = await requireInteractiveDesktop();
    const port = await unusedPort();
    const endpoint = `http://127.0.0.1:${port}`;
    const directory = named ? path.join(fixture.home, ".br0wser", "profiles", "primary") : path.join(fixture.home, "browser-data");
    const options = ["--chrome-port", String(port), ...(named ? ["--profile", "primary"] : ["--user-data-dir", directory])];
    const { server, url } = await startPageServer();
    let browser;
    t.after(async () => {
      try {
        if (browser) await browser.close();
        await closeOwnedBrowser(endpoint, directory);
      } finally {
        await new Promise((resolve) => server.close(resolve));
        await activateApplication(original.pid);
      }
    });
    if (named) await runOk(fixture, ["profile", "create", "primary"]);

    await runOk(fixture, ["--background", ...options, "open", `${url}/form`]);
    browser = await chromium.connectOverCDP(endpoint);
    const pid = await getBrowserPid(browser);
    const session = await browser.newBrowserCDPSession();
    try {
      await session.send("Target.createTarget", { url: `${url}/secondary`, background: true, newWindow: true });
    } finally {
      await session.detach();
    }
    const targets = await getTargets(browser);
    assert.equal(targets.length, 2);

    await activateApplication(original.pid);
    const focused = await runOk(fixture, [...options, "--page-url", "/form", "focus"]);
    assert.match(focused.stdout, /focused=.*\/form/);
    await waitForFrontmost(pid);
    assert.deepEqual(await getTargets(browser), targets, "Handoff should preserve both targets");
    const handedOff = browser.contexts()[0].pages().find((page) => page.url() === `${url}/form`);
    assert.ok(handedOff);
    await handedOff.locator("#name").fill("handoff value");
    await handedOff.locator("#save").click();

    await activateApplication(original.pid);
    await withoutFrontmost(pid, async () => {
      const resumed = await runOk(fixture, [...options, "--page-url", "/form", "eval", "document.querySelector('#result').textContent"]);
      assert.equal(JSON.parse(resumed.stdout), "handoff value");
      assert.deepEqual(await getTargets(browser), targets);
    });
  });
}

test("default headed launch stays usable and focus brings it forward", { skip: unsupportedReason }, async (t) => {
  const fixture = makeFixture();
  const original = await requireInteractiveDesktop();
  const port = await unusedPort();
  const endpoint = `http://127.0.0.1:${port}`;
  const directory = path.join(fixture.home, "browser-data");
  const options = ["--chrome-port", String(port), "--user-data-dir", directory];
  const { server, url } = await startPageServer();
  let browser;
  t.after(async () => {
    try {
      if (browser) await browser.close();
      await closeOwnedBrowser(endpoint, directory);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await activateApplication(original.pid);
    }
  });
  const opened = await runOk(fixture, [...options, "open", url]);
  assert.match(opened.stdout, /mode=headed/);
  browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.waitForEvent("page", { timeout: 10000 });
  await page.waitForURL(url, { waitUntil: "domcontentloaded", timeout: 10000 });
  const baseline = await getTargets(browser);
  assert.equal(baseline.length, 1);
  const value = await runOk(fixture, [...options, "eval", "document.title"]);
  assert.equal(JSON.parse(value.stdout), "Background browser fixture");
  await activateApplication(original.pid);
  await runOk(fixture, [...options, "focus"]);
  await waitForFrontmost(await getBrowserPid(browser));
  assert.deepEqual(await getTargets(browser), baseline);
});
