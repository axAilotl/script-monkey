#!/bin/sh
set -eu
# One-time local helper installer. Does not run a daemon or change Codex login.
release=v0.1.2
install_dir="${SCRIPT_MONKEY_INSTALL_DIR:-$HOME/.local/share/script-monkey}"
for executable in curl unzip node; do
  if ! command -v "$executable" >/dev/null 2>&1; then
    echo "Script Monkey needs $executable. Install it, then run this command again." >&2
    exit 1
  fi
done
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) { console.error("Script Monkey needs Node.js 22 or newer."); process.exit(1); }'
task_tmp=$(mktemp -d)
trap 'rm -rf "$task_tmp"' EXIT HUP INT TERM
curl -fsSL "https://github.com/axAilotl/script-monkey/releases/download/$release/script-monkey-0.1.2.zip" -o "$task_tmp/release.zip"
unzip -q "$task_tmp/release.zip" -d "$task_tmp"
mkdir -p "$install_dir"
cp -R "$task_tmp/script-monkey/." "$install_dir/"
node "$install_dir/scripts/setup.mjs" "$@"
echo 'Local helper installed. Return to Script Monkey → Settings → Check setup again.'
