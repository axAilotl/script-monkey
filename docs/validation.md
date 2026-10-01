# Initial release validation

Date: October 1, 2026. Linux; Chromium 152.0.7977.82; Codex CLI 0.158.0.

- `npm run check` passed: TypeScript, bundled builds, and all 16 regression tests. The build runs before tests because the manager transport test uses the actual bundled relay.
- Disk persistence tests restart the workspace, export and restore complete source history/conversation, detect corrupt revision checksums, and reject invalid paths/source before creating a project.
- Controller tests check external-edit conflicts, exact readback failures, restoring a draft without changing installed code, and immutable localhost install artifacts.
- Native messaging tests cover fragmented input and large Unicode responses below Chrome's per-frame size limit.
- Codex transport tests use a subprocess fixture to cover client inspection, thread resume, and cancellation.
- The actual bundled official Tampermonkey MCP process is paired to a simulated Editors WebSocket in the manager test. It exercises list/get/patch and timestamp conflict responses. This does **not** verify the live Tampermonkey+Editors browser combination.
- The standalone release ZIP was extracted outside the source repository and connected successfully without project `node_modules`.
- The built extension was loaded in an isolated Chromium profile and its sidebar visually inspected. A native-host registration in that temporary profile connected successfully to the real companion and existing Codex login. The normal browser profile was not modified.
- `SCRIPT_MONKEY_MODEL=gpt-5.5 npm run smoke:codex` completed a real inference using the existing Codex account, called the dynamic inspection tool, and generated the nested-menu shortcut. The initial CLI-configured model was unsupported with its authentication mode; model selection now provides an override without changing global configuration.

- The real Codex-generated shortcut was installed through Violentmonkey 2.49.0 MV3 in an isolated, headed Chromium 152 profile. The button reached the hidden export control, repeated clicks produced no duplicate control, and reload preserved working behavior. The fixture uses `@include` with its exact localhost port.

The opt-in browser check is `SCRIPT_MONKEY_VM=/path/to/extracted/Violentmonkey-mv3-v2.49.0 node scripts/smoke-browser.mjs` after the Codex smoke. It uses a temporary browser profile, a controlled localhost page, and a normal browser window. Set `SCRIPT_MONKEY_HEADLESS=1` to try headless mode; that mode has not passed this manager check. It requires a Chromium executable, default `/usr/bin/chromium`, overridable with `SCRIPT_MONKEY_CHROMIUM`.

Remaining limits: live Tampermonkey/Editors integration, macOS setup, broad website compatibility, navigation/SPA behavior beyond the fixture, and automatic behavior testing in the product are not verified claims. Source readback does not prove requested page behavior.


## v0.1.1 usability and connection repair

The original browser test opened the extension document as a tab and tested the native transport. It did not catch sidebar access without an activeTab grant or the setup friction from loading only the unpacked extension. Those were real product failures.

`node tests/browser/sidebar.mjs` first reproduced the exact inspection error on an ordinary active website: “Open a regular website and click the extension icon.” The original manifest lacked persistent page access, so the active tab could have no readable URL. The fix uses tabs metadata and HTTP/HTTPS host permissions, automatic page detection, and document-bound inspection. Chrome's internal pages and Web Store remain restricted. [Chrome activeTab documentation](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)

The browser regression now checks automatic inspection, a visible prompt at 400×600, in-product instructions for a missing helper, preserving typed messages through setup, switching between protected and regular pages, automatic native connection, generation through the real companion with a controlled Codex subprocess, disk persistence, and panel reopening. It is included in GitHub CI.

The native helper was missing from the user's Chromium configuration. It is now registered there, with absolute Node/Codex executable paths; the restoration ledger was updated locally. A separate setup regression verifies it works with a browser PATH that excludes the terminal's Codex directory.

A real sidebar task subsequently completed using the existing Codex login, requested fresh live DOM through its tool, and produced a saved script. The previously configured model was not in Codex's advertised list; the sidebar selected an advertised model without altering global CLI configuration. Model preferences remain editable in Settings.

Chat keeps its composer visible; settings and pairing are in Settings, source/install controls in Scripts. The toolbar callback uses `sidePanel.open` instead of automatic toggling; Chrome controls its built-in pin state. The actual toolbar click in the user's running browser could not be automated because no browser surface was connected. A reload of the existing unpacked extension is required to activate changed code and permissions. [Chrome sidePanel documentation](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)

`npm run check` passes all 17 regression tests, typechecking, and bundled builds. Native connection and the full UI task were validated separately. Live Tampermonkey+Editors pairing and macOS remain unverified; setup now explicitly explains the additional Editors requirement.

## v0.1.2 live Codex activity

The adapter previously replaced every agent-message delta with a generic “Codex is writing the script” notice. The sidebar had no activity timeline, and completion switched away from Chat. `npx tsx --test --test-name-pattern 'relays commentary' tests/codex.test.ts` reproduced the loss with “Actual Codex commentary was discarded.” The browser regression then timed out waiting for that commentary in the conversation.

Codex messages now retain their item identity and phase so commentary cannot corrupt the structured final draft. The helper relays commentary, public summaries, plans, page inspections and results, command output when used, and progressively decoded source. Raw reasoning content is excluded. Source updates are rate limited; previews scroll separately and collapse after completion. Completed activity is saved in the disk-backed conversation and reappears when the panel reopens. Code remains in immutable revisions.

`npm run check` passes all 18 tests. The browser regression verifies visible messages and page-read results while a turn is running, streaming source before completion, cancellation, a visible input, completion remaining in Chat, honest draft/install status, exact source served to the installer, returning to the original website on reload, and activity surviving panel reopening. `node scripts/smoke-live-sidebar.mjs` also passed with the existing real Codex login and a controlled localhost page, asserting that real page-tool activity and generated source appeared in the conversation.

This validates visibility and handoff, not arbitrary generated script behavior. A manager installation can succeed while generated code has a bug. No existing personal script was overwritten in this change. Live toolbar use in the user's running browser and live Tampermonkey+Editors pairing remain unverified.
