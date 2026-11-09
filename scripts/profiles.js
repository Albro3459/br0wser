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
    throw new Error(`Profile is in use or Chrome left a stale lock (${name}). If Chrome is running on this profile, use its port or close it. If Chrome crashed, delete SingletonLock, SingletonSocket, and SingletonCookie from ${directory}, then retry.`);
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

export const verifyProfileDirectory = async (browser, directory) => {
  // Chrome links SingletonLock to <hostname>-<pid> of the browser that owns the directory
  let lockOwner;
  try {
    lockOwner = fs.readlinkSync(path.join(directory, "SingletonLock"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    throw new Error(`Profile directory mismatch. No running Chrome owns ${directory}. Check --profile and --chrome-port.`);
  }
  const lockPid = Number(lockOwner.slice(lockOwner.lastIndexOf("-") + 1));

  const session = await browser.newBrowserCDPSession();
  const { processInfo } = await session.send("SystemInfo.getProcessInfo");
  const browserPid = processInfo.find((info) => info.type === "browser")?.id;
  if (browserPid !== lockPid) {
    throw new Error(`Profile directory mismatch. The connected browser (pid ${browserPid}) does not own ${directory} (locked by pid ${lockPid}). Check --profile and --chrome-port.`);
  }
};
