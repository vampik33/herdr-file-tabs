// bin/xdg-open end to end, with a stub `herdr-app` CLI that logs what it's asked to do and a
// parent process named herdr-app (a copy of sh) standing in for Herdr's Ctrl+click.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, copyFileSync, chmodSync, readFileSync, existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const WRAPPER = join(dirname(fileURLToPath(import.meta.url)), "../mods/files-tabs/bin/xdg-open");

function setup(tabs = []) {
  const dir = mkdtempSync(join(tmpdir(), "files-tabs-open-")), stub = join(dir, "stub"), parent = join(dir, "parent");
  mkdirSync(stub); mkdirSync(parent); mkdirSync(join(dir, "proj"));
  const ls = { spaces: [{ id: "s0", folder: "/elsewhere", active: false, tabs: [] }, { id: "s1", folder: join(dir, "proj"), active: true, tabs }] };
  writeFileSync(join(dir, "ls.json"), JSON.stringify(ls));
  writeFileSync(join(stub, "herdr-app"), `#!/bin/sh\nif [ "$1" = ls ]; then cat '${dir}/ls.json'; else shift; printf '%s\\n' "$*" >> '${dir}/do.log'; fi\n`);
  chmodSync(join(stub, "herdr-app"), 0o755);
  copyFileSync(realpathSync("/bin/sh"), join(parent, "herdr-app"));
  chmodSync(join(parent, "herdr-app"), 0o755);
  writeFileSync(join(dir, "proj", "main.py"), "print('hi')\n");
  writeFileSync(join(dir, "proj", "logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]));
  // Bare environment: the real xdg-open finds no desktop and no window to open, only text fallbacks.
  const env = { PATH: `${stub}:${dirname(process.execPath)}:/usr/bin:/bin`, HOME: dir };
  const run = (link, viaHerdr = true) => {
    const r = viaHerdr
      ? spawnSync(join(parent, "herdr-app"), ["-c", '"$0" "$1"; exit $?', WRAPPER, link], { env, encoding: "utf8", timeout: 10000 })
      : spawnSync(WRAPPER, [link], { env, encoding: "utf8", timeout: 10000 });
    return { ...r, did: existsSync(join(dir, "do.log")) ? readFileSync(join(dir, "do.log"), "utf8").trim() : "" };
  };
  return { dir, run };
}

test("Herdr's Ctrl+click on a text file opens a viewer tab named after it", () => {
  const { dir, run } = setup(), file = join(dir, "proj", "main.py");
  const r = run(`${file}:12`);
  assert.equal(r.status, 0, r.stderr);
  const [command, json] = [r.did.split(" ")[0], r.did.slice(r.did.indexOf(" ") + 1)];
  assert.equal(command, "tab.new");
  assert.deepEqual(JSON.parse(json), { name: "main.py", space: "s1", mod: "files-tabs", props: { file, on: null } });
});

test("a file:// link to a file already in a tab selects that tab", () => {
  const { dir, run } = setup([{ id: "t9", name: "main.py" }]);
  const r = run(`file://${join(dir, "proj", "main.py")}`);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.did, 'tab.select {"id":"t9"}');
});

test("binaries and other links go to the system's xdg-open", () => {
  const { dir, run } = setup();
  assert.equal(run(join(dir, "proj", "logo.png")).did, "");
  const v = run("--version");
  assert.equal(v.did, "");
  assert.match(v.stdout, /^xdg-open \d/, "the real xdg-open answered");
});

test("other callers of xdg-open get the system's, even for text files", () => {
  const { dir, run } = setup();
  assert.equal(run(join(dir, "proj", "main.py"), false).did, "");
  assert.match(run("--version", false).stdout, /^xdg-open \d/);
});
