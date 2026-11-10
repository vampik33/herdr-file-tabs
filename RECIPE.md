# File tabs

Herdr's Files panel, except a click on a text file opens it in a tab of its own, in Herdr's read-only viewer: rendered Markdown, or highlighted code. The viewer's Edit button opens the file in a terminal editor such as micro beside it. Other files open in their default desktop app (Gwenview, a browser) in its own window. An optional `xdg-open` stand-in makes Ctrl+clicking a file path in terminal text do the same. This is a piece you put in your current layout in place of the shipped `files` mod, not a whole window. Linux only.

![File tabs](preview.png)

This file is the brief: enough to build File tabs from an empty folder. The files next to it are one build of it. If they don't work on your Herdr, or you want it different, build it again from here.

## What you see

- The panel looks like the shipped Files panel: a 42px header with "Files" (semibold) on the left and the current folder's name (12px, `dim`) on the right, then the tree. Rows are 28px, indented 18px per level, with a 12px chevron for folders, a 14px folder or file icon (`muted`), the name (13px, truncated) and a git mark on the right (11px: `A` in `ansi2`, `D`/`U` in `ansi1`, `M` in `blocked`). Rows highlight with `hover`. The panel has a 10px radius, a 1px `border` and the theme `background`. There is no back arrow and no preview inside the panel.
- A text file gets a tab named after its path relative to the space's folder (`src/main.py`), else `~/…` under the home folder, else its absolute path. The tab's only pane is the viewer: a 36px header with the file's path (12px, `dim`, `~/` for the home folder) and, on this computer when a terminal editor handles the file, an "Edit in micro" button (named after the editor's command; 24px, 6px radius, 1px `border`, `hover`); under it the file: Markdown (`.md`, `.markdown`) rendered with `TextView.markdown`, selectable, scrolling, 20px side padding; anything else in a read-only `Editor` (12px, the settings' font, syntax colors from the theme's ANSI colors as in the shipped Files preview). Files over 400,000 characters are cut there with "… (file truncated)".
- Edit opens the editor in a terminal pane to the right of the viewer.
- Failures show an error toast titled "Can't open <path>"; a viewer that can't show its file says why in place of it ("This file is no longer available", "Binary file · no text view").

## How it behaves

- The tree follows the focused terminal's live folder, as the shipped panel does: lazy folders, 500 entries per folder and 5,000 in total, `.git` hidden, git marks from `git status`, refreshed by a folder watch (local only) and every 10 seconds, expanded folders remembered per folder. While a mod pane (a viewer tab) is focused the tree stays where it was: a viewer has no folder, and falling back to the space's folder would move the tree away from the file just clicked.
- Clicking a folder expands or collapses it. Clicking a file:
  1. If the shown space has a tab named after the file (above), it's selected.
  2. Otherwise, on the file's machine: `test -f`, and empty or `LC_ALL=C grep -qI ""` (no NUL in the first buffer) means text. Text: `tab.new {name, space, mod: "files-tabs", props: {file, on}}`.
  3. Not text, on this computer: `setsid -f xdg-open <file>`, so the default desktop app gets its own window and outlives the call. In a space on another machine: an error toast.
