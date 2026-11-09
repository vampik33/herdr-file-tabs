// Herdr's Ctrl+click, from bin/xdg-open: opens text file argv[2] in a viewer tab of the shown
// space, or selects the tab already showing it. Exits nonzero, opening nothing, for any other
// link; bin/xdg-open then hands it to the system's xdg-open.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { MOD, IS_TEXT, viewCommand, linkFile } from "../match.js";

const file = linkFile(process.argv[2] ?? "", homedir(), existsSync);
if (!file) process.exit(1);
if (spawnSync("sh", ["-c", IS_TEXT, MOD, file]).status !== 0) process.exit(1);
const space = JSON.parse(execFileSync("herdr-app", ["ls"], { encoding: "utf8" })).spaces.find(s => s.active);
if (!space) process.exit(1);
const [command, args] = viewCommand(space, file, homedir(), null);
execFileSync("herdr-app", ["do", command, JSON.stringify(args)], { stdio: "ignore" });
