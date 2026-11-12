# herdr-file-tabs

A [Herdr](https://herdr.dev) app mod: the Files panel, except clicking a text
file opens it **in a tab of its own**, in Herdr's read-only viewer, instead of
a preview inside the side panel.

- **Text files** open in a viewer tab named after the file's path relative to
  the space's folder (`src/main.py`; `~/notes.md` outside it). Markdown is
  rendered; everything else is highlighted code with line numbers. The view
  reloads when the file changes on disk.
- **Edit in zed**: the viewer's button opens the file in `$EDITOR` (named
  after its command), in the editor's own window; the view updates as you
  save. The button is hidden when Herdr's environment has no `$EDITOR`.
  `$EDITOR` is run like git runs it, as shell words (`zed --wait`), so it
  should be a GUI editor: a terminal one (`micro`) gets no terminal.
- **Other files** (images, PDFs, binaries) open in their default desktop app,
  in its own window, through `xdg-open`.
- Clicking a file that already has a viewer tab selects that tab.
- **Ctrl+click on a file path in terminal text** (Claude Code's and Codex's
  output, compiler errors) opens it the same way, with the optional
  `xdg-open` link below. A `:line` or `:line:column` suffix is dropped.

## Requirements

- Herdr app 0.1.14 or later, on Linux.
- `xdg-utils` (`xdg-open`), GNU `grep` and `stat`, and `setsid`
  (util-linux).
- For Ctrl+click: Node.js on Herdr's `PATH`.

## Install

The shipped `main` layout is read-only, so the mod goes into a layout of
your own: a clone of `main`, or the clone you already use.

```sh
cp -r mods/files-tabs ~/.config/herdr-app/mods/
herdr-app check ~/.config/herdr-app/mods/files-tabs
# Only if you don't have your own layout yet (switches to it):
herdr-app do layout.clone '{"name":"main","as":"my-main"}'
```

In your layout file (`~/.config/herdr-app/layouts/<name>.json`) change the
Files block's mod from `files` to `files-tabs`:

```json
{ "id": "files", "type": "block", "content": { "mod": "files-tabs" } }
```

The tab bar's Files button keeps working: it selects the block by its id.

### Ctrl+click (optional)

Herdr opens a Ctrl+clicked path with `xdg-open` itself; no mod sees the
click. `bin/xdg-open` stands in for it: when its caller is Herdr and the link
is a local text file, it opens a viewer tab through `herdr-app do`. Every
other caller and link goes to `/usr/bin/xdg-open` unchanged. Link it into a
`PATH` folder that comes before `/usr/bin` in Herdr's `PATH`:

```sh
ln -s ~/.config/herdr-app/mods/files-tabs/bin/xdg-open ~/.local/bin/xdg-open
```

## Uninstall

Change the block's mod back to `files`, `rm ~/.local/bin/xdg-open` if you
linked it, and delete `~/.config/herdr-app/mods/files-tabs`.

## Limits

- Files over 400 KB are shown truncated.
- In a space on another machine, the viewer reads the file there, but the
  Edit button is hidden, Ctrl+click opens only files on this computer, and
  non-text files there can't be opened.
- A viewer tab is found by its name: renaming it stops reuse, and a tab you
  named like a file's path (`notes.md`) is selected instead of opening that
  file.

## Tests

```sh
node --test tests/
```

## License

MIT
