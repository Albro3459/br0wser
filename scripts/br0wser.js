#!/usr/bin/env node

import http from "http";
import https from "https";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const ACTION_TIMEOUT_MS = Number(process.env.BROWSER_ACTION_TIMEOUT_MS || "10000");
const ENDPOINT_WAIT_MS = Number(process.env.BROWSER_ENDPOINT_WAIT_MS || "10000");
const ENDPOINT_WAIT_STEP_MS = 250;
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_PATH);
const PACKAGE_ROOT = path.resolve(SCRIPT_DIR, "..");
const BUNDLED_SKILL_ROOT = path.join(PACKAGE_ROOT, "skills", "br0wser");

const getCodexHome = () => process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
const getInstalledSkillRoot = () => path.join(getCodexHome(), "skills", "br0wser");

const formatHelp = () => {
  const installedSkillRoot = getInstalledSkillRoot();

  return [
    "br0wser",
    "",
    "Launch Chrome/Chromium with a debug port or attach to an existing CDP session.",
    "",
    "Usage:",
    "  br0wser [options] <command> [args]",
    "  br0wser install --skills",
    "  br0wser --help",
    "",
    "Options:",
    "  --endpoint <url>        Connect directly to a CDP endpoint",
    "  --chrome-port <port>    Use a local Chrome debug port (default: 9222)",
    "  --page-url <fragment>   Select the first page whose URL includes the fragment",
    "  --headless              Launch a headless browser for open",
    "  --headed                Force headed mode for open",
    "  --user-data-dir <path>  Use a dedicated browser profile when launching",
    "  -h, --help              Show this help",
    "",
    "Commands:",
    "  open [url]              Launch or reuse a browser and navigate to a URL",
    "  info                    List pages in the connected browser",
    "  goto <url>              Navigate the selected page",
    "  click-text <text>       Click the first exact text match",
    "  click-selector <css>    Click the first matching locator",
    "  fill-selector <css> <text>",
    "                          Fill a matching locator",
    "  screenshot [filename]   Save a PNG in the OS temp .br0wser directory",
    "  eval <expression>       Evaluate JavaScript in the selected page",
    "  install --skills        Copy the bundled Codex skill into your skills directory",
    "  help                    Show this help",
    "",
    "Install flow:",
    "  1. npm install -g @albro3459/br0wser",
    "  2. br0wser install --skills",
    "",
    "Skill install target:",
    `  ${installedSkillRoot}`,
    "",
    "Bundled docs in this package:",
    `  Package README.md: ${path.join(PACKAGE_ROOT, "README.md")}`,
    `  SKILL.md: ${path.join(BUNDLED_SKILL_ROOT, "SKILL.md")}`,
    `  References: ${path.join(BUNDLED_SKILL_ROOT, "references")}`,
    `  Agent metadata: ${path.join(BUNDLED_SKILL_ROOT, "agents", "openai.yaml")}`,
  ].join("\n");
};

const parseArgs = (argv) => {
  const result = {
    endpoint: process.env.CDP_ENDPOINT || "",
    chromePort: process.env.CDP_CHROME_PORT || "",
    pageUrl: process.env.CDP_PAGE_URL || "",
    headless: false,
    userDataDir: process.env.CDP_USER_DATA_DIR || "",
    command: "info",
    args: [],
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help" || value === "-h") {
      result.help = true;
      continue;
    }
    if (value === "--endpoint") {
      result.endpoint = argv[index + 1] || result.endpoint;
      index += 1;
      continue;
    }
    if (value === "--chrome-port") {
      result.chromePort = argv[index + 1] || result.chromePort;
      index += 1;
      continue;
    }
    if (value === "--page-url") {
      result.pageUrl = argv[index + 1] || result.pageUrl;
      index += 1;
      continue;
    }
    if (value === "--headless") {
      result.headless = true;
      continue;
    }
    if (value === "--headed") {
      result.headless = false;
      continue;
    }
    if (value === "--user-data-dir") {
      result.userDataDir = argv[index + 1] || result.userDataDir;
      index += 1;
      continue;
    }
    if (value.startsWith("--")) {
      throw new Error(`Unknown option: ${value}`);
    }
    result.command = value;
    result.args = argv.slice(index + 1);
    break;
  }

  return result;
};

const ensureBundledSkillExists = () => {
  if (!fs.existsSync(BUNDLED_SKILL_ROOT)) {
    throw new Error(`Bundled skill files were not found at ${BUNDLED_SKILL_ROOT}`);
  }
};

