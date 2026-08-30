# Current management UI references

These views are captured by the browser suite when `UPDATE_UI_REFERENCES=1`.
They are reviewed against [`../UI_BASELINE.md`](../UI_BASELINE.md); pixel identity
is not required, but the application shell, discovery workflow, graph canvas,
node presentation, direct manipulation, and explicit Apply feedback must remain
recognizably continuous.

The `*-light.png` and `*-dark.png` files cover dashboard, device discovery,
Managed resources, graph list/editor and inspector, runtime explanation, and
speaker testing. Selected-node and active-speaker-test references preserve the
dynamic states that historically changed control placement.
`layout-baseline.json` records representative control bounds and interaction
state so regression tests can compare layout, not pixels.

## Review procedure

1. Start the deterministic browser fixture and set `UPDATE_UI_REFERENCES=1` only
   when intentionally refreshing these files.
2. Capture desktop and narrow viewports in light and dark mode. Exercise normal,
   loading, empty, stale/degraded, read-only, pending, success, and failed states
   where the fixture supplies them.
3. For graphs, compare selected and unselected node bounds, open the inspector,
   edit a structured value, move a node, add/remove an edge, run auto layout,
   and inspect palettes/dropdowns at several zoom levels. Confirm the autosave
   status settles without resetting any later edit.
4. For Speaker test, record the same channel button bounds while inactive,
   starting, active, stopping, and failed. Status text may change; the selector,
   channel grid, and Stop area must remain mounted.
5. Use keyboard-only navigation and run the browser accessibility checks.
   Review focus order, labels, live-region announcements, contrast, clipping,
   table action isolation, and horizontal overflow before accepting a visual
   change.

Reference updates require human review of the semantic and spatial change;
passing a screenshot diff alone is not acceptance.
