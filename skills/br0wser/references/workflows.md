# Workflows

## Reuse a named session

Create a profile when a new dedicated browser session is intended. Then pass the same name and port on later commands:

```bash
br0wser profile create research
br0wser --profile research --chrome-port 9223 open https://example.com
br0wser --profile research --chrome-port 9223 info
br0wser --profile research --chrome-port 9223 --page-url example.com click-selector 'button[aria-label="Continue"]'
br0wser --profile research --chrome-port 9223 --page-url example.com eval "location.href"
```

Use headed Chrome when a person needs to sign in. Login and MFA state stays in Chrome's profile directory. A later browser launch may still require sign-in again if the site session expires.

Named profiles resolve under `~/.br0wser/profiles/` and currently work on macOS. On reconnect, br0wser verifies the browser's data directory through a temporary `chrome://version` tab before using existing pages. It closes only the tab it created. The check may briefly affect focus and does not verify which account a website has signed in.

If a named profile is missing, create it explicitly. If its directory has Chrome singleton entries while the requested port is free, br0wser stops to avoid Chrome forwarding a launch request into another session. Check the intended browser and port or resolve stale entries before retrying.

## Use an existing browser

For an existing browser whose connection is documented by the project, pass its local port:

```bash
br0wser --chrome-port <port> info
br0wser --chrome-port <port> --page-url <url-fragment> eval "location.href"
```

Without `--profile`, `open` and attach behavior remain unchanged. Use `--endpoint` for a direct CDP endpoint or `--user-data-dir` when launching with a caller-managed directory. Named profiles cannot be combined with either option.

## Share a debugger session

A browser started by VS Code or another debugger can also be used by br0wser when its local CDP port is known. Inspect pages first, then act on the debugger-owned page when the task needs it:

```bash
br0wser --chrome-port <port> info
br0wser --chrome-port <port> --page-url localhost:4200 eval "location.href"
br0wser --chrome-port <port> --page-url localhost:4200 screenshot debug-session.png
```

Keep interactions on the intended page. If an action stalls, check whether execution is paused at a breakpoint.

## Notes

- `open` is headed by default. Put `--headless` before `open` when a visible window is not needed.
- `info` lists pages. `--page-url` chooses the first URL substring match and falls back to the first page when none matches.
- `screenshot` writes to `<os temp directory>/.br0wser/` and appends a timestamp and random suffix to the supplied filename.
- After route-changing actions, verify the URL or page state.
- Commands disconnect after each action. Leave Chrome open to retain its session.
