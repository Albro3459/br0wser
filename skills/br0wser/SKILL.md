---
name: "br0wser"
description: "Use when the task requires launching a Chrome/Chromium browser or attaching to an existing Chrome/Chromium debug session over CDP. Browser sessions are persistent and can be re-joined."
---

# Browser Skill

Use the local `br0wser` helper to launch, attach to, and re-attach to Chrome or Chromium over the Chrome DevTools Protocol (CDP). This skill is for agent workflows where browser state needs to persist across turns and where the agent may need to hop back into a browser session that was started elsewhere, especially by a VS Code launch config.

Treat this skill as attach-first automation. If the user wants a persistent browser between tasks, keep the browser alive and keep reattaching to that same session instead of starting fresh contexts.

## Prerequisite check (required)

Before proposing commands, confirm both the helper and its dependencies are available on `PATH`:

```bash
command -v br0wser >/dev/null 2>&1
command -v playwright >/dev/null 2>&1
```

If either are not available, install once:

```bash
npm install -g @albro3459/br0wser
br0wser install --skills <claude|codex>
```

Or run it on demand with `npx`:

```bash
npx @albro3459/br0wser --chrome-port <port> info
```

Use `br0wser --help` when you need to print the current install target plus the packaged paths for the bundle `README.md`, `SKILL.md`, and `references/`.

The package includes Playwright through its own dependencies.

## When to use

Use this skill when one or more of these are true:

- the user wants an agent to keep browser state alive across tasks or turns
- the user already launched a Chrome or Chromium debug browser
- the browser was launched by a VS Code debug configuration and the agent should join that existing session
- the user wants to share cookies, localStorage, or app state from a browser they already opened
- the project documents Chrome debug ports in `AGENTS.md`
- the user wants a browser window to stay alive between tasks so login state and tabs persist

This skill works well for browser-side JS, auth and storage debugging, local app validation, debugger-coupled flows, and repeated workflows that benefit from a reconnectable session.

## Required context step

Before using the helper, read the project root `AGENTS.md` from your current task context and extract the correct Chrome debug port for the app you are targeting.

Do not rely on the helper to discover or parse `AGENTS.md` for you.

Pass the port explicitly when invoking the helper with `--chrome-port <port>`.

If multiple apps are documented in `AGENTS.md`, choose the correct one from context and pass its port directly.

If the repo does not document a port, default to `9222` unless the user asks for another port.

## Install Command (Set Once)

Install or repair the package globally:

```bash
npm install -g @albro3459/br0wser
```

Or invoke it without a global install:

```bash
npx @albro3459/br0wser --chrome-port <port> info
```

After installation, verify both prerequisites before relying on it:

```bash
command -v br0wser >/dev/null 2>&1
command -v playwright >/dev/null 2>&1
```

After that, invoke the helper as `br0wser ...` or `npx @albro3459/br0wser ...`.

## Starting your own persistent browser

Use `open` and let the helper launch/reuse the persistent browser session:

```bash
br0wser --chrome-port <port> open about:blank
br0wser --chrome-port <port> open https://example.com
```

Use `--user-data-dir <path>` when you want a specific profile location.

## Quick start

```bash
br0wser --chrome-port <port> open https://example.com
br0wser --chrome-port <port> info
br0wser --chrome-port <port> --page-url <url-fragment> eval "location.href"
```

Use `open` to start or reuse a session, and use `goto` to navigate the current selected page to a new URL.

## Port resolution order

The helper resolves the Chrome debug endpoint in this order:

1. `--endpoint`
2. `--chrome-port`
3. `CDP_ENDPOINT`
4. `CDP_CHROME_PORT`
5. fallback `9222`

The preferred path is `--chrome-port`, using the value you already extracted from project context.

## Core workflow

