---
name: "br0wser"
description: "Use when a task needs to launch Chrome/Chromium or reconnect to a persistent Chrome/Chromium session over CDP, including a browser started by a debugger. Optional named profiles reuse browser data across tasks."
---

# br0wser

Use this skill when a task needs a browser session to persist across commands or when an agent must reconnect to a browser already in use. Chrome retains cookies, tabs, and site state in its user data directory. Debugging is one use case; ordinary browsing, research, and local development also fit.

If the CLI is unavailable, install it once with `npm install -g @albro3459/br0wser`. The package includes Playwright; a separate global Playwright command is unnecessary. Launching requires an available browser binary, either Playwright’s installed Chromium or an executable supplied by `BROWSER_CHROME_PATH`.

## Workflow

1. Read the project instructions for the intended profile or data directory, port, and page.
2. Use `info` to inspect an existing session. Use `open` when the browser needs to launch or navigate.
3. For a new named session, create its profile once. Pass the same profile and port on every later command.
4. Check the page list, choose the intended page, and verify important changes after navigation or interaction.
5. Leave the browser running. Let the user complete sign-in or MFA when needed.

```bash
br0wser profile create research
br0wser --profile research --chrome-port 9223 open https://example.com
br0wser --profile research --chrome-port 9223 info
br0wser --profile research --chrome-port 9223 --page-url example.com eval "location.href"
```

Named profiles use dedicated directories under `~/.br0wser/profiles/` and are currently supported on macOS. Before page actions, br0wser confirms that the connected browser owns the profile directory. The check opens no tab. It verifies the directory, not the signed-in website account. A new profile may need sign-in.

Put options before the command. An option after the command is an error.

Without `--profile`, use the existing explicit `--user-data-dir` or endpoint workflow. Keep site-specific login, API access, and saved data instructions in the project skill.

Open [the CLI reference](references/cli.md) for flags and commands. Open [workflows](references/workflows.md) for debugger sessions and troubleshooting.
