import { test } from "node:test";
import assert from "node:assert/strict";
import { fileTab, execArgv } from "../mods/files-tabs/match.js";

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

test("%F and %U only as arguments of their own", () => {
  assert.equal(execArgv("app --files=%F", "/p/a.md"), null);
  assert.deepEqual(execArgv("app --file=%f", "/p/a.md"), ["app", "--file=/p/a.md"]);
});
