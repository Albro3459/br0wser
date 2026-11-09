import fs from "fs";
import net from "net";
import os from "os";
import path from "path";

export const resolveProfileDirectory = (name, create = false) => {
  if (process.platform !== "darwin") {
    throw new Error("Named profiles currently require macOS. Use --user-data-dir without --profile on other platforms.");
  }
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(name)) {
    throw new Error("Invalid profile name. Use lowercase letters, digits, hyphens, or underscores, starting with a letter or digit.");
  }

  const root = path.join(os.homedir(), ".br0wser", "profiles");
  const directory = path.join(root, name);
  if (create) {
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    try {
      fs.mkdirSync(directory, { mode: 0o700 });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }

  let canonicalRoot;
  let canonicalDirectory;
  try {
    canonicalRoot = fs.realpathSync(root);
    canonicalDirectory = fs.realpathSync(directory);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Unknown profile "${name}". Create it with: br0wser profile create ${name}`);
    }
    throw error;
  }
  const relative = path.relative(canonicalRoot, canonicalDirectory);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Profile "${name}" must stay inside ${canonicalRoot}`);
  }
  if (!fs.statSync(canonicalDirectory).isDirectory()) {
    throw new Error(`Profile "${name}" is not a directory`);
  }
  return canonicalDirectory;
};

export const requireUnusedProfile = (directory) => {
  for (const name of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
    try {
      fs.lstatSync(path.join(directory, name));
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw new Error(`Cannot inspect profile entry ${name}: ${error.message}`);
    }
    throw new Error(`Profile is in use or has unresolved Chrome state (${name}). Check its existing browser before launching on another port. Close that browser or resolve the stale state, then retry.`);
  }
};

export const isLocalPortOccupied = (port) => new Promise((resolve, reject) => {
  const socket = net.createConnection({ host: "127.0.0.1", port });
  socket.setTimeout(2000);
  socket.once("connect", () => {
    socket.destroy();
    resolve(true);
  });
  socket.once("error", (error) => {
    if (error.code === "ECONNREFUSED") resolve(false);
    else reject(new Error(`Cannot establish whether port ${port} is free: ${error.message}`));
  });
  socket.once("timeout", () => {
    socket.destroy();
    reject(new Error(`Cannot establish whether port ${port} is free: connection timed out`));
  });
});

export const withTimeout = async (operation, timeout, message) => {
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeout);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

export const verifyProfileDirectory = async (browser, directory, timeout) => {
  const context = browser.contexts()[0];
  if (!context) throw new Error("No persistent browser context found for profile verification.");

  let page;
  const pendingPage = context.newPage();
  try {
    await withTimeout((async () => {
      page = await pendingPage;
      await page.goto("chrome://version", { waitUntil: "domcontentloaded", timeout });
      const profilePath = (await page.locator("#profile_path").textContent({ timeout }))?.trim();
      if (!profilePath || !path.isAbsolute(profilePath)) {
        throw new Error("Chrome did not report an absolute profile path. Cannot verify the requested profile.");
      }
      const actualDirectory = fs.realpathSync(path.dirname(profilePath));
      if (actualDirectory !== directory) {
        throw new Error(`Profile directory mismatch. Requested ${directory}, connected browser uses ${actualDirectory}. Check --profile and --chrome-port.`);
      }
    })(), timeout, "Profile verification timed out before any existing page was used.");
  } finally {
    if (page) {
      await withTimeout(page.close(), timeout, "Could not close the profile verification tab before timeout. No command was performed.");
    } else {
      // A timed-out creation can still finish while the connection is open
      pendingPage.then((latePage) => latePage.close()).catch(() => {});
    }
  }
};
