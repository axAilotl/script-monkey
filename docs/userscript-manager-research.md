# Userscript manager integration research

Researched 2026-10-01. Planning only: documentation, source inspection, and a downloaded extension archive; no extension or package was installed and no integration was exercised in a browser.

## Findings that change the plan

Tampermonkey now provides an official MCP integration. This makes reading and updating existing scripts a supported integration path, provided the user installs Tampermonkey Editors and pairs it with a local MCP server. Stable creation support is a separate question: the official MCP documentation requires Tampermonkey 5.6+ for `put` and `delete`, while the Chrome store currently lists 5.5.0. [Official MCP instructions](https://github.com/Tampermonkey/tampermonkey-mcp/blob/67b5a06861c9ea48c373194a8c2e095e846f5ce6/README.md), [Chrome store version](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)

Violentmonkey's external editing workflow remains useful, and its Chrome distribution is now MV3. It is a file/localhost tracking workflow, not equivalent to an API for listing and reading its complete library. [Official distribution page](https://violentmonkey.github.io/get-it/), [external editing guide](https://violentmonkey.github.io/posts/how-to-edit-scripts-with-your-favorite-editor/)

Greasemonkey itself is a Firefox extension, so it is outside the first Chrome release. “Greasemonkey-compatible userscript” is not the same thing as the Greasemonkey manager. [Official Greasespot definition](https://wiki.greasespot.net/Greasemonkey)

## Capability matrix

These are documented or source-supported capabilities, not results of runtime testing.

| Capability | Tampermonkey, Chrome stable 5.5.0 | Violentmonkey, Chrome stable 2.49.0 | Greasemonkey 4.14 |
| --- | --- | --- | --- |
| Chrome availability | Yes, current MV3 distribution | Yes, current MV3 distribution | Firefox only |
| New script installation | `.user.js` URL/file or dashboard; manager installation flow | `.user.js` URL/file opens installer; user confirms | `.user.js` installer in Firefox |
| List/read existing library | Official MCP + Editors integration | Export/import or user copies a script; no external library API in inspected source | Backup/import in Firefox; no external library API in inspected source |
| Update existing script programmatically | MCP `patch`, with modification timestamp | File/localhost tracking after user enables it and while installer stays open | Normal updater/editor; no comparable external tracking workflow established |
| Create/delete programmatically | MCP advertises operations but documents TM 5.6+ requirement; do not promise on 5.5 | No external create/delete API in inspected source | No external create/delete API in inspected source |
| Local external editor | Current stable changelog adds disk change tracking; older `@require file:` and TamperDAV approaches also documented | Explicit local file or localhost tracking; optional matched-page reload | No current equivalent verified |
| Disk export/restore | ZIP backup/restore | ZIP includes scripts/settings and optional script values | ZIP backup/import |
| Reliable install acknowledgement to our extension | MCP readback can verify source after install; no generic installation callback established | No external acknowledgement established; verify observed page behavior | Deferred with Firefox |

Distribution/version evidence: [Tampermonkey store](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo), [Tampermonkey 5.5 changelog](https://www.tampermonkey.net/changelog.php), [Violentmonkey store](https://chromewebstore.google.com/detail/violentmonkey/jinjaccalgkegednnccohejagnlnfdag), [Greasemonkey 4.14 manifest](https://github.com/greasemonkey/greasemonkey/blob/6080f9161d8f87780a1fc652e8418f9fd4627974/manifest.json). Detailed integration evidence follows.

## Tampermonkey: strongest candidate for existing-script integration

### Supported route and installation boundary

Use the official bridge: local MCP process → local WebSocket → Tampermonkey Editors → Tampermonkey. Initial setup requires a connection code entered by the user in Editors. Tampermonkey's stable changelog explicitly says MCP requires Editors and a user action to enable it. [Stable changelog](https://www.tampermonkey.net/changelog.php)

For new scripts on the stable baseline, plan a manager installation handoff followed by library readback. The FAQ documents opening `.user.js` URLs and creating scripts in the dashboard. Keep manager confirmation in the user journey; this research does not establish a supported way to bypass it. [Installation FAQ](https://www.tampermonkey.net/faq.php?q=Q102)

Version-gate creation instead of trusting MCP tool presence. A July 2026 report in the official Editors repository says TM 5.5.0 accepts `options/list/get/patch` but rejects `put/delete` with 405. This is a reporter's observation, not an independently reproduced test. The official README independently specifies TM 5.6+ and Editors 1.0.6+ for creation/deletion. [Reported limitation](https://github.com/Tampermonkey/tampermonkey-editors/issues/21), [version requirements](https://github.com/Tampermonkey/tampermonkey-mcp/blob/67b5a06861c9ea48c373194a8c2e095e846f5ce6/README.md)

The beta changelog currently lists 5.6.6242, September 29, 2026. It introduces an inline installer because Chrome 152+ no longer handles `.user.js` URLs. Treat ordinary URL installation as browser/version-dependent and test the actual target combination before making it the only fallback. [Beta changelog](https://www.tampermonkey.net/changelog.php?show=gcal)

### Identity, reads, updates, and conflict handling

List responses include `name`, `namespace`, `path`, `requires`, and optionally a storage path. Get accepts a script/resource path and returns source plus `lastModified`; source paths use a script UUID, e.g. `<script-uuid>/source`. Patch replaces content and accepts `lastModified` for optimistic locking. Preserve the returned manager identity rather than identifying scripts only by visible name. Snapshot the original source and timestamp before each update, then read back the result. These last two sentences are design recommendations. [External protocol types](https://github.com/Tampermonkey/tampermonkey-editors/blob/af6dcba5218aeb197f7a74ffb6a8b79111fa41e8/src/types/external.ts), [MCP tool implementation](https://github.com/Tampermonkey/tampermonkey-mcp/blob/67b5a06861c9ea48c373194a8c2e095e846f5ce6/src/mcp/server/tampermonkey.ts)

The MCP tools wrap responses as text: `get` appends a formatted modification time to source, and `patch` emits a success sentence or error JSON. Do not save an entire MCP text response as script source. Use an adapter that normalizes responses, checks backend errors, and distinguishes readback success from successful page execution. [MCP tool implementation](https://github.com/Tampermonkey/tampermonkey-mcp/blob/67b5a06861c9ea48c373194a8c2e095e846f5ce6/src/mcp/server/tampermonkey.ts)

### Why our extension should use the bridge

Editors connects to known manager IDs with `runtime.connect`, requests `userscripts/options`, and checks that `allow` contains `list`. Its relay forwards a fixed set of actions, but does not retain and enforce the whole returned capability list. Therefore the relay accepting an action does not prove the manager supports it. [Discovery code](https://github.com/Tampermonkey/tampermonkey-editors/blob/af6dcba5218aeb197f7a74ffb6a8b79111fa41e8/src/background/find_tm.ts), [relay code](https://github.com/Tampermonkey/tampermonkey-editors/blob/af6dcba5218aeb197f7a74ffb6a8b79111fa41e8/src/background/index.ts)

Direct access from an arbitrary Script Monkey extension ID is not established. The official Editors development instructions modify an ID in Tampermonkey's packaged background script before testing an unpacked Editors build. This supports using the recognized Editors bridge rather than assuming our extension can call the manager directly. [Official development instructions](https://github.com/Tampermonkey/tampermonkey-editors/blob/af6dcba5218aeb197f7a74ffb6a8b79111fa41e8/README.md)

Additional artifact evidence, carefully scoped: the official `tampermonkey_stable.crx` download examined on October 1 contains TM **5.4.1**, not the store's 5.5.0. That sample has an explicit sender-ID allowlist containing the official Editors IDs and returns 405 for put/delete. Its absence of `externally_connectable` is not the reason arbitrary access fails; the handler's allowlist is. This sample corroborates the development instructions but is not proof of every current TM build. Source URL: [official downloadable archive](https://www.tampermonkey.net/crx/tampermonkey_stable.crx). Sample `background.js` SHA256: `0514363b47446a60cb7e4ac83dc2e64ab8219c1f73ea55d81aa092de6bb38596`.

### Local transport limitations

The current MCP WebSocket server binds `localhost`, uses a random port and pairing handshake, waits up to 30 seconds for a command response, and replaces its existing client when another connects. Both authentication characters are single base36 characters generated with `Math.random`; this is a very small token space. This is concrete source evidence, not a general assessment of all MCP servers. Before shipping, evaluate origin checks, connection access, session ownership, and whether the upstream bridge is suitable for the product's local threat model. [WebSocket implementation](https://github.com/Tampermonkey/tampermonkey-mcp/blob/67b5a06861c9ea48c373194a8c2e095e846f5ce6/src/mcp/server/tampermonkey-ws-client.ts)

Chrome execution permission is another setup step: TM 5.3+ requires Allow User Scripts (Chrome 138+) or Developer Mode. A stored script is not necessarily an executing script. [Official permission FAQ](https://www.tampermonkey.net/faq.php?q=Q209)

## Violentmonkey: supported external editing, narrower library access

The official workflow is: copy existing source or prepare a new file, open it in the installer, and click Track external edits. Sources can be a dragged local `.user.js` or `http://localhost:<port>/<name>.user.js`. The installer must remain open for tracking. It can optionally reload a matching website after changes. File URL access is required for the toolbar/file URL method; the guide offers drag-to-manager UI and localhost alternatives. [Official guide](https://violentmonkey.github.io/posts/how-to-edit-scripts-with-your-favorite-editor/)

The 2.49.0 installer implements this explicitly: initial installation calls internal `ParseScript`; tracking reads new content and installs it using the remembered script ID. Without that ID, reinstall detection compares name and namespace. Preserve identity metadata during updates to avoid inadvertently creating another customization. [Pinned installer source](https://github.com/violentmonkey/violentmonkey/blob/07c159d3c2333567ce73056a453ef8c3f847d490/src/confirm/views/app.vue)

In the inspected 2.49.0 source, manager commands are served through internal `runtime.onMessage` and `onUserScriptMessage`, and privileged commands check the sender's manager extension context. The source does not register an external extension management receiver. Its manifest/build logic also does not add one. This supports the scoped conclusion **no supported arbitrary-extension list/read/write integration identified in 2.49.0**, not a universal claim that integration can never exist. [Message dispatch](https://github.com/violentmonkey/violentmonkey/blob/07c159d3c2333567ce73056a453ef8c3f847d490/src/background/index.js), [MV3 build manifest](https://github.com/violentmonkey/violentmonkey/blob/07c159d3c2333567ce73056a453ef8c3f847d490/scripts/manifest-helper.js), [command registration](https://github.com/violentmonkey/violentmonkey/blob/07c159d3c2333567ce73056a453ef8c3f847d490/src/background/utils/init.js)

ZIP export produces individual `.user.js` files plus settings/custom configuration, and optionally script values. Import understands its backup format and Tampermonkey backup components. These offer a user-mediated route to an existing library. Reading exported code is different from live access to the manager. [Export source](https://github.com/violentmonkey/violentmonkey/blob/07c159d3c2333567ce73056a453ef8c3f847d490/src/options/views/tab-settings/vm-export.vue), [import source](https://github.com/violentmonkey/violentmonkey/blob/07c159d3c2333567ce73056a453ef8c3f847d490/src/options/views/tab-settings/vm-import.vue)

## Greasemonkey: defer to Firefox support

The inspected 4.14 source has an internal message dispatcher that restricts non-GM-API messages to its own extension pages. Its install dialog requires the Install button; its backup export and ZIP import are implemented in manager pages/background code. No external manager API was identified in this inspected release. [Internal dispatch](https://github.com/greasemonkey/greasemonkey/blob/6080f9161d8f87780a1fc652e8418f9fd4627974/src/bg/on-message.js), [installer](https://github.com/greasemonkey/greasemonkey/blob/6080f9161d8f87780a1fc652e8418f9fd4627974/src/content/install-dialog.js), [export](https://github.com/greasemonkey/greasemonkey/blob/6080f9161d8f87780a1fc652e8418f9fd4627974/src/bg/export-db.js), [import](https://github.com/greasemonkey/greasemonkey/blob/6080f9161d8f87780a1fc652e8418f9fd4627974/src/content/backup/import.js)

## Recommendation and validation gates

Start with Tampermonkey + official Editors/MCP for library reads and updates. Keep new installation user-confirmed on stable 5.5, then establish manager identity by list/get and exact source readback. Treat create/delete as optional versioned capabilities. Offer Violentmonkey through imported existing source and explicit external tracking, with clear tracking state and page behavior checks.

Before implementation, define the adapter contract around operations actually available: discover, list, read, install handoff, update, readback, and optional create/delete. Keep installation, stored revision, and successful execution as separate states. Disk history must be committed before a manager update; an installer opening or a reload is not proof of installation.

The first later feasibility experiment should establish: pairing on store builds; list/get/patch conflict behavior; a confirmed new installation and UUID discovery; exact code readback; one visible page change; rollback; browser restart/reconnection; tracking-tab closure behavior; current Chrome and future installer compatibility. Other unresolved points are beta creation behavior, settings/enable-state coverage, UUID changes on rename/reinstall, and resource/storage update permissions. These were not tested during this research.

Source snapshots: Tampermonkey MCP `67b5a06861c9ea48c373194a8c2e095e846f5ce6` (main, 2026-07-13); Editors `af6dcba5218aeb197f7a74ffb6a8b79111fa41e8` (main, 2026-07-13); Violentmonkey release tag v2.49.0 `07c159d3c2333567ce73056a453ef8c3f847d490` (2026-09-06), also checked current master `7f9ec14863e721c57413fefa0a82f0909c8642bb` (2026-09-29); Greasemonkey tag 4.14/master `6080f9161d8f87780a1fc652e8418f9fd4627974` (2026-06-02). Default branch source and store builds can differ; the report does not claim they are byte-identical.
