import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IS_TEXT, tabName, viewCommand, keepsTree, linkFile, execArgv } from "../mods/files-tabs/match.js";

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

test("Exec lines become argv with the file in place of its field code", () => {
  const f = "/p q/$(touch x);.md";
  assert.deepEqual(execArgv("micro %F", f), ["micro", f]);
  assert.deepEqual(execArgv("kate -b %U", f), ["kate", "-b", f]);
  assert.deepEqual(execArgv("vim", f), ["vim", f]);
  assert.deepEqual(execArgv('"/opt/My App/bin" --x=%f %i %%', f), ["/opt/My App/bin", `--x=${f}`, "%"]);
  assert.deepEqual(execArgv('sh -c "echo \\"hi\\""', f), ["sh", "-c", 'echo "hi"', f]);
});

test("a field code inside a quoted argument is refused, not run as shell code", () => {
  assert.equal(execArgv('sh -c "micro %f"', "/p/$(touch x).md"), null);
  assert.equal(execArgv('bash -c "vim %U"', "/p/a.md"), null);
  assert.equal(execArgv('sh -c "echo 100%%"', "/p/a.md")?.[2], "echo 100%");
});

test("a field code in a word with a quoted part is refused too", () => {
  const f = "/p/$(touch x).md";
  assert.equal(execArgv('sh -c "micro "%f', f), null, "code right after the quotes");
  assert.equal(execArgv('sh -c "micro \\%f"', f), null, "escaped % inside the quotes");
  assert.equal(execArgv('sh -c "vim \\\\"%f\\\\""', f), null, "spec-escaped backslash before the quote");
  assert.equal(execArgv('sh -c "micro %\\f"', f), null, "escaped letter of the code");
  assert.equal(execArgv('sh -c "a%"f', f), null, "code split by the closing quote");
  assert.equal(execArgv('sh -c "micro \\%f', f), null, "unterminated quote");
  assert.deepEqual(execArgv('"/opt/My App/bin" --x=%f', f), ["/opt/My App/bin", `--x=${f}`]);
});

test("%F and %U only as arguments of their own", () => {
  assert.equal(execArgv("app --files=%F", "/p/a.md"), null);
  assert.deepEqual(execArgv("app --file=%f", "/p/a.md"), ["app", "--file=/p/a.md"]);
});
