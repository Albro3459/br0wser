# Browser Reference

Assume the main install step from `SKILL.md` is already complete.

Optional convenience alias:

```bash
alias brwsr="br0wser --chrome-port <port>"
```

If you omit `--chrome-port`, `br0wser` defaults to `9222`.

## Start or reuse a persistent browser

Use `open` to launch or reuse a session. It is headed by default:

```bash
brwsr open https://example.com
brwsr open https://example.com --headless
```

Use `open` to start or reuse a session, and `goto` to navigate the current selected page to a new URL.

## Core

```bash
brwsr open https://example.com
brwsr info
brwsr goto https://example.org
brwsr --page-url <url-fragment> info
brwsr --page-url <url-fragment> click-selector '<selector>'
brwsr --page-url <url-fragment> click-text 'Login'
brwsr --page-url <url-fragment> fill-selector '<selector>' 'value'
brwsr --page-url <url-fragment> eval "location.href"
brwsr --page-url <url-fragment> screenshot shared-browser.png
```

## Liveness

```bash
ping -c 1 127.0.0.1
curl -s http://127.0.0.1:<port>/json/version
curl -s http://127.0.0.1:<port>/json/list
```

## Notes

- Prefer `info` before interacting.
- `open` defaults to headed mode. Pass `--headless` only when needed.
- `screenshot` writes to `<os tmpdir>/.br0wser/`; pass only a filename (optional), and all output filenames get `-<timestamp>-<hash>` appended.
- Use `--page-url` when multiple tabs may exist.
- Follow route-changing clicks with `info` or `eval "location.href"`.
- Prefer selector hooks over repeated text labels.
- If the installed binary is shadowed by a shell function, use `command br0wser ...`.
- Never close the attached browser session from the helper.
- A browser launched this way stays alive until the user closes it.
- Good for research, browser-side JS, local app testing, and debugging.
