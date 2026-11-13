// Pure helpers shared by the mod and bin/open.mjs (Herdr's Ctrl+click), tested by tests/.

export const MOD = "files-tabs";

// sh script: exits 0 when $1 is a regular file with no NUL byte in its first buffer
// (GNU grep's binary check), or empty. In the C locale only NUL makes a file binary.
export const IS_TEXT = 'test -f "$1" && { [ ! -s "$1" ] || LC_ALL=C grep -qI "" "$1"; }';

// A viewer tab's name: the file's path relative to the space's folder, else ~/..., else as is.
// The Files panel and Ctrl+click name the same file alike, so either finds the other's tab.
export function tabName(file, folder, home) {
  const under = root => {
    if (!root) return null;
    const base = root.replace(/\/+$/, "") + "/";
    return file.startsWith(base) && file.length > base.length ? file.slice(base.length) : null;
  };
  const inFolder = under(folder);
  if (inFolder !== null) return inFolder;
  const inHome = under(home);
  return inHome !== null ? `~/${inHome}` : file;
}

// Opening `file` in a viewer in `space`, as [command, args]: select the tab named after it,
// else make one. Someone named that tab (`named` is absent in `herdr-app ls`), and with
// `panes` (`herdr-app ls` lists none) this mod has a pane in it.
export function viewCommand(space, file, home, on, panes) {
  const name = tabName(file, space?.folder, home);
  const tab = space?.tabs.find(t => t.name === name && t.named !== false
    && (!panes || panes.some(p => p.tab === t.id && p.mod === MOD)));
  return tab ? ["tab.select", { id: tab.id }] : ["tab.new", { name, space: space?.id, mod: MOD, props: { file, on } }];
}

// Whether the tree keeps `last` (where it pointed): the focused pane is a mod pane, which has no
// folder, and `last` is in the shown space. Another space's tree would open files in that space.
export function keepsTree(pane, last, space) {
  return Boolean(pane?.mod && last && last.space === space);
}

// The local file a Ctrl+clicked link names, as an absolute path: a file:// URL, an absolute or
// ~/ path, with a :line or :line:column suffix dropped when only the path without it exists.
// Null for anything else (other URLs, relative paths), which goes to the system's xdg-open.
export function linkFile(link, home, exists) {
  let path = null;
  if (/^file:/i.test(link)) {
    try {
      const url = new URL(link);
      if (url.host === "" || url.host === "localhost") path = decodeURIComponent(url.pathname);
    } catch { return null; }
  } else if (link.startsWith("/")) path = link;
  else if (link.startsWith("~/") && home) path = `${home.replace(/\/+$/, "")}/${link.slice(2)}`;
  if (!path) return null;
  const bare = path.replace(/(:\d+){1,2}$/, "");
  return bare !== path && !exists(path) && exists(bare) ? bare : path;
}

// sh script: opens file $1 in $EDITOR the way git does, as shell words, so quotes and options
// in it work (`zed --wait`); the file stays one argument and is never run as shell code.
export const EDIT = 'eval "exec $EDITOR \\"\\$1\\""';

// sh script: runs launcher $1 (EDIT) on file $2 in a session of its own, detached, and watches
// it for 3 s, since `setsid -f` alone exits 0 before the editor has even started. Exits 1 and
// prints why (its first 500 bytes, and that $EDITOR must be a GUI editor after a terminal
// complaint) when by then the editor quit with an error, or with a terminal complaint on stdout:
// micro without one prints "open /dev/tty: …" and exits 0. Still running, or quit otherwise
// (`zed` handing the file to an open window), is success. The detached processes hold none of
// exec's pipes, and the editor's output can't pile up in the temp folder however long it runs:
// stdout keeps its first 4 KiB and drains the rest, and stderr, a file emptied every 10 s,
// can't be a pipe: vim with no terminal reads commands from it and would wait forever. It's
// emptied until stdout closes, so also while a process the editor started holds both. The
// detached shell removes the folder once the editor has quit and the watch has read it.
export const LAUNCH = String.raw`d=$(mktemp -d) || exit
setsid -f sh -c '
keep() { head -c 4096 >"$1"; cat >/dev/null; }
{ while sleep 10; do : >"$3/err"; done; } >/dev/null 2>&1 &
t=$!
{ sh -c "$1" files-tabs "$2" </dev/null 2>>"$3/err"; echo $? >"$3/c"; } | keep "$3/out"
kill "$t"
mv "$3/c" "$3/code"
i=0
while [ ! -e "$3/read" ] && [ "$i" -lt 50 ]; do sleep 0.1; i=$((i + 1)); done
rm -rf "$3"' files-tabs "$1" "$2" "$d" </dev/null >/dev/null 2>&1 || { c=$?; rm -rf "$d"; echo "setsid exited with $c"; exit 1; }
i=0
while [ ! -e "$d/code" ] && [ "$i" -lt 30 ]; do sleep 0.1; i=$((i + 1)); done
s=0
if [ -e "$d/code" ]; then
  code=$(cat "$d/code")
  if [ "$code" != 0 ] || grep -qiE '/dev/tty|terminal' "$d/out"; then
    s=1
    if [ -s "$d/err" ]; then head -c 500 "$d/err"; elif [ -s "$d/out" ]; then head -c 500 "$d/out"; else echo "exited with $code"; fi
    if grep -qiE '/dev/tty|terminal' "$d/out" "$d/err"; then printf '\n%s\n' '$EDITOR runs in its own window, without a terminal: it must be a GUI editor.'; fi
  fi
fi
: >"$d/read"
exit "$s"`;

// The button's name for an $EDITOR value: its command's base name (`zed --wait` -> zed).
export function editorName(editor) {
  return editor.trim().split(/\s+/)[0].split("/").pop();
}