- The viewer stats the file every 2 s (`stat -L -c '%.9Y %s %i'`, on its machine) and reads it again (`readTextFile`) when that changes, keeping the editor's state (`set_value`). Where `stat` fails it reads once, and the read says whether the file is there.
- Edit's editor: the first terminal app that can open the file. Type: `xdg-mime query filetype`. Candidates, in order: `xdg-mime query default <type>`, then the apps `LC_ALL=C gio mime <type>` prints (its default, registered and recommended lists, which include apps of parent types); if there are none and the type is `text/*`, the same for `text/plain`. Each candidate's desktop file is the first found in `$XDG_DATA_HOME/applications` and each `$XDG_DATA_DIRS/applications`; the first whose `[Desktop Entry]` section has `Terminal=true` and an `Exec=` wins. Its `Exec` line becomes argv with the file in place of `%f`/`%F`/`%u`/`%U` (appended when there is none), `%i`/`%c`/`%k` dropped and `%%` as `%`, double quotes and backslash escapes honoured. A field code anywhere in a word with a quoted part (`"micro "%f` too), or `%F`/`%U` not standing alone, makes the app unusable (no button): in `sh -c "micro %f"` the file's name would run as shell code. Then `pane.split {direction: "right", pane, argv}`, `pane` being this mod's pane in the focused tab.
- Ctrl+click: Herdr runs `xdg-open <link>` itself for a path Ctrl+clicked in terminal text. `bin/xdg-open`, linked as `~/.local/bin/xdg-open` (before `/usr/bin` in Herdr's `PATH`), checks its parent: when `/proc/$PPID/comm` is `herdr-app` and there's one argument, `node bin/open.mjs <link>` handles it; anything else, or open.mjs exiting nonzero, `exec /usr/bin/xdg-open "$@"`. open.mjs takes a `file:` URL (empty host or `localhost`), an absolute path or a `~/` path, and drops a `:line` or `:line:col` suffix when only the path without it exists; relative paths and other URLs exit 1. A text file (the same check) in the active space of `herdr-app ls` selects the tab of its name (`herdr-app do tab.select`) or opens one (`herdr-app do tab.new`, `on: null`).

## Built from

- **One mod**, `mods/files-tabs/`, with `main.js`, `match.js`, `mod.json` (`{ "place": "none" }`), `bin/xdg-open`, `bin/open.mjs` and the shipped Files icons `chevron-down.svg`, `chevron-right.svg`, `file.svg`, `folder.svg`, referenced as `mods/files-tabs/<icon>.svg`. No `layouts/` folder: the person changes the Files block of their own layout to `{ "mod": "files-tabs" }`; the shipped `main` layout is read-only, so they clone it first (`layout.clone`).
- **Two jobs, one class:** `init` reads `props()` (init's own argument is empty for a mod tab, and `props()` is only right during init). With `file` it's a viewer (a plain `FileView` object the `View` delegates `render` and `close` to), else the panel.
- **Tree:** the shipped `files` mod's code with its preview removed: `exec("sh", …)` (PowerShell on Windows) to list a folder, `exec("git", …)` for marks, `watchFolder`, `spaces()`, `panes()`, `focused()`, `theme()`.
- **Viewer:** `readTextFile(file, { on })`, `exec("stat", …, { on })`, `cx.timer.every`, `EditorState.new({ readonly: true, … })` + `Editor.new`, `TextView.markdown`, `run("pane.split", …)`; `close()` releases the editor state.
- **Shared, pure:** `match.js`: `MOD`, `IS_TEXT` (the sh check), `tabName(file, folder, home)`, `viewTab(space, name)` (a tab with that name whose `named` isn't false: `herdr-app ls` has no `named`), `linkFile(link, home, exists)`, `execArgv(line, file)`. `tests/match.test.mjs` covers them and `tests/xdg-open.test.mjs` runs `bin/xdg-open` under a parent process named `herdr-app` with a stub `herdr-app` CLI; `node --test tests/`. Errors: `notify({ title, body, level: "error" })`.

## Watch out

- The default app alone isn't enough for Edit: on KDE most text types default to Kate, while micro or vim are registered for them too. `xdg-mime query default` returns nothing for some types (`text/javascript`); `gio mime` lists apps there, including those of parent types. `text/x-rust` has no apps at all; hence the `text/plain` fallback.
- Write the scripts without `${…}` if they live in a JS template literal (`String.raw` still interpolates it).
- `gio mime` output is localized; run it with `LC_ALL=C`.
- `grep -I` in a UTF-8 locale calls invalid UTF-8 binary; `LC_ALL=C` leaves only NUL. `grep -q .` misses files of only newlines; match `""` and let `[ ! -s ]` take empty files.
- Don't `exec("xdg-open")` without `setsid -f`: some apps keep it waiting until they exit, and `exec` times out after 30 s.
- `console.log` treats `%f`/`%i` as format codes; don't test the Exec parser through it.
- Herdr's `PATH` order isn't your shell's: check it in `/proc/<herdr-app pid>/environ` before relying on a folder coming before `/usr/bin`.
- Vendor-prefixed desktop ids that map to subfolders (`kde-foo.desktop` → `kde/foo.desktop`) aren't resolved; such editors get no button.
- Herdr's shipped `files` mod is read-only; copy its code, never edit it. Follow the installed `herdr.d.ts` and `gpui-kit.d.ts`.
- The mod runs `sh`, `git`, `grep`, `stat`, `xdg-mime`, `gio`, `awk`, `setsid`, `xdg-open` and the editor, and on Windows `powershell` for listing; Ctrl+click also runs `node` and `herdr-app`.

## Done when

- `herdr-app check mods/files-tabs` passes with the matching Herdr binary and home, and `node --test tests/` passes.
- With the layout's Files block set to `files-tabs`, the Files button shows the tree for the focused terminal's folder, with git marks, and it stays put while a viewer tab is focused.
- `.md` files open rendered and `.py`, `.json`, `.sh` and `.rs` files as highlighted code, each in a tab named after its path; clicking one again selects that tab.
- Edit in micro opens micro to the right; saving there updates the viewer within 2 s; quitting closes micro's pane.
- A `.png` or `.pdf` opens in its default desktop app's window and adds no tab.
- With `bin/xdg-open` linked, Ctrl+clicking `/abs/path/main.py:12` in a terminal opens or selects its viewer tab, and Ctrl+clicking a URL still opens the browser.
