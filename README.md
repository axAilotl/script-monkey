# Script Monkey

A proposed Chrome sidebar that connects to Codex CLI, builds and maintains website customizations through existing userscript managers, and retains recoverable project history on disk.

Status: research and planning, October 1, 2026. No application implementation or live integration testing yet.

- [Implementation plan](docs/implementation-plan.md): Codex integration, manager adapters, disk persistence, verification, and implementation sequence.
- [Userscript manager research](docs/userscript-manager-research.md): Tampermonkey, Violentmonkey, and Greasemonkey capabilities with primary-source evidence.
- [Existing products](docs/existing-products.md): Tweeks, Customaise, Shaper, Epupp, and ClickRemix, plus requirements to compare before building.

The leading integration candidate is Tampermonkey's official Editors/MCP bridge for reading and updating existing scripts. New-script creation is version-dependent. The first future milestone is a complete install, inspect, edit, and rollback loop under the real manager.
