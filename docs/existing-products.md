# Existing products related to Script Monkey

Research date: 2026-10-01. This is a focused comparison of primary product documentation, not an exhaustive market survey or hands-on product test. Vendor claims are identified as such; unmentioned functionality is unknown, not absent.

## Finding

Several products already cover natural-language website customization. Local-agent support is also available. The proposed combination worth investigating is a Codex-controlled sidebar that works with the user's existing manager and maintains ordinary disk-backed projects with reliable revision and test history. That combination has not been established as unique.

## Closest matches

| Product | Documented overlap | Difference or unanswered question |
| --- | --- | --- |
| [Tweeks](https://www.tweeks.io/) | Describe changes, generate and install userscripts, revise through follow-up requests, import `.user.js` scripts, inspect/edit source; its own manager | Does it operate on scripts still installed in Tampermonkey, or require importing them? Continuous ordinary-file history and recoverable conversation backup were not established |
| [Customaise](https://customaise.com/) | Userscripts, version history, local MCP access for Codex and other agents; vendor describes page inspection, generation, live validation, and AI edits to existing scripts | Its comparison describes importing a Tampermonkey library into Customaise. Direct management of an existing Tampermonkey installation and ordinary disk backup were not established |
| [Shaper](https://getshaper.app/) | Browser sidebar, current-page context, natural-language visual/functional changes, API keys, persistent changes, and export | A local Codex integration and full read/write integration with another installed manager were not established |
| [Epupp](https://github.com/PEZ/epupp) | Open-source live page inspection/modification through editor or agent access, persistent scripts, export/import, and filesystem synchronization | Uses Scittle/ClojureScript and an nREPL workflow; not the same beginner-facing JavaScript/userscript-manager sidebar experience |
| [ClickRemix](https://clickremix.com/) | Prompt-generated CSS/JavaScript changes, live preview, source editing, and per-site persistence | More focused on styling and small features; local-agent and external-manager integration were not established |

## Evidence and implications

### Tweeks

The product's own comparison says it generates and installs scripts from page context, supports follow-up edits, exposes source, and imports Tampermonkey/Greasemonkey `.user.js` files. Those are claims about its own userscript manager, rather than evidence of controlling another manager's installed library. [Official comparison, updated July 12, 2026](https://web.nextbyte.ai/blog/tweeks-vs-tampermonkey)

Its April 15 changelog documents `@tweeks/mcp`, a local bridge for browser automation and script management, including Codex among supported clients. Therefore “use your own local agent” is already covered by a direct competitor. Its current homepage also mentions MCP among advanced features. [Official changelog](https://web.nextbyte.ai/changelog/2026-04-15-changelog), [homepage](https://www.tweeks.io/)

### Customaise

Its homepage describes versioned script editing and a local MCP server for Codex and other clients. Its comparison says the agent can inspect the page, write scripts, validate against the live tab, and edit existing scripts. It also advertises encrypted sync for scripts, conversations, and script values. These are vendor descriptions, not compatibility or recovery results verified here. [Homepage](https://customaise.com/), [official comparison](https://customaise.com/compare/tampermonkey)

This is a close technical competitor. The distinction to verify is in-place operation on an existing Tampermonkey library and file-backed recovery, rather than generic local-agent access or version history.

### Shaper

Its first-party site explicitly describes an AI sidebar that reads the current page, persistent site changes, bringing an API key, and exporting edits or standalone extensions. It is a close user-experience match. Export support alone does not establish automatic disk-backed revision history. [Official product site](https://getshaper.app/)

### Epupp

Its source repository describes live editor/agent access to pages, persistent scripts, a development panel, and export/import. It documents nREPL setup and links a filesystem synchronization API. This shows that the live inspect/edit/test feedback loop already exists in a more technical workflow. [Official repository](https://github.com/PEZ/epupp)

### ClickRemix

Its site describes generating CSS and JavaScript from requests, previewing, editing code, and saving changes by site. Saved changes use browser storage/sync. It is an adjacent customization product; the pages inspected do not establish the broader existing-manager or local-agent workflow. [Official product site](https://clickremix.com/)

## What to compare before building

Run the same concrete task through Tweeks and Customaise, then through the official Tampermonkey bridge:

1. Add a shortcut to a nested menu using Codex and current-page observations.
2. Extend a script that is already installed in Tampermonkey without migrating its execution to a different manager.
3. Reopen the conversation after browser restart, identify the exact installed revision, and make a follow-up edit.
4. Detect an edit made outside the agent before replacing source.
5. Restore source revisions and project context from ordinary files after losing extension storage.
6. Separate source restoration from restoration of script values and page-side effects.

These comparisons are planned, not performed. The strongest product direction is likely an integration and maintenance tool for existing userscript users. Whether a new extension is necessary should follow the evidence from these tasks.
