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

The profile and port are caller supplied each time. `br0wser` does not save a current profile, profile registry, or port mapping. Named profile verification is currently supported on macOS. It checks the connected browser's data directory before acting, using a temporary Chrome metadata tab that may briefly affect browser focus. Existing tabs and the browser remain open.

## Existing sessions

Without `--profile`, existing attach and launch behavior is unchanged. Use `--user-data-dir` when launching with a caller-managed directory:

```bash
br0wser --chrome-port 9222 --user-data-dir /path/to/chrome-data open https://example.com
br0wser --chrome-port 9222 info
```

The default port is `9222`. Use `--page-url` to prefer a page whose URL contains the given fragment. Read `info` first when several pages may be open.

## Commands

- `profile create <name>` creates a named profile directory.
- `open [url]` launches a browser or navigates an existing session.
- `info`, `goto`, `click-text`, `click-selector`, `fill-selector`, `screenshot`, and `eval` inspect or interact with the selected page.
- `install --skills <claude|codex>` installs the bundled agent skill.

Use `br0wser --help` for flags and `skills/br0wser/references/` for command details and workflows.
