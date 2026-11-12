import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import {
  assertNeverFrontmost,
  closeOwnedBrowser,
  createTargetRaceProxy,
  getBrowserPid,
  getTargets,
  makeFixture,
  requireInteractiveDesktop,
  runOk,
  startPageServer,
  unsupportedReason,
  unusedPort,
  watchFrontmost,
  withoutFrontmost,
} from "./background-helpers.js";

// These tests never activate an app. They only check that the test browser stays out of the front
for (const named of [false, true]) {
  test(`background ${named ? "named profile" : "unnamed profile"} launch, interactions, reconnect, and page creation`, { skip: unsupportedReason }, async (t) => {
    const fixture = makeFixture(named ? "Chromium" : "Google Chrome for Testing");
    await requireInteractiveDesktop();
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
      }
    });
    if (named) await runOk(fixture, ["profile", "create", "primary"]);

    const launch = await watchFrontmost(() => runOk(fixture, ["--background", ...options, "open", `${url}/form`]));
    assert.match(launch.result.stdout, /opened=/);
    if (named) assert.match(launch.result.stdout, /profile=primary/);
    browser = await chromium.connectOverCDP(endpoint);
    const pid = await getBrowserPid(browser);
    assertNeverFrontmost(launch.observed, pid);
    const inBackground = (action) => withoutFrontmost(pid, action);
    const initial = await getTargets(browser);
    assert.equal(initial.length, 1, "A fresh background launch should create one page without a startup window");
    assert.equal(initial[0].url, `${url}/form`);

    await inBackground(async () => {
      const info = await runOk(fixture, [...options, "info"]);
      assert.match(info.stdout, /pages=1/);
      const location = await runOk(fixture, [...options, "eval", "location.href"]);
      assert.equal(JSON.parse(location.stdout), `${url}/form`);
      const reopened = await runOk(fixture, [...options, "open", `${url}/form`]);
      assert.match(reopened.stdout, /existing-session/);
      assert.deepEqual(await getTargets(browser), initial, "Reconnect and open should preserve the selected target");

      await runOk(fixture, [...options, "fill-selector", "#name", "background value"]);
      await runOk(fixture, [...options, "click-selector", "#save"]);
      const clicked = await runOk(fixture, [...options, "eval", "document.querySelector('#result').textContent"]);
      assert.equal(JSON.parse(clicked.stdout), "background value");
      await runOk(fixture, [...options, "click-text", "Reset"]);
      const reset = await runOk(fixture, [...options, "eval", "document.querySelector('#result').textContent"]);
      assert.equal(JSON.parse(reset.stdout), "reset");
      await runOk(fixture, [...options, "goto", `${url}/next`]);
      const navigated = await getTargets(browser);
      assert.deepEqual(navigated, [{ targetId: initial[0].targetId, url: `${url}/next` }]);
      const screenshot = await runOk(fixture, [...options, "screenshot", "background-fixture.png"]);
      const screenshotPath = screenshot.stdout.match(/^screenshot=(.+)$/m)?.[1];
      assert.ok(screenshotPath, screenshot.stdout);
      const png = fs.readFileSync(screenshotPath);
      assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      assert.ok(png.length > 1000);
    });

    const session = await browser.newBrowserCDPSession();
    try {
      const secondary = await inBackground(() => session.send("Target.createTarget", {
        url: `${url}/secondary`, background: true, newWindow: true,
      }));
      await inBackground(() => runOk(fixture, ["--background", ...options, "--page-url", "/secondary", "open", `${url}/reused`]));
      const selected = await getTargets(browser);
      assert.equal(selected.length, 2);
      assert.deepEqual(selected.find((target) => target.targetId === secondary.targetId), { targetId: secondary.targetId, url: `${url}/reused` });
      assert.deepEqual(selected.find((target) => target.targetId === initial[0].targetId), { targetId: initial[0].targetId, url: `${url}/next` });

      if (named) {
        await runOk(fixture, ["profile", "create", "wrong"]);
        await inBackground(async () => {
          for (const command of [["open", `${url}/must-not-navigate`], ["focus"]]) {
            const mismatch = await fixture.run(["--profile", "wrong", "--chrome-port", String(port), ...command]);
            assert.notEqual(mismatch.status, 0);
            assert.match(mismatch.stderr, /mismatch/i);
            assert.deepEqual(await getTargets(browser), selected, "Mismatched profiles must not create, close, or navigate targets");
          }
        });
      }

      for (const { targetId } of selected) await session.send("Target.closeTarget", { targetId });
      assert.deepEqual(await getTargets(browser), []);
      await inBackground(() => runOk(fixture, ["--background", ...options, "open", `${url}/recreated`]));
      const recreated = await getTargets(browser);
      assert.equal(recreated.length, 1);
      assert.equal(recreated[0].url, `${url}/recreated`);
      assert.ok(!selected.some((target) => target.targetId === recreated[0].targetId));

      if (!named) {
        await session.send("Target.closeTarget", { targetId: recreated[0].targetId });
        const proxy = await createTargetRaceProxy(browser, endpoint);
        try {
          await inBackground(() => runOk(fixture, ["--background", "--endpoint", proxy.endpoint, "open", `${url}/target-race`]));
          assert.ok(proxy.competitorId, "The CLI must create a target through CDP");
          const targets = await getTargets(browser);
          assert.equal(targets.length, 2);
          assert.deepEqual(targets.find((target) => target.targetId === proxy.competitorId), { targetId: proxy.competitorId, url: "about:blank" });
          assert.equal(targets.filter((target) => target.url === `${url}/target-race`).length, 1);
        } finally {
          await proxy.close();
        }

        for (const { targetId } of await getTargets(browser)) await session.send("Target.closeTarget", { targetId });
        const closing = await createTargetRaceProxy(browser, endpoint, { closeCompetitorOnInspect: true });
        try {
          await inBackground(() => runOk(fixture, ["--background", "--endpoint", closing.endpoint, "open", `${url}/competitor-closed`]));
          assert.ok(closing.competitorClosed, "The competing page must close while the CLI inspects it");
          assert.deepEqual((await getTargets(browser)).map((target) => target.url), [`${url}/competitor-closed`]);
        } finally {
          await closing.close();
        }
      }
    } finally {
      await session.detach();
    }
  });
}

test("headless launch stays usable and rejects focus without changing targets", { skip: unsupportedReason }, async (t) => {
  const fixture = makeFixture();
  await requireInteractiveDesktop();
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
    }
  });
  const opened = await runOk(fixture, ["--headless", ...options, "open", url]);
  assert.match(opened.stdout, /mode=headless/);
  browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.waitForEvent("page", { timeout: 10000 });
  await page.waitForURL(url, { waitUntil: "domcontentloaded", timeout: 10000 });
  const baseline = await getTargets(browser);
  assert.equal(baseline.length, 1);
  const value = await runOk(fixture, [...options, "eval", "document.title"]);
  assert.equal(JSON.parse(value.stdout), "Background browser fixture");
  await withoutFrontmost(await getBrowserPid(browser), async () => {
    const focus = await fixture.run([...options, "focus"]);
    assert.notEqual(focus.status, 0);
    assert.match(focus.stderr, /headless/i);
    assert.deepEqual(await getTargets(browser), baseline);
  });
});
