# Script Monkey

A Chrome sidebar that uses your installed **Codex CLI** to build and maintain ordinary userscripts for **Tampermonkey and Violentmonkey**. MIT licensed. No Script Monkey account, subscription, hosted backend, or replacement script engine.

Your manager runs the scripts. The local companion keeps source, revisions, conversation, and test notes in real files. Codex uses its existing authentication; page observations go to the provider configured in Codex.

## Install

Requires Node.js 22+ and installed Codex CLI, a Chromium browser, and your normal userscript manager. Automatic setup supports Linux and macOS; development was verified on Linux with Chromium 152 and Codex CLI 0.158.0. macOS has not been tested.

Download and extract the ZIP from [Releases](https://github.com/axAilotl/script-monkey/releases). Keep the folder in a permanent location. From that folder:

```sh
node scripts/setup.mjs --browser chrome --workspace "$HOME/Script Monkey"
```

Use `--browser chromium`, `brave`, or `edge` as appropriate. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist/extension`. Pin Script Monkey, open a website, and click its icon. The sidebar finds your page and connects to Codex automatically. All setup instructions are in **Settings**, including a one-command helper installer. If Codex needs authentication, run `codex login` in your terminal. The model selector in Settings overrides the CLI model without changing your global configuration. If a ChatGPT login’s configured model is absent from Codex’s available list, the sidebar initially selects an advertised model and explains that choice.

Setup locates the terminal’s Codex executable and records its absolute path so Chrome does not depend on shell PATH. `--codex /absolute/path/to/codex` overrides detection. It registers a native messaging host restricted to this extension's stable ID. For custom browser profiles, pass `--host-dir /path/to/NativeMessagingHosts`. To unregister, run the same setup command with `--remove`; project files remain on disk.

## Use

1. Open a website and the sidebar. Regular HTTP/HTTPS pages are detected and read automatically; the input stays visible in Chat. Chrome’s internal pages and Web Store do not allow extension inspection.
2. Describe a change, such as “Add a top-right shortcut to the export menu.” Codex can request fresh DOM observations of that same document.
3. Review the saved draft, site matches, grants, and source changes in Scripts.
4. **Open install**, **Download .user.js**, or **Copy code** and complete your manager's confirmation screen.
5. **Reload & inspect**, try the behavior, and **Save test note**. Continue in the same project. History restores earlier source as a new draft.

Generated code is never evaluated by Script Monkey. Opening an installer does not count as installation; source verification and behavior checks are separate.

## Manager support

| Manager | This version |
| --- | --- |
| Tampermonkey | Read library/source, update with conflict detection, and verify exact source through the official Editors/MCP bridge. |
| Violentmonkey | Import `.user.js`, generate/edit on disk, and install/update through its normal installer or editor. No automatic library enumeration or source readback. |
| Greasemonkey | Portable source files, but Firefox sidebar integration is future work. |

For Tampermonkey, install [Tampermonkey Editors](https://chrome.google.com/webstore/detail/lieodnapokbjkkdkhdljlllmgkmdokcm), open **Settings → Tampermonkey integration**, choose **Get pairing code**, paste it into Editors, then **Check pairing**. The sidebar includes all three steps; this integration is optional for building new scripts. Keep the companion connected. Choose **Scripts → Read Tampermonkey scripts → Import / refresh source**. After reviewing a draft, **Update Tampermonkey** saves it and reads it back. If the manager source changed since import, refresh it before updating. For a newly installed script, **Check installed source** establishes its binding.

The companion bundles the [official MCP relay](https://github.com/Tampermonkey/tampermonkey-mcp). New scripts use regular manager confirmation; this release does not rely on newer MCP create/delete operations. Chrome 152 changed `.user.js` URL handling in some manager combinations: Download or Copy is the fallback. Violentmonkey can also track local development sources while its installer remains open. See [compatibility research](docs/userscript-manager-research.md).

## Files and recovery

Default workspace: `~/Script Monkey`.

```text
projects/<project-id>/
  project.json                 # revision pointers, Codex thread, manager binding
  current.user.js               # convenient current source
  revisions/<revision-id>.json   # immutable source, checksum, explanation
  conversation.jsonl            # requests, results, installation/test events
```

Deleting browser storage does not delete these files. **History → Export project** backs up source history and conversation. **Scripts → Restore project backup** makes a fresh project without reusing the old manager binding or Codex thread. Backups exclude Codex authentication files, but preserve user-authored source and notes as supplied.

Restoration creates a draft; apply/install it to change installed code. Upstream script updates may replace personal edits. Use one active companion session per workspace; disconnect before opening that workspace in another browser. Portable backups are limited to 32 MB, 1,000 revisions, and 5,000 events. For larger projects, copy the complete project folder. Damaged historical records remain on disk and are reported while intact source remains accessible.

## Development

```sh
npm ci
npm run check
npm run setup -- --browser chromium
npm run package
```

The package ZIP includes bundled companion dependencies and third-party notices. `npm run test:browser` reproduces page access, missing-helper instructions, a visible composer, UI generation through the companion, and panel reopening in temporary profiles. `node scripts/smoke-live-sidebar.mjs` performs one opt-in real Codex turn through the sidebar. `node scripts/smoke-native.mjs` checks the extension/native-host connection in a temporary profile. The opt-in `npm run smoke:codex` uses your existing Codex login for one real inference; `SCRIPT_MONKEY_MODEL` selects a model. `SCRIPT_MONKEY_CODEX` selects an executable.

This first version uses bounded DOM inspection and manual behavior checks. Click recording, screenshots, automatic browser interaction, API-key providers, Windows setup, and automatic Violentmonkey library access are not implemented. Codex dynamic tools use an experimental protocol.

- [Product scope](docs/product-scope.md)
- [Original implementation plan](docs/implementation-plan.md)
- [Manager research](docs/userscript-manager-research.md)
- [Existing products](docs/existing-products.md)
- [Validation](docs/validation.md)
