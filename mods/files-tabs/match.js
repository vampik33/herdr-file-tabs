// The tab in `space` this mod opened for `path` (relative to `root`) that still runs it: named
// after the path, with a non-shell terminal whose folder is `root` (where the tab was started).
// A same-named tab opened from another folder holds another file, so it doesn't match.
export function fileTab(space, panes, path, root) {
  return space?.tabs.find(t => t.named && t.name === path
    && panes.some(p => p.tab === t.id && p.terminal && !p.program.shell && p.cwd === root));
}
