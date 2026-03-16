# Browser Workflows

Assume the main install step from `SKILL.md` is already complete.

Optional alias:

```bash
alias brwsr="br0wser --chrome-port <port>"
```

If you omit `--chrome-port`, `br0wser` defaults to `9222`.

## Start a persistent browser

Use `open` to launch or reuse a browser session:

```bash
brwsr open https://example.com
brwsr open https://example.com --headless
```

Use `open` to start or reuse a session, and `goto` to navigate the current selected page to a new URL.

## Standard attach loop

```bash
brwsr open https://example.com
brwsr info
brwsr goto https://example.org
brwsr --page-url <url-fragment> click-text 'Login'
brwsr --page-url <url-fragment> click-selector 'button[type="submit"]'
brwsr --page-url <url-fragment> fill-selector 'input[name="email"]' 'user@example.com'
brwsr --page-url <url-fragment> eval "location.href"
brwsr --page-url <url-fragment> screenshot current-page.png
```

Commands should detach cleanly after each run. The helper does not own the browser session.

## Reattach to a debugger-owned browser

Use this pattern when a VS Code launch config or another tool already started the browser and the agent needs to hop back into that same session:

```bash
brwsr info
brwsr --page-url <url-fragment> eval "location.href"
brwsr --page-url <url-fragment> click-selector '<selector>'
```

Prefer the existing debug-owned tab instead of opening a fresh page unless the task explicitly needs one.

## Attach to your persistent browser

```bash
brwsr info
brwsr eval "location.href"
brwsr screenshot current-page.png
```

The browser stays alive until the user closes it, so cookies, localStorage, tabs, and auth state persist across turns.

## Login

```bash
brwsr --page-url /login fill-selector 'input[name="email"]' 'user@example.com'
brwsr --page-url /login fill-selector 'input[name="password"]' 'password123'
brwsr --page-url /login click-text Login
brwsr info
brwsr eval "location.href"
```

## Cart and checkout

```bash
brwsr click-selector 'button[aria-label="Cart DropDown"]'
brwsr click-selector '[data-test="checkoutButton"]'
brwsr goto http://127.0.0.1:4300/#/checkout/store/RENCQjIwMjU
```

## Checkout form

```bash
brwsr fill-selector 'input[placeholder="Name"]' 'LeBron James'
brwsr fill-selector 'input[placeholder="Street Address"]' '23 Main Street'
brwsr fill-selector 'input[placeholder="City"]' 'Albany'
brwsr fill-selector 'input[placeholder="State"]' 'New York'
brwsr fill-selector 'input[placeholder="Postal Code"]' '12204'
brwsr click-selector 'body'
brwsr eval "document.body.innerText"
```

## Address verification

```bash
brwsr click-text 'Use This Suggestion'
brwsr screenshot address-suggestion-accepted.png
```

## Payment and Adyen

```bash
brwsr eval "Array.from(document.querySelectorAll('[class*=\\\"adyen\\\"],[id*=\\\"adyen\\\"],iframe[src*=\\\"adyen\\\"]')).length"
brwsr screenshot payment-panel.png
```

## Stubborn transitions

```bash
brwsr eval "(async () => { document.querySelector('#method-details [data-test=\"validCustomerContinue\"]')?.click(); await new Promise(r => setTimeout(r, 2000)); return location.href; })()"
```

## Selector timeout

```bash
brwsr info
brwsr --page-url <url-fragment> screenshot selector-timeout.png
brwsr --page-url <url-fragment> eval "Array.from(document.querySelectorAll('input,button')).map((el, index) => ({ index, tag: el.tagName, text: el.textContent?.trim() || '', name: el.getAttribute('name'), id: el.id, placeholder: el.getAttribute('placeholder') }))"
brwsr --page-url <url-fragment> click-selector '<real-selector>'
```

## Notes

- Take screenshots after major state changes or when helper output and visible state disagree.
- `open` defaults to headed mode. Use `--headless` only when you explicitly want headless behavior.
- `screenshot` writes to `<os tmpdir>/.br0wser/`; pass only a filename (optional), and all output filenames get `-<timestamp>-<hash>` appended.
- If a click prints success but the page seems unchanged, verify with `info` or `eval "location.href"`.
- If a click appears to stall, a breakpoint may have been set.
- If a repeated label such as `Checkout` or `Continue` is ambiguous, switch to `click-selector`.
- If a required field still looks empty after `fill-selector`, read the value back with `eval` and blur the page with `click-selector 'body'`.
- Prefer a dedicated `--user-data-dir` when launching your own browser.
