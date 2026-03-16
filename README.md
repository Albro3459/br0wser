# br0wser

`br0wser` is a small CLI for launching Chrome/Chromium with a debug port or attaching to an existing browser over the Chrome DevTools Protocol.

It is primarily meant to be used as a skill or helper tool by an agent that needs to reconnect to a live browser session across steps, turns, or debugging loops. Humans can use it directly too, but the main design goal is agent-friendly browser reuse instead of one-shot automation.

It is designed for workflows where browser state should stick around between runs: signed-in sessions, open tabs, localStorage, cookies, or a browser that was started by VS Code debugging.

## Why this exists

Most browser automation tools assume they own the browser lifecycle. `br0wser` is built for the opposite case:

- open a browser once
- keep it alive
- reconnect to it whenever you need to inspect, click, fill, evaluate, or screenshot

That makes it useful for agent skills, local app development, debugger-driven flows, and any workflow where starting from a fresh browser each time is annoying.

## Install

```bash
npm install -g @albro3459/br0wser
```

Or run it without a global install:

```bash
npx @albro3459/br0wser info
```

Optional convenience alias:

```bash
alias brwsr="br0wser --chrome-port 9222"
```

The helper defaults to Chrome debug port `9222`, so `--chrome-port` is optional unless you need a different port. The alias is still handy if you want to make that default explicit.

## Quick start

The most common use case is an agent attaching to a persistent browser that you already opened or that your debugger launched.

Launch or reuse a browser on the default port `9222`:

```bash
br0wser open http://localhost:4200
```

See what tabs are available:

```bash
br0wser info
```

Target a specific tab and interact with it:

```bash
br0wser --chrome-port 9222 --page-url localhost:4200 click-text "Login"
br0wser --chrome-port 9222 --page-url localhost:4200 fill-selector 'input[name="email"]' 'user@example.com'
br0wser --chrome-port 9222 --page-url localhost:4200 eval "location.href"
```

## Common commands

```bash
br0wser --chrome-port 9222 open https://example.com
br0wser --chrome-port 9222 info
br0wser --chrome-port 9222 goto https://example.org
br0wser --chrome-port 9222 --page-url example.org click-selector 'button[type="submit"]'
br0wser --chrome-port 9222 --page-url example.org click-text 'Continue'
br0wser --chrome-port 9222 --page-url example.org fill-selector 'input[name="email"]' 'user@example.com'
br0wser --chrome-port 9222 --page-url example.org eval "document.title"
br0wser --chrome-port 9222 --page-url example.org screenshot page.png
```

## How it works

- `open` launches a debug browser if one is not already listening on the chosen port
- if a browser is already running on that port, `open` reuses it
- each command connects, does one job, and detaches cleanly
- the browser keeps running until you close it

That means session state persists naturally across commands.

For agents, that persistent state is the whole point: one step can open or reuse the browser, later steps can reconnect, and neither the tool nor the agent has to rebuild app state from scratch every time.

## Useful flags

- `--chrome-port <port>`: debug port to attach to or launch with; defaults to `9222`
- `--page-url <fragment>`: select the tab whose URL includes the fragment
- `--headless`: launch in headless mode when using `open`
- `--user-data-dir <path>`: use a dedicated browser profile
- `--endpoint <url>`: connect directly to a CDP endpoint instead of building one from a port

## VS Code example

If VS Code launches Chrome with a remote debugging port, `br0wser` can hop into that same session. This is especially useful when an agent needs to share the exact browser instance that your debugger owns.

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

## Tips

- Provide the [VsCodeDebugger-MCP](https://github.com/Albro3459/VsCodeDebugger-MCP) to your agent to query and run your VSCode launch configs.
- Treat `br0wser` as an attach-first tool for agents: keep the browser alive and reconnect instead of opening fresh sessions unless you need a clean profile.
- Run `info` before interacting when multiple tabs may be open.
- Use `--page-url` when you want to avoid clicking in the wrong tab.
- Prefer stable selectors over repeated button text.
- After route-changing clicks, verify with `info` or `eval "location.href"`.
- If a click appears to hang during a debugger-driven flow, check whether execution is paused at a breakpoint.
- `screenshot` writes into the OS temp directory under `.br0wser/` and appends a timestamp and hash to the filename.

## Headed vs Headless

`open` is headed by default. Pass `--headless` only when you do not need a visible browser window.

## Command summary

- `open [url]`
- `info`
- `goto <url>`
- `click-text <text>`
- `click-selector <selector>`
- `fill-selector <selector> <text>`
- `screenshot [filename]`
- `eval <expression>`

## Notes

- `br0wser` does not try to close the browser for you.
- A dedicated `--user-data-dir` is a good idea when you launch your own debug browser.
- This tool is intentionally small and works best as an agent skill or persistent-browser helper, not a full test runner.