1. Read the project root `AGENTS.md` from context.
2. Extract the expected Chrome debug port for the target app.
3. Prefer attaching to an existing browser session before launching a new one.
4. If the browser came from a VS Code launch config, stay on the debugger-owned tab unless the task requires a different target.
5. If the user wants a persistent browser and none is running yet, run `br0wser --chrome-port <port> open <url>` to launch one.
6. Start a dedicated browser in the background when appropriate, using `--remote-debugging-port=<port>` and a dedicated `--user-data-dir`.
7. Verify that the endpoint is live before attaching.
8. Attach over CDP to the existing browser.
9. Enumerate pages with `info`.
10. Narrow to the correct page with `--page-url` when needed.
11. Interact using selectors or small page expressions.
12. Re-check state after actions that can change routes or accordion panels.
13. Capture evidence with `screenshot` when useful.

## Recommended patterns

```bash
br0wser --chrome-port <port> open https://example.com
br0wser --chrome-port <port> open https://example.com --headless
br0wser --chrome-port <port> info
br0wser --chrome-port <port> goto https://example.org
br0wser --chrome-port <port> --page-url <url-fragment> eval "location.href"
br0wser --chrome-port <port> click-selector '[data-test="checkoutButton"]'
br0wser --chrome-port <port> click-selector 'button[aria-label="Cart DropDown"]'
br0wser --chrome-port <port> click-selector 'body'
br0wser --chrome-port <port> screenshot current-page.png
```

Use selector hooks over repeated text. Blur the page with `click-selector 'body'` when validation depends on leaving the active input.


## Debugger-coupled page discipline

When browser actions are part of an active VS Code debug run:

- Prefer the tab/page created by the debugger launch flow.
- Avoid opening extra tabs or switching targets unless explicitly needed.
- Keep interactions on the selected debug-owned page; route changes are fine when done on that same page.
- Re-check `br0wser ... info` before each major action to confirm the intended page is selected.

## Breakpoint symptom recognition

If commands like `fill-selector`, `click-selector`, or `eval` appear stalled right after an action:

- Suspect a breakpoint before assuming selector failure.
- Verify external runtime state before changing selectors or page logic.
- After execution resumes, retry only the minimal next browser action.

## Commands

Supported helper commands:

- `open [url]` (headed by default; pass `--headless` to run headless)
- `info`
- `goto <url>`
- `click-text <text>`
- `click-selector <selector>`
- `fill-selector <selector> <text>`
- `screenshot [output-filename]` (optional; pass only a filename; all filenames get `-<timestamp>-<hash>` appended)
- `eval <expression>`

## References

Open only what you need:

- CLI command reference: `references/cli.md`
- Practical flows and troubleshooting: `references/workflows.md`

## Guardrails

- Do not skip the install step just because `command -v br0wser` succeeds. `command -v playwright` must also succeed.
- If the helper resolves on `PATH` but Playwright does not, repair it with `npm install -g @albro3459/br0wser` or use `npx @albro3459/br0wser ...` before proceeding.

- Attach only to a browser the user has already launched or explicitly approved.
- If you launch your own debug browser, use a dedicated `--user-data-dir`.
- Commands should detach cleanly after each run. The helper does not own the browser session.
- The main value of this skill is reconnecting an agent to long-lived browser state and debugger-owned browser sessions.
- Prefer `info` first so you can see which pages exist before interacting.
- Use `--page-url` when multiple tabs might match.
- Install the package once and use `br0wser ...` instead of repeating wrapper paths in every command.
- Use `open` to launch/reuse the browser for persistent CDP sessions.
- Keep expressions small and targeted. Prefer `click-selector` and `fill-selector` over large `eval` blocks.
- After route-changing or panel-changing clicks, verify resulting URL or DOM state explicitly.
- If a click appears to stall, a breakpoint may have been set.
- Prefer stable selector hooks such as `data-test`, `aria-label`, `href`, or form placeholders over generic repeated text.
- In checkout-style forms, blur the field with `click-selector 'body'` when validation depends on leaving the input.
- Address verification can introduce an extra confirmation step; accept the suggested address before expecting shipping, tax, totals, or payment widgets to populate.
- Payment widgets such as Adyen often do not mount until shipping and billing sections are both fully committed.