const copyTree = (sourceRoot, targetRoot) => {
  const entries = fs.readdirSync(sourceRoot, { withFileTypes: true });
  fs.mkdirSync(targetRoot, { recursive: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceRoot, entry.name);
    const targetPath = path.join(targetRoot, entry.name);

    if (entry.isDirectory()) {
      copyTree(sourcePath, targetPath);
      continue;
    }

    fs.copyFileSync(sourcePath, targetPath);
  }
};

const installSkills = () => {
  ensureBundledSkillExists();

  const installedSkillRoot = getInstalledSkillRoot();
  copyTree(BUNDLED_SKILL_ROOT, installedSkillRoot);

  console.log(`installed-skill=${installedSkillRoot}`);
  console.log(`source-skill=${BUNDLED_SKILL_ROOT}`);
  console.log(`package-readme=${path.join(PACKAGE_ROOT, "README.md")}`);
  console.log(`skill-md=${path.join(installedSkillRoot, "SKILL.md")}`);
  console.log(`references=${path.join(installedSkillRoot, "references")}`);
};

const requireArg = (value, label) => {
  if (!value) {
    throw new Error(`Missing required argument: ${label}`);
  }
  return value;
};

const getPages = (browser) =>
  browser.contexts().flatMap((context) => context.pages());

const selectPage = (pages, pageUrl) => {
  if (pages.length === 0) {
    throw new Error("No pages found in the attached browser.");
  }

  if (!pageUrl) {
    return pages[0];
  }

  return pages.find((page) => page.url().includes(pageUrl)) || pages[0];
};

const resolveEndpoint = (options) => {
  if (options.endpoint) {
    return options.endpoint;
  }

  if (options.chromePort) {
    return `http://127.0.0.1:${options.chromePort}`;
  }

  return "http://127.0.0.1:9222";
};

