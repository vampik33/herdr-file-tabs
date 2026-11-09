# herdr-file-tabs

A [Herdr](https://herdr.dev) app mod: the Files panel, except clicking a file
opens it **in a terminal app whenever one can open that file type**, instead
of a preview inside the side panel.

- **A terminal app** (a desktop entry with `Terminal=true`, e.g. micro, vim,
  nvim) that handles the type opens the file in a new tab in the main area,
  named after the file's path (`src/main.py`), started in the tree's folder.
- **No terminal app** for the type (images, PDFs, binaries): the file opens
  in its default desktop app, in its own window, through `xdg-open`.
- Clicking a file whose terminal-app tab is still running it selects that
  tab instead of opening another.

Which terminal app: the type's default app if it is a terminal app, else the
first terminal app among those `gio mime <type>` lists (it includes apps of
parent types, so `.json` and `.md` get `text/plain`'s editors), else, for a
`text/*` type with no apps at all (`text/x-rust`), the first among
`text/plain`'s. To choose, make your terminal editor the type's default:
`xdg-mime default micro.desktop text/x-python`.

## Requirements

- Herdr app 0.1.14 or later, on Linux.
- `xdg-utils` (`xdg-mime`, `xdg-open`) and `setsid` (util-linux). `gio` is
  optional.

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

## Uninstall

Change the block's mod back to `files` and delete
`~/.config/herdr-app/mods/files-tabs`.

## Limits

- Files in a space on another machine open only if a terminal app there can
  open them; otherwise you get an error toast.
- Desktop ids with a vendor prefix that maps to a subfolder
  (`applications/kde/foo.desktop`) aren't found, so such apps are skipped.
- A terminal-app tab is reused only while it keeps its name (the file's
  relative path) and its terminal is still in the folder it started in;
  renaming it stops reuse.

## Tests

```sh
node --test tests/
```

## License

MIT
