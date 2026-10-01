# Initial product scope

The user wants an open-source Chrome sidebar connected to existing Codex CLI. It makes ordinary userscripts and manages their development through existing userscript managers.

- No Script Monkey login, SaaS backend, subscription, telemetry, or proprietary script ecosystem.
- Never execute generated source in this extension. The normal manager owns execution.
- Inspect live DOM, let Codex request targeted observations, produce a complete script, and show source/diff before explicit installation.
- Use official Tampermonkey Editors/MCP for listing, importing, conflict-aware updates, and exact source readback. New scripts use regular confirmation-based installation.
- Support Violentmonkey with portable source import and ordinary installer/editor handoff. Do not claim automatic library access.
- Keep immutable revisions, original imported source, conversation, Codex thread identity, and installation/test records on disk. Provide portable export/restore and rollback drafts.
- Preserve installed script identity and attribution. External manager edits stop an overwrite until source is refreshed.
- Bind agent inspection to the original tab/document, preventing tab switches or navigation from silently redirecting tasks.
- Preserve project context across page reloads and panel reopening. Saved drafts survive companion disconnection.
- Keep Chat focused on an always-visible input. Put connection, model, page access, and manager pairing controls in Settings. Detect the current page and local helper automatically; missing setup must show instructions inside the running sidebar.
- Distribute runnable source and packaged releases through GitHub with documented setup.

The first release uses manual behavior checks. Automated click testing, workflow recording, Firefox, Windows, and other providers are later work.