const fetchJson = (urlString) =>
  new Promise((resolve, reject) => {
    const transport = urlString.startsWith("https:") ? https : http;
    const request = transport.get(urlString, (response) => {
      let data = "";

      response.on("data", (chunk) => {
        data += chunk;
      });

      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Endpoint check failed with status ${response.statusCode}: ${urlString}`));
          return;
        }

        try {
          resolve(JSON.parse(data));
        } catch (_error) {
          reject(new Error(`Endpoint returned invalid JSON: ${urlString}`));
        }
      });
    });

    request.on("error", (error) => {
      reject(new Error(`Could not reach Chrome debug endpoint ${urlString}: ${error.message}`));
    });

    request.setTimeout(2000, () => {
      request.destroy(new Error("Request timed out"));
    });
  });

const verifyEndpoint = async (endpoint) => {
  await fetchJson(`${endpoint}/json/version`);
};

const makeScreenshotPath = (name) => {
  const rootDir = path.join(os.tmpdir(), ".br0wser");
  fs.mkdirSync(rootDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const randomId = crypto.randomBytes(4).toString("hex");
  const suffix = `-${timestamp}-${randomId}`;

  if (name) {
    const parsedName = path.parse(path.basename(name));
    const stem = parsedName.name || "shot";
    const ext = parsedName.ext || ".png";
    return path.join(rootDir, `${stem}${suffix}${ext}`);
  }

  return path.join(rootDir, `shot${suffix}.png`);
};

const waitForEndpoint = async (endpoint) => {
  const deadline = Date.now() + ENDPOINT_WAIT_MS;
  let lastError = new Error("Timed out waiting for Chrome debug endpoint");

  while (Date.now() < deadline) {
    try {
      await verifyEndpoint(endpoint);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, ENDPOINT_WAIT_STEP_MS));
    }
  }

  throw new Error(`Could not reach Chrome debug endpoint after ${ENDPOINT_WAIT_MS}ms: ${endpoint}. Last error: ${lastError.message}`);
};

const isEndpointReachable = async (endpoint) => {
  try {
    await verifyEndpoint(endpoint);
    return true;
  } catch (_error) {
    return false;
  }
};

const launchDebugBrowser = async (options, url) => {
  const chromePort = options.chromePort || "9222";
  const expectedEndpoint = `http://127.0.0.1:${chromePort}`;
  if (options.endpoint !== expectedEndpoint) {
    throw new Error(`The open command can only launch a local browser endpoint. Use --chrome-port ${chromePort} (endpoint ${expectedEndpoint}).`);
  }

  const userDataDir = options.userDataDir || path.join(os.tmpdir(), `codex-br0wser-profile-${chromePort}`);
  const executablePath = process.env.BROWSER_CHROME_PATH || chromium.executablePath();
  const launchArgs = [`--remote-debugging-port=${chromePort}`, `--user-data-dir=${userDataDir}`, url];

  if (options.headless) {
    launchArgs.unshift("--headless=new");
  }

  const child = spawn(executablePath, launchArgs, {
    detached: true,
    stdio: "ignore",
  });

  child.unref();
  await waitForEndpoint(options.endpoint);
  console.log(`opened=${url}`);
  console.log(`mode=${options.headless ? "headless" : "headed"}`);
  console.log(`endpoint=${options.endpoint}`);
  console.log(`user-data-dir=${userDataDir}`);
};

export async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help || options.command === "help") {
    console.log(formatHelp());
    return;
  }

  if (options.command === "install") {
    if (!options.args.includes("--skills")) {
      throw new Error('Unknown install target. Use "br0wser install --skills".');
    }

    installSkills();
    return;
  }

  options.endpoint = resolveEndpoint(options);

  if (options.command === "open") {
    const url = options.args[0] || "about:blank";
    if (await isEndpointReachable(options.endpoint)) {
      let browser;
      try {
        browser = await chromium.connectOverCDP(options.endpoint);
        const pages = getPages(browser);
        const context = browser.contexts()[0];
        if (!context) {
          throw new Error("No browser context found in the attached browser.");
        }
        const page = pages.length > 0 ? selectPage(pages, options.pageUrl) : await context.newPage();
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: ACTION_TIMEOUT_MS });
        console.log(`opened=${url}`);
        console.log(`mode=existing-session`);
        console.log(`endpoint=${options.endpoint}`);
        console.log(`selected=${await page.title()} :: ${page.url()}`);
      } finally {
        if (browser) {
          await browser.close();
        }
      }
      return;
    }

    await launchDebugBrowser(options, url);
    return;
  }

  await verifyEndpoint(options.endpoint);
  let browser;
  try {
    browser = await chromium.connectOverCDP(options.endpoint);
    const pages = getPages(browser);
    const page = selectPage(pages, options.pageUrl);

    switch (options.command) {
      case "info": {
        console.log(`endpoint=${options.endpoint}`);
        console.log(`pages=${pages.length}`);
        for (const [index, currentPage] of pages.entries()) {
          console.log(`[${index}] ${await currentPage.title()} :: ${currentPage.url()}`);
        }
        console.log(`selected=${await page.title()} :: ${page.url()}`);
        break;
      }
      case "goto": {
        await page.goto(requireArg(options.args[0], "url"), { waitUntil: "domcontentloaded", timeout: ACTION_TIMEOUT_MS });
        console.log(`selected=${await page.title()} :: ${page.url()}`);
        break;
      }
      case "click-text": {
        const text = requireArg(options.args.join(" "), "text");
        await page.getByText(text, { exact: true }).first().click({ timeout: ACTION_TIMEOUT_MS });
        console.log(`clicked-text=${text}`);
        console.log(`selected=${await page.title()} :: ${page.url()}`);
        break;
      }
      case "click-selector": {
        const selector = requireArg(options.args[0], "selector");
        await page.locator(selector).click({ timeout: ACTION_TIMEOUT_MS });
        console.log(`clicked-selector=${selector}`);
        console.log(`selected=${await page.title()} :: ${page.url()}`);
        break;
      }
      case "fill-selector": {
        const selector = requireArg(options.args[0], "selector");
        const text = requireArg(options.args.slice(1).join(" "), "text");
        await page.locator(selector).fill(text, { timeout: ACTION_TIMEOUT_MS });
        console.log(`filled-selector=${selector}`);
        break;
      }
      case "screenshot": {
        const outputPath = makeScreenshotPath(options.args[0]);
        await page.screenshot({ path: outputPath, scale: "css", type: "png" });
        console.log(`screenshot=${outputPath}`);
        break;
      }
      case "eval": {
        const expression = requireArg(options.args.join(" "), "expression");
        const value = await page.evaluate(({ source }) => globalThis.eval(source), { source: expression });
        console.log(JSON.stringify(value, null, 2));
        break;
      }
      default:
        throw new Error(`Unknown command: ${options.command}`);
    }
  } finally {
    if (browser) {
      // Since the browser was started by the user, this actually simply disconnects at the end of the command and exits cleanly
      await browser.close();
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
