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

// A desktop entry's Exec line as argv, with the file in place of its %f/%F/%u/%U code
// (appended when there is none); %i, %c and %k are dropped and %% is %. Null when a code sits
// inside a quoted argument or %F/%U isn't an argument of its own, which the spec leaves
// undefined: `sh -c "micro %f"` would run the file's name as shell code.
export function execArgv(line, file) {
  // A word with any quoted part may not hold a field code at all, wherever the code ends up
  // in it: `"micro "%f` and `"micro \%f"` put the file inside a quoted argument too.
  const words = [];
  let word = null, quoted = false, hasQuote = false;
  const end = () => {
    if (word !== null && hasQuote && /%[fFuUick]/.test(word.replace(/%%/g, ""))) return false;
    if (word !== null) words.push(word);
    word = null; hasQuote = false;
    return true;
  };
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') quoted = false;
      else if (c === "%" && /[fFuUick]/.test(line[i + 1] ?? "")) return null;
      else word += c === "\\" && i + 1 < line.length ? line[++i] : c;
    } else if (c === '"') { quoted = true; hasQuote = true; word ??= ""; }
    else if (c === " " || c === "\t") { if (!end()) return null; }
    else word = (word ?? "") + c;
  }
  if (!end()) return null;
  let used = false;
  const argv = [];
  for (const w of words) {
    if (/^%[ick]$/.test(w)) continue;
    if (/%[FU]/.test(w.replace(/%%/g, "")) && !/^%[FU]$/.test(w)) return null;
    argv.push(w.replace(/%([fFuU%])/g, (_m, c) => {
      if (c === "%") return "%";
      used = true;
      return file;
    }));
  }
  if (!used) argv.push(file);
  return argv;
}
