# Browser automation without taking focus

Keep the current headed default. Add an optional headed background mode so an agent can work while the user uses another app, with an explicit handoff for login and shared browsing.

## Behavior

- `--background` opts into headed background behavior on macOS. Reject it with `--headless`, with `focus`, and on unsupported platforms instead of silently taking focus
- Launch a separate Chrome app through `open -g -n` with a dedicated data directory, no startup window, and the background rendering flags from the attached note
- Treat `open` exit 0 as a successful handoff, reject launch errors/nonzero exits with stderr, and wait for CDP with a deadline. Never fall back to a focus-taking launch
- Resolve the app bundle from the configured Chrome executable or Playwright Chromium executable. Report unsupported executable layouts clearly
- Connect over CDP after launch, verify named profiles before creating or navigating pages, then create the first page with `Target.createTarget` using `background: true` and `newWindow: true`
- Match a newly created Playwright page to the returned target ID, rather than taking the next page event from any client
- Inspect current and subsequently available pages within a deadline using `Target.getTargetInfo`, detach temporary CDP sessions, and handle pages available before target creation returns
- Reuse selected existing pages with the existing `open` semantics. Background mode does not move windows behind the user, minimize them, or force them out of focus
- `focus` explicitly brings the selected headed page forward for user interaction, including with a named profile. The agent pauses during the handoff and can resume on the same session
- Verify ownership before activation, reject running headless sessions, and prove the connected process becomes frontmost. Start with `page.bringToFront()` and add PID-specific macOS activation only if required by the real check
- Keep browser sessions alive between CLI commands. Launch-only flags cannot change an already running browser, including switching headless to headed
- Treat background mode as avoiding intentional activation during launch and page creation. Do not promise that site popups or native OS dialogs cannot take focus
- Keep Playwright's existing focus emulation. Do not add persistent session settings, automatic sleep prevention, or one new window on every navigation

## TODO

- [x] Secure Codex 6.1 Sol xhigh reviews this plan for real functional problems. Resolve objections before implementation
- [x] Implement option validation, background app launch, target-matched page creation, and the focus command
- [x] Update README, bundled skill, CLI reference, and handoff workflow with examples and limits
- [x] Add meaningful CLI regressions and real Chrome functional coverage for background launch, reconnect, interactions, page creation, profile mismatch, and handoff
- [ ] Verify actual macOS frontmost application during launch and ordinary interactions while another app stays active. Keep this separate from DOM focus assertions
- [ ] Run syntax checks, existing tests, and the browser integration suite. Tests may launch and close only their own browser sessions
- [x] Run `npm run version:update` and verify the local CLI reports the bumped version. Use npm link only if useful
- [x] Get a secure-account implementation review at 6.1 Sol high. Fix real issues, rerun affected checks, and avoid loops over stylistic nits
- [ ] Record verification results, commit completed work locally, and leave a clean branch. Never push

## Validation notes

Use an isolated profile and port for functional checks. Test current default headed and headless behavior as well as background mode. Exercise navigation, fill, click, screenshots, reconnect without extra windows, and explicit user handoff. A browser DOM reporting focus does not prove that macOS left the user's app in front.

Background browser tests need an app-bundle fixture that preserves the existing mock-keychain isolation. A bare shell wrapper is intentionally unsupported by bundle resolution. Cover both Playwright Chromium app layouts, competing page creation with duplicate blank URLs, and mismatched-profile `focus` without target or focus changes. Preserve the current direct launcher for default headed/headless commands and ensure background launches without named profiles continue through CDP page creation.

Plan review: secure reviewer conditionally approved with the launch lifecycle, OS activation acceptance check, compatible app fixture, target matching, and profile ordering corrections above. Parent agrees and incorporated all conditions before implementation. No remaining plan objections.

Validation: syntax checks, all 10 existing non-browser tests, and all 3 existing real Chrome integration tests pass. The secure test agent also ran the new CLI tests: 8 passed and 1 platform-specific test skipped. Version bumped to 0.1.5 using the package script, linked locally, and confirmed with `br0wser --version`.

Secure implementation review found one issue: cleanup of a CDP session could fail when a competing page closed during target matching. The cleanup now tolerates a closed page while retaining errors for live pages. Syntax checks pass after the fix. A regression covering closure during inspection remains to be run.

Real background/focus verification is unfinished. The first background launch attempts exceeded the endpoint deadline, then their browsers started later. Both owned test browsers were closed after profile ownership verification. The headed focus assertion found macOS `loginwindow` in front. The headless rejection check passed. The browser fixture now refuses to begin foreground checks on a locked desktop. Investigate launch timing and complete the background suite on an unlocked desktop before treating the feature as fully verified.

User requested stopping while remote, then requested committing this checkpoint. No further GUI tests were run. Remaining unchecked steps are follow-up work after the desktop is available.
