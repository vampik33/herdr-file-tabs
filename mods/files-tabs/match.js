// The tab in `space` this mod opened for `path` (relative to `root`) that still runs it: named
// after the path, with a non-shell terminal whose folder is `root` (where the tab was started).
// A same-named tab opened from another folder holds another file, so it doesn't match.
export function fileTab(space, panes, path, root) {
  return space?.tabs.find(t => t.named && t.name === path
    && panes.some(p => p.tab === t.id && p.terminal && !p.program.shell && p.cwd === root));
}

// A desktop entry's Exec line as argv, with the file in place of its %f/%F/%u/%U code
// (appended when there is none); %i, %c and %k are dropped and %% is %. Null when a code sits
// inside a quoted argument or %F/%U isn't an argument of its own, which the spec leaves
// undefined: `sh -c "micro %f"` would run the file's name as shell code.
export function execArgv(line, file) {
  const words = [];
  let word = null, quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') quoted = false;
      else if (c === "%" && /[fFuUick]/.test(line[i + 1] ?? "")) return null;
      else word += c === "\\" && i + 1 < line.length ? line[++i] : c;
    } else if (c === '"') { quoted = true; word ??= ""; }
    else if (c === " " || c === "\t") { if (word !== null) words.push(word); word = null; }
    else word = (word ?? "") + c;
  }
  if (word !== null) words.push(word);
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
