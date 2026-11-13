import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IS_TEXT, tabName, viewCommand, keepsTree, linkFile, EDIT, LAUNCH, editorName } from "../mods/files-tabs/match.js";

test("tab names: relative to the space's folder, else ~/, else absolute", () => {
  assert.equal(tabName("/p/a/src/main.py", "/p/a", "/home/u"), "src/main.py");
  assert.equal(tabName("/p/a/src/main.py", "/p/a/", "/home/u"), "src/main.py");
  assert.equal(tabName("/home/u/notes.md", "/p/a", "/home/u"), "~/notes.md");
  assert.equal(tabName("/etc/hosts", "/p/a", "/home/u"), "/etc/hosts");
  assert.equal(tabName("/etc/hosts", "/", "/home/u"), "etc/hosts");
  assert.equal(tabName("/p/ab/x", "/p/a", null), "/p/ab/x", "a sibling folder sharing a prefix is not inside");
  assert.equal(tabName("/home/u/x", null, null), "/home/u/x");
});

test("viewCommand selects the named tab of the file, else makes a viewer tab", () => {
  const space = { id: "s", folder: "/p", tabs: [{ id: "a", name: "1", named: false }, { id: "b", name: "src/main.py", named: true }, { id: "c", name: "1" }] };
  assert.deepEqual(viewCommand(space, "/p/src/main.py", "/h", null), ["tab.select", { id: "b" }]);
  assert.deepEqual(viewCommand(space, "/p/1", "/h", null), ["tab.select", { id: "c" }], "herdr-app ls has no `named`: its tabs match by name");
  assert.deepEqual(viewCommand(space, "/p/README.md", "/h", "box"),
    ["tab.new", { name: "README.md", space: "s", mod: "files-tabs", props: { file: "/p/README.md", on: "box" } }]);
  assert.equal(viewCommand(undefined, "/p/a", "/h", null)[0], "tab.new");
});

test("with panes, only a tab holding this mod's pane is reused", () => {
  const space = { id: "s", folder: "/p", tabs: [{ id: "b", name: "a.md", named: true }] };
  assert.equal(viewCommand(space, "/p/a.md", null, null, [{ tab: "b", terminal: "t1" }])[0], "tab.new", "a terminal tab of that name");
  assert.deepEqual(viewCommand(space, "/p/a.md", null, null, [{ tab: "b", terminal: "t1" }, { tab: "b", mod: "files-tabs" }]), ["tab.select", { id: "b" }]);
});

test("the tree keeps its folder for a focused viewer only within the same space", () => {
  const last = { cwd: "/p/a", on: null, space: "A" }, viewer = { pane: "p1", mod: "files-tabs" }, term = { pane: "p2", terminal: "t1" };
  assert.equal(keepsTree(viewer, last, "A"), true);
  assert.equal(keepsTree(viewer, last, "B"), false, "switched to another space: follow it");
  assert.equal(keepsTree(term, last, "A"), false);
  assert.equal(keepsTree(viewer, undefined, "A"), false);
  assert.equal(keepsTree(null, last, "A"), false);
});

test("linkFile: file URLs, absolute and ~/ paths; other links are not ours", () => {
  const none = () => false;
  assert.equal(linkFile("/p/a b.md", "/home/u", none), "/p/a b.md");
  assert.equal(linkFile("file:///p/a%20b.md", "/home/u", none), "/p/a b.md");
  assert.equal(linkFile("file://localhost/p/x", "/home/u", none), "/p/x");
  assert.equal(linkFile("file://other/p/x", "/home/u", none), null);
  assert.equal(linkFile("file:///p/%zz", "/home/u", none), null);
  assert.equal(linkFile("~/notes.md", "/home/u", none), "/home/u/notes.md");
  for (const l of ["https://x.dev/a.md", "mailto:a@b", "src/main.py", "./a.md", "", "~user/x"])
    assert.equal(linkFile(l, "/home/u", none), null, l);
});

test("linkFile drops :line and :line:col only when the bare path is the file", () => {
  const files = new Set(["/p/main.py", "/p/odd:12"]), exists = f => files.has(f);
  assert.equal(linkFile("/p/main.py:12", "/h", exists), "/p/main.py");
  assert.equal(linkFile("/p/main.py:12:5", "/h", exists), "/p/main.py");
  assert.equal(linkFile("/p/odd:12", "/h", exists), "/p/odd:12");
  assert.equal(linkFile("/p/gone.py:3", "/h", exists), "/p/gone.py:3");
});

