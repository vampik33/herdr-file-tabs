// Herdr's Files panel, except a click on a text file opens it in a tab of its own: this mod
// again, with props { file, on }, as a read-only viewer (rendered Markdown, or highlighted
// code) whose Edit button opens the file in $EDITOR, in its own window. Other files open in
// their default desktop app via xdg-open. bin/xdg-open does the same for Herdr's Ctrl+click.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState, TextView } from "gpui-base";
import { spaces, panes, focused, props, exec, readTextFile, watchFolder, theme, settings, home, window, run, notify } from "herdr";
import { MOD, IS_TEXT, EDIT, LAUNCH, tabName, viewCommand, keepsTree, editorName } from "./match.js";

const LANG = { ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js", toml: "yaml", jsonc: "json", svelte: "html", vue: "html" };
const MAX_TEXT = 400000, RECHECK_MS = 2000;

// Where the tree points: the focused terminal's folder. A focused mod pane (a viewer tab) has
// none, so with `last` (where it pointed in this space) the tree stays there.
function location(last) {
  const space = spaces().find(s => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  if (keepsTree(pane, last, space?.id)) return last;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on, space: space?.id };
}
const key = last => JSON.stringify(location(last));
const PER_FOLDER = 500, TOTAL = 5000;

async function directory(path, on) {
  const windowsDirectory = async () => {
    // Windows PowerShell otherwise uses the console code page; exec decodes UTF-8.
    // Links keep directory attributes even when dangling; check their target.
    // Other reparse points (OneDrive's folders) have no LinkType and are folders.
    // PowerShell reads curly single quotes as quotes too, so they're doubled like '.
    const r = await exec("powershell", ["-NoProfile", "-Command", "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); & { param($p) @(Get-ChildItem -LiteralPath $p -Force -ErrorAction Stop | Where-Object Name -ne '.git' | Select-Object -First 501 | ForEach-Object { @{ name=$_.Name; dir=($_.PSIsContainer -and (-not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -or -not $_.LinkType -or ($_.Target -and [IO.Directory]::Exists(([IO.Path]::Combine([IO.Path]::GetDirectoryName($_.FullName), $_.Target[0])))))) } }) | ConvertTo-Json -Compress } '" + path.replace(/['‘’‚‛]/g, "$&$&") + "'"], { on });
    if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
    const result = JSON.parse(r.stdout || "[]");
    return Array.isArray(result) ? result : [result];
  };
  if (!on && window()?.platform === "windows") return windowsDirectory();
  const script = 'n=0; for p in "$1"/* "$1"/.[!.]* "$1"/..?*; do [ -e "$p" ] || [ -L "$p" ] || continue; name=${p##*/}; [ "$name" = .git ] && continue; if [ -d "$p" ]; then kind=d; else kind=f; fi; printf "%s\\0%s\\0" "$kind" "$name"; n=$((n+1)); [ "$n" -gt 500 ] && break; done; test -d "$1"';
  let r;
  try { r = await exec("sh", ["-c", script, "files", path], { on }); }
  catch (e) {
    if (on && String(e).includes("cannot start sh: program not found")) return windowsDirectory();
    throw e;
  }
  if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
  const fields = r.stdout.split("\0"), out = [];
  for (let i = 0; i + 1 < fields.length; i += 2) out.push({ name: fields[i + 1], dir: fields[i] === "d" });
  return out;
}

// A viewer tab: the file read-only, reloaded when it changes on disk; Edit opens it in $EDITOR.
class FileView {
  constructor({ file, on }) {
    this.file = file; this.on = on ?? null; this.markdown = /\.(md|markdown)$/i.test(file);
    this.stamp = null; this.checking = false; this.text = null; this.code = null; this.error = null; this.editor = null;
  }

  start(cx) {
    this.check(cx);
    cx.timer.every(RECHECK_MS, cx => this.check(cx));
    if (!this.on) cx.spawn(async cx => {
      const r = await exec("sh", ["-c", 'printf %s "$EDITOR"']).catch(() => null);
      this.editor = r?.stdout.trim() ? editorName(r.stdout) : null;
      cx.notify();
    });
  }

  // Reloads when the file's mtime, size or inode changed. Where stat fails (gone, or no GNU
  // stat on another machine) the file is read once, and the read says whether it's there.
  check(cx) {
    if (this.checking) return;
    this.checking = true;
    cx.spawn(async cx => {
      try {
        const r = await exec("stat", ["-L", "-c", "%.9Y %s %i", this.file], { on: this.on });
        const stamp = r.code === 0 ? r.stdout.trim() : "unknown";
        if (stamp === this.stamp) return;
        this.stamp = stamp;
        await this.load();
        cx.notify();
      } catch (e) { this.error = String(e); this.stamp = null; cx.notify(); }
      finally { this.checking = false; }
    });
  }

  async load() {
    const text = await readTextFile(this.file, { on: this.on });
    if (text === null) { this.error = "This file is no longer available"; return; }
    if (text.includes("\0")) { this.error = "Binary file · no text view"; return; }
    this.error = null;
    this.text = text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) + "\n… (file truncated)" : text;
    if (this.markdown) return;
    if (this.code) { this.code.set_value(this.text); return; }
    const t = theme(), ext = this.file.includes(".") ? this.file.split(".").pop() : "txt";
    this.code = EditorState.new({ language: LANG[ext] ?? ext, readonly: true, value: this.text,
      font_family: settings().font_family, font_size: 12,
      syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 } });
  }

  // LAUNCH: the editor gets its own window and outlives this call (`zed --wait` waits), and
  // one that fails within 3 s (not on PATH, or a terminal editor with no terminal) is reported.
  edit(cx) {
    cx.spawn(async () => {
      const fail = body => notify({ title: `Can't open ${this.editor}`, body, level: "error" });
      try {
        const r = await exec("sh", ["-c", LAUNCH, MOD, EDIT, this.file]);
        if (r.code !== 0) fail(`${(r.stdout || r.stderr).trim().slice(0, 500) || `exited with ${r.code}`}\n$EDITOR runs in its own window, without a terminal: it must be a GUI editor.`);
      } catch (e) { fail(String(e)); }
    });
  }

  close() { this.code?.release(); }

  render() {
    const t = theme();
    return v_flex().id("file-view").size_full().min_h(0).bg(t.background).text_color(t.foreground).text_size(13)
      .child(h_flex().h(36).flex_none().px(12).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.dim).child(tabName(this.file, null, this.on ? null : home())))
        .when(Boolean(this.editor), el => el.child(h_flex().id("file-edit").h(24).px(10).flex_none().items_center().rounded(6).cursor_pointer()
          .border_1().border_color(t.border).text_size(12).hover(s => s.bg(t.hover)).on_click((_e, cx) => this.edit(cx)).child(`Edit in ${this.editor}`))))
      .child(this.error ? div().p(12).text_color(t.dim).child(this.error)
        : this.text === null ? div().p(12).text_color(t.dim).child("Loading file…")
        : this.markdown ? div().id("file-md").flex_1().min_h(0).overflow_y_scrollbar().px(20).py(12).child(TextView.markdown("file-md-text", this.text).selectable(true))
        : Editor.new(this.code).flex_1().min_h(0));
  }
}

// One mod, two jobs: with props.file a viewer tab (FileView), otherwise the Files panel.
export default class FilesTabs extends View {
  init(_props, cx) {
    // props(), not init's argument (empty for a mod tab), and only here: it names the copy whose turn it is.
    const p = props();
    if (p?.file) { this.view = new FileView(p); this.view.start(cx); return; }
    this.saved = new Map();
    this.entries = new Map(); this.folders = new Set(); this.pending = new Set(); this.marks = {};
    this.refresh(cx);
    cx.timer.every(10000, cx => this.refresh(cx));
  }

  async close() { this.view?.close(); }

  // A text file opens in a viewer tab named after it, or selects the space's tab of that name;
  // anything else opens in its default desktop app.
  open(path, cx) {
    const file = `${this.root}/${path}`, on = this.on;
    const [command, args] = viewCommand(spaces().find(s => s.active), file, on ? null : home(), on, panes());
    if (command === "tab.select") return run(command, args);
    const fail = body => notify({ title: `Can't open ${path}`, body, level: "error" });
    if (!on && window()?.platform !== "linux") return fail("Opening files works on Linux only");
    cx.spawn(async () => {
      try {
        const text = await exec("sh", ["-c", IS_TEXT, MOD, file], { on });
        if (text.code === 0) run(command, args);
        else if (on) fail(`Not a text file, and it's on ${on}`);
        else {
          // setsid -f: xdg-open can wait for the app; the app must outlive this call either way.
          const o = await exec("setsid", ["-f", "xdg-open", file]);
          if (o.code !== 0) fail(o.stderr || `xdg-open exited with ${o.code}`);
        }
      } catch (e) { fail(String(e)); }
    });
  }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    const context = this.context;
    cx.spawn(async cx => {
      try { while (this.context === context) { await watchFolder(root); if (this.current(context)) this.refresh(cx); } }
      catch { if (this.context === context) this.watched = null; }
    });
  }

  current(context) {
    return this.context === context && key(context.at) === context.key;
  }

  async loadFolder(path, context) {
    const { on, cwd: root } = context;
    const entries = await directory(path ? `${root}/${path}` : root, on);
    if (!this.current(context) || (path && !this.folders.has(path))) return;
    const used = [...this.entries.entries()].filter(([p]) => p !== path).reduce((n, [, e]) => n + e.length, 0);
    this.entries.set(path, entries.slice(0, Math.max(0, Math.min(PER_FOLDER, TOTAL - used))).sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name)));
    if (entries.length > PER_FOLDER || used + entries.length > TOTAL) this.limited = true;
  }

  refresh(cx) {
    const at = location(this.context?.at), { cwd, on } = at, next = JSON.stringify(at);
    if (next !== this.context?.key) {
      if (this.context) this.saved.set(this.context.key, this.folders);
      this.context = { key: next, cwd, on, at }; this.root = cwd; this.on = on; this.entries = new Map(); this.folders = new Set(this.saved.get(next));
      this.pending = new Set(); this.marks = {}; this.watched = null; this.error = null; this.limited = false;
      this.loading = false;
    }
    if (!cwd || this.loading) return;
    const context = this.context;
    this.loading = true;
    this.limited = false;
    cx.spawn(async cx => {
      try {
        for (const path of ["", ...this.folders]) {
          if (!this.current(context)) return;
          await this.loadFolder(path, context);
        }
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on }).catch(() => null);
        const marks = {};
        if (top?.code === 0) {
          // Writes nothing under .git (index lock, fsmonitor cookie): the folder watch would refresh again.
          const status = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"], { cwd, on }).catch(() => null);
          if (status?.code === 0) for (const entry of status.stdout.split("\0").filter(Boolean).slice(0, TOTAL)) {
            const xy = entry.slice(0, 2);
            marks[`${top.stdout.trim()}/${entry.slice(3)}`] = xy === "??" || xy.includes("A") ? "A" : xy.includes("U") ? "U" : xy.includes("D") ? "D" : "M";
          }
        }
        if (!this.current(context)) return;
        this.marks = marks; this.error = null; this.watch(cwd, cx);
      } catch (e) { if (this.current(context)) this.error = String(e); }
      finally { if (this.context === context) this.loading = false; cx.notify(); }
    });
  }

  toggle(path, cx) {
    if (this.folders.has(path)) {
      for (const folder of [...this.folders]) if (folder === path || folder.startsWith(path + "/")) {
        this.folders.delete(folder);
        this.entries.delete(folder);
      }
    } else {
      this.folders.add(path);
      if (!this.entries.has(path) && !this.pending.has(path)) {
        const context = this.context;
        this.pending.add(path);
        cx.spawn(async cx => {
          try { await this.loadFolder(path, context); }
          catch (e) { if (this.current(context)) this.error = String(e); }
          finally { if (this.context === context) this.pending.delete(path); cx.notify(); }
        });
      }
    }
    cx.notify();
  }

  rows(prefix, depth, out, t) {
    if (out.length >= TOTAL || depth > 40) return out;
    for (const entry of this.entries.get(prefix) ?? []) {
      if (out.length >= TOTAL) break;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name, open = this.folders.has(path), mark = this.marks[`${this.root}/${path}`];
      out.push(h_flex().id(`file-${path}`).h(28).flex_none().pl(8 + depth * 18).pr(8).gap(7).items_center().rounded(7).cursor_pointer().hover(s => s.bg(t.hover))
        .on_click((_e, cx) => entry.dir ? this.toggle(path, cx) : this.open(path, cx))
        .child(entry.dir ? svg(`mods/${MOD}/chevron-${open ? "down" : "right"}.svg`).size(12).flex_none().text_color(t.dim) : div().w(12).flex_none())
        .child(svg(`mods/${MOD}/${entry.dir ? "folder" : "file"}.svg`).size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().min_w(0).truncate().child(entry.name))
        .when(Boolean(mark), el => el.child(div().text_size(11).text_color(mark === "A" ? t.ansi2 : mark === "D" || mark === "U" ? t.ansi1 : t.blocked).child(mark))));
      if (entry.dir && open) this.rows(path, depth + 1, out, t);
    }
    return out;
  }

  render(cx) {
    if (this.view) return this.view.render();
    if (key(this.context?.at) !== this.context?.key) this.refresh(cx);
    const t = theme();
    return v_flex().id("files").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child("Files"))
        .child(div().flex_1().min_w(0).truncate().text_right().text_size(12).text_color(t.dim).child(this.root?.split(/[\\/]/).pop() ?? "")))
      .child(v_flex().id("files-tree").flex_1().min_h(0).overflow_y_scrollbar().p(6).children(this.rows("", 0, [], t))
        .when(Boolean(this.error) || !this.entries.get("")?.length, el => el.child(div().p(8).text_size(12).text_color(t.dim).child(this.error || (this.loading ? "Loading files…" : this.root ? "No files" : "No folder"))))
        .when(this.limited, el => el.child(div().p(8).text_size(11).text_color(t.dim).child("File list limited to 500 entries per folder and 5,000 total"))));
  }
}
