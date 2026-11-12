# br0wser

`br0wser` is a small CLI for agents that need to launch or reconnect to a persistent Chrome or Chromium session. Each command connects over CDP, performs one task, then disconnects while the browser stays open.

Chrome keeps cookies, tabs, and other browser data in its user data directory. Project instructions can name a profile and port so an agent can return to the same session. Site-specific authentication and data collection belong in the project skill.

## Install

```bash
npm install -g @albro3459/br0wser
br0wser install --skills codex
```

Use `claude` in place of `codex` to install the skill for Claude Code. The CLI can also run without a global install:

```bash
npx @albro3459/br0wser --help
```

Launching also requires a browser executable. Installing this package does not download Chromium. Use an installed Chrome or Chromium by setting `BROWSER_CHROME_PATH`. On macOS, for example:

```bash
export BROWSER_CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
```

Without that setting, br0wser uses Playwright's Chromium executable, which must already be installed. Attaching to a running browser does not require a launch executable.

## Quick start

Create a named profile once, then supply its name and port on each command:

```bash
br0wser profile create research
br0wser --profile research --chrome-port 9223 open https://example.com
br0wser --profile research --chrome-port 9223 info
br0wser --profile research --chrome-port 9223 --page-url example.com eval "location.href"
```

Named profile directories live at `~/.br0wser/profiles/<name>`. Profile names use lowercase letters and digits, with optional hyphens and underscores. Chrome creates the profile data when first launched. A profile name selects a dedicated data directory; it does not select a Chrome account or guarantee a site is signed in.

The profile and port are caller supplied each time. `br0wser` does not save a current profile, profile registry, or port mapping. Named profiles are currently supported on macOS. Before acting, `br0wser` confirms that the connected browser owns the profile directory by matching the browser's process ID to Chrome's lock in that directory. The check opens no tab and leaves focus alone.

Options go before the command. `br0wser open https://example.com --profile research` is an error.

## Existing sessions

Without `--profile`, existing attach and launch behavior is unchanged. Use `--user-data-dir` when launching with a caller-managed directory:

```bash
br0wser --chrome-port 9222 --user-data-dir /path/to/chrome-data open https://example.com
br0wser --chrome-port 9222 info
```

The default port is `9222`. Use `--page-url` to prefer a page whose URL contains the given fragment. Read `info` first when several pages may be open.

## Work while Chrome stays in the background

On macOS, use `--background` when launching a headed browser to keep Chrome from taking focus while the agent works:

```bash
br0wser profile create research
br0wser --profile research --chrome-port 9223 --background open https://example.com
br0wser --profile research --chrome-port 9223 info
```

If you need to sign in or take over the browser, bring the selected page forward with `focus`, then let the agent know when it can continue:

```bash
br0wser --profile research --chrome-port 9223 --page-url example.com focus
```

The user can also activate Chrome manually. Background mode is macOS-only. It applies when launching Chrome or creating a page when none exists. Existing pages are reused, and later interactions need no flag. The `focus` command brings a page forward. Background mode does not control focus changes caused by sites or native dialogs.

Background launches require an executable inside a Chrome/Chromium app bundle, including Playwright's Chromium or Chrome for Testing. Bare executables and wrapper scripts outside app bundles are unsupported in this mode. Launch options cannot change an already running browser or turn a headless session into a visible one.

## VS Code example

If VS Code launches Chrome with a remote debugging port, `br0wser` can join that same session. This is useful when an agent needs the exact browser instance your debugger owns.

Example launch config in your project's `.vscode/launch.json`:

```json
{
  "name": "Launch Chrome",
  "type": "pwa-chrome",
  "request": "launch",
  "url": "http://localhost:4200",
  "webRoot": "${workspaceFolder}/client",
  "runtimeArgs": [
    "--remote-debugging-port=9222"
  ]
}
```

Once that browser is running, your agent can connect:

```bash
br0wser --chrome-port 9222 info
br0wser --chrome-port 9222 --page-url localhost:4200 eval "location.href"
br0wser --chrome-port 9222 --page-url localhost:4200 screenshot debug-session.png
```

Provide the [VsCodeDebugger-MCP](https://github.com/Albro3459/VsCodeDebugger-MCP) to your agent to query and run your VS Code launch configs. If a click appears to hang during a debugger-driven flow, check whether execution is paused at a breakpoint.

## Commands

- `profile create <name>` creates a named profile directory.
- `open [url]` launches a browser or navigates an existing session.
- `focus` brings the selected page forward for a user handoff.
- `info`, `goto`, `click-text`, `click-selector`, `fill-selector`, `screenshot`, and `eval` inspect or interact with the selected page.
- `install --skills <claude|codex>` installs the bundled agent skill.

Use `br0wser --help` for flags and `skills/br0wser/references/` for command details and workflows.
