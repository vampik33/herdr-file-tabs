import { test } from "node:test";
import assert from "node:assert/strict";
import { fileTab } from "../mods/files-tabs/match.js";

const editor = { shell: false }, shell = { shell: true };
const space = tabs => ({ tabs });
const tab = (id, name, named = true) => ({ id, name, named });
const pane = (tab, cwd, program = editor, terminal = "t1") => ({ tab, cwd, program, terminal });

test("selects the tab running a program on the same file", () => {
  const s = space([tab("a", "README.md")]);
  assert.equal(fileTab(s, [pane("a", "/p/a")], "README.md", "/p/a")?.id, "a");
});

test("a same-named tab opened from another folder is not reused", () => {
  const s = space([tab("a", "README.md")]);
  assert.equal(fileTab(s, [pane("a", "/p/a")], "README.md", "/p/b"), undefined);
});

test("picks the matching folder among same-named tabs", () => {
  const s = space([tab("a", "README.md"), tab("b", "README.md")]);
  assert.equal(fileTab(s, [pane("a", "/p/a"), pane("b", "/p/b")], "README.md", "/p/b")?.id, "b");
});

test("a tab back at its shell is not reused", () => {
  const s = space([tab("a", "README.md")]);
  assert.equal(fileTab(s, [pane("a", "/p/a", shell)], "README.md", "/p/a"), undefined);
});

test("unnamed tabs and mod panes are not reused", () => {
  assert.equal(fileTab(space([tab("a", "README.md", false)]), [pane("a", "/p/a")], "README.md", "/p/a"), undefined);
  assert.equal(fileTab(space([tab("a", "README.md")]), [pane("a", null, editor, null)], "README.md", "/p/a"), undefined);
});

test("no space", () => {
  assert.equal(fileTab(undefined, [], "README.md", "/p/a"), undefined);
});
