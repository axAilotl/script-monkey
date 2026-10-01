# Initial release validation

Date: October 1, 2026. Linux; Chromium 152.0.7977.82; Codex CLI 0.158.0.

- `npm run check` passed: TypeScript, all 16 regression tests, and bundled builds.
- Disk persistence tests restart the workspace, export and restore complete source history/conversation, detect corrupt revision checksums, and reject invalid paths/source before creating a project.
- Controller tests check external-edit conflicts, exact readback failures, restoring a draft without changing installed code, and immutable localhost install artifacts.
- Native messaging tests cover fragmented input and large Unicode responses below Chrome's per-frame size limit.
- Codex transport tests use a subprocess fixture to cover client inspection, thread resume, and cancellation.
- The actual bundled official Tampermonkey MCP process is paired to a simulated Editors WebSocket in the manager test. It exercises list/get/patch and timestamp conflict responses. This does **not** verify the live Tampermonkey+Editors browser combination.
- The built extension was loaded in an isolated Chromium profile and its sidebar visually inspected. A native-host registration in that temporary profile connected successfully to the real companion and existing Codex login. The normal browser profile was not modified.
- `SCRIPT_MONKEY_MODEL=gpt-5.5 npm run smoke:codex` completed a real inference using the existing Codex account, called the dynamic inspection tool, and generated the nested-menu shortcut. The initial CLI-configured model was unsupported with its authentication mode; model selection now provides an override without changing global configuration.

- The real Codex-generated shortcut was installed through Violentmonkey 2.49.0 MV3 in an isolated, headed Chromium 152 profile. The button reached the hidden export control, repeated clicks produced no duplicate control, and reload preserved working behavior. The fixture uses `@include` with its exact localhost port.

The opt-in browser check is `SCRIPT_MONKEY_VM=/path/to/extracted/Violentmonkey-mv3-v2.49.0 node scripts/smoke-browser.mjs` after the Codex smoke. It uses a temporary browser profile, a controlled localhost page, and a normal browser window. Set `SCRIPT_MONKEY_HEADLESS=1` to try headless mode; that mode has not passed this manager check. It requires a Chromium executable, default `/usr/bin/chromium`, overridable with `SCRIPT_MONKEY_CHROMIUM`.

Remaining limits: live Tampermonkey/Editors integration, macOS setup, broad website compatibility, navigation/SPA behavior beyond the fixture, and automatic behavior testing in the product are not verified claims. Source readback does not prove requested page behavior.
