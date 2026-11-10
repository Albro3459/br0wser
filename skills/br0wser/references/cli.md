# CLI reference

Global options go before the command. An option placed after the command is an error. The default local Chrome debug port is `9222`.

To launch, set `BROWSER_CHROME_PATH` to an installed Chrome/Chromium executable or have Playwright's Chromium installed. The npm package includes the Playwright library and does not download a browser binary. Attach-only commands use the already running browser.

## Profiles

```bash
br0wser profile create <name>
br0wser --profile <name> --chrome-port <port> open [url]
br0wser --profile <name> --chrome-port <port> info
```

A profile name contains lowercase letters, digits, hyphens, or underscores, and starts with a letter or digit. Its directory is `~/.br0wser/profiles/<name>`. Creation is safe to repeat. Chrome initializes the browser data on first launch.

Supply the profile and port on every command. A missing profile is an error; create it explicitly when you intend to start a new session. Named profiles are currently supported on macOS. They cannot be combined with `--user-data-dir` or `--endpoint`, including `CDP_USER_DATA_DIR` or `CDP_ENDPOINT` environment settings.

Before it uses existing pages, br0wser checks that the connected browser owns the profile directory. It asks the browser for its process ID over CDP and compares that to the owner of Chrome's `SingletonLock` in the directory. The check opens no tab and does not change focus. If the profile cannot be verified, the command stops.

Before launching into a free port, br0wser refuses to use a profile directory that contains a Chrome singleton lock, socket, or cookie entry. If Chrome is already using the profile on another port, use that session's configured port. A crash or force quit can leave stale entries behind. After confirming no Chrome is running on the profile, delete `SingletonLock`, `SingletonSocket`, and `SingletonCookie` from the profile directory. br0wser does not remove Chrome locks itself.

Named profiles assume a trusted local machine and a local filesystem. Lock preflight cannot reserve a directory against concurrent Chrome launches. A racing launch may still open an extra blank tab, but the requested URL is sent only after verification. Remote and forwarded endpoints are outside this mode.

## Options

- `--profile <name>`: select and verify a named profile on macOS.
- `--chrome-port <port>`: use a local Chrome debug port. Defaults to `9222`.
- `--endpoint <url>`: connect to a CDP endpoint. Cannot be combined with `--profile`.
- `--user-data-dir <path>`: set the directory when launching a browser. Cannot be combined with `--profile`.
- `--page-url <fragment>`: prefer the first page whose URL contains the fragment. If none matches, current behavior falls back to the first page.
- `--headless`: launch headless when `open` starts a browser.
- `--headed`: launch headed when `open` starts a browser.
- `--help`, `-h`: print CLI help.
- `--version`, `-v`: print the installed version.

Endpoint resolution without a named profile follows this order: `--endpoint`, `CDP_ENDPOINT`, `--chrome-port`, `CDP_CHROME_PORT`, then `9222`.

## Commands

- `open [url]`: launch or reuse a browser and navigate to a URL. Defaults to `about:blank`.
- `info`: list pages and the selected page.
- `goto <url>`: navigate the selected page.
- `click-text <text>`: click the first exact text match.
- `click-selector <css>`: click the first matching locator.
- `fill-selector <css> <text>`: fill a matching locator.
- `screenshot [filename]`: save a PNG under the OS temp `.br0wser` directory. The CLI adds a timestamp and random suffix.
- `eval <expression>`: evaluate JavaScript in the selected page and print its JSON result.
- `profile create <name>`: create a named profile directory without launching Chrome.
- `install --skills <claude|codex>`: copy the bundled skill into the chosen agent's skill directory.