test("IS_TEXT: text and empty files pass; binaries, folders and missing files don't", () => {
  const dir = mkdtempSync(join(tmpdir(), "files-tabs-")), is = name => spawnSync("sh", ["-c", IS_TEXT, "t", join(dir, name)]).status === 0;
  writeFileSync(join(dir, "a.py"), "print('привет')\n");
  writeFileSync(join(dir, "empty"), "");
  writeFileSync(join(dir, "newlines"), "\n\n");
  writeFileSync(join(dir, "bin"), Buffer.from([0x89, 0x50, 0x00, 0x47]));
  mkdirSync(join(dir, "folder"));
  assert.ok(is("a.py") && is("empty") && is("newlines"));
  assert.ok(!is("bin") && !is("folder") && !is("missing"));
});

test("EDIT runs $EDITOR's words with the file as one argument, never as shell code", () => {
  const dir = mkdtempSync(join(tmpdir(), "files-tabs-")), f = join(dir, "a b $(touch pwned);.md");
  const edit = editor => spawnSync("sh", ["-c", EDIT, "t", f], { cwd: dir, encoding: "utf8", env: { ...process.env, EDITOR: editor } });
  assert.equal(edit("printf [%s] --wait").stdout, `[--wait][${f}]`);
  assert.equal(edit(`printf '<%s>' "two words"`).stdout, `<two words><${f}>`);
  assert.ok(!existsSync(join(dir, "pwned")), "the file's name was run as shell code");
});

// LAUNCH as Edit runs it, with TMPDIR of its own to check it cleans up. spawnSync waits for
// exec's pipes to close, so a detached editor holding them would show as a slow launch.
function launch(editor, file = "/p/a.md") {
  const tmp = mkdtempSync(join(tmpdir(), "files-tabs-launch-")), start = Date.now();
  const r = spawnSync("sh", ["-c", LAUNCH, "t", EDIT, file], { encoding: "utf8", timeout: 10000, env: { ...process.env, EDITOR: editor, TMPDIR: tmp } });
  return { ...r, ms: Date.now() - start, tmp };
}

test("LAUNCH reports an editor that fails within 3 s, with its stderr, else its stdout", () => {
  const missing = launch("no-such-editor-files-tabs --wait");
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /no-such-editor-files-tabs.*not found/);
  const syntax = launch("zed 'unbalanced");
  assert.equal(syntax.status, 1);
  assert.notEqual(syntax.stdout.trim(), "");
  const vim = launch(`sh -c 'printf "\\033[?1049h"; echo "Input is not from a terminal" >&2; exit 1' vim`);
  assert.deepEqual([vim.status, vim.stdout], [1, "Input is not from a terminal\n"], "stderr wins over stdout's escapes");
  const micro = launch(`sh -c 'echo "Fatal: Micro could not initialize a Screen."' micro`);
  assert.deepEqual([micro.status, micro.stdout], [1, "Fatal: Micro could not initialize a Screen.\n"], "exit 0 after printing to stdout is a failure");
  const quiet = launch("sh -c 'exit 3'");
  assert.deepEqual([quiet.status, quiet.stdout], [1, "exited with 3\n"]);
  for (const r of [missing, syntax, vim, micro, quiet]) {
    assert.ok(r.ms < 2500, `reported after ${r.ms} ms`);
    assert.deepEqual(readdirSync(r.tmp), [], "its temp folder is gone");
  }
});

test("LAUNCH: an editor that quits silently, or chatters on stderr, opened the file", () => {
  for (const editor of ["true", "sh -c 'echo Gtk-WARNING >&2'"]) {
    const r = launch(editor);
    assert.deepEqual([r.status, r.stdout], [0, ""], editor);
    assert.ok(r.ms < 2500, `${editor}: took ${r.ms} ms`);
    assert.deepEqual(readdirSync(r.tmp), []);
  }
});

test("LAUNCH leaves a running editor detached, with the file as one argument", async () => {
  const dir = mkdtempSync(join(tmpdir(), "files-tabs-")), f = join(dir, "a b $(touch pwned);.md"), marker = join(dir, "marker");
  const r = launch(`sh -c 'sleep 4; printf %s "$1" > "$0"' '${marker}'`, f);
  assert.deepEqual([r.status, r.stdout], [0, ""]);
  assert.ok(r.ms >= 2900 && r.ms < 3900, `watched it for ${r.ms} ms, not until it quit`);
  assert.deepEqual(readdirSync(r.tmp), []);
  for (let i = 0; i < 40 && !existsSync(marker); i++) await new Promise(ok => setTimeout(ok, 100));
  assert.equal(readFileSync(marker, "utf8"), f);
  assert.ok(!existsSync(join(dir, "pwned")));
  assert.deepEqual(readdirSync(r.tmp), [], "the editor quitting late writes nothing back");
});

test("the Edit button names $EDITOR's command", () => {
  assert.equal(editorName("zed --wait"), "zed");
  assert.equal(editorName(" /usr/bin/micro\n"), "micro");
});
