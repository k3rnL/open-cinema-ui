# Audio orchestration UI

The web experience treats Open Cinema as the owner of desired behavior and WirePlumber/PipeWire as the owner of the live audio session. It never stores PipeWire object IDs as desired configuration.

## Four representations

The client deliberately keeps these representations separate:

1. **Desired** — immutable graph/subgraph revisions, logical endpoints, parameters, and activation.
2. **Resolved** — the deterministic plan selected for a desired-state version and observed-world version.
3. **Applied** — transition generation, progress, convergence, rollback, or failure.
4. **Observed runtime** — replaceable WirePlumber/PipeWire and managed-processor projections.

The advanced editor uses grey for desired nodes, green for the resolved path, blue for observed runtime, and red for validation errors. Runtime projection data is an overlay only; it is never written back into a desired graph.

## Editing behavior

A published revision can be used as the base for editing. The first mutation
immediately changes the local document and creates or reuses a draft in the
background without changing active audio. Metadata, nodes, drag-stop positions,
collapse state, configuration, edges, public ports, parameters, rules, subgraph
bindings, and auto layout all pass through one sequenced autosave coordinator.
It debounces writes, keeps one request in flight, queues the newest document,
and never lets an older response reset a newer move or value.

The compact status beside the editor title reports saved, saving, pending,
offline, failed, or conflict state. Transient failures retain local content and
retry with bounded backoff. A `412` pauses autosave and preserves the local
document while offering export/review, remote reload, or rebase where
supported. Refresh and unload warn only when local work is pending, failed,
offline, or conflicted. The saved viewport and node layout are desired
presentation state; runtime overlays and intermediate drag frames are not.

For a top-level graph, **Apply changes** is one visible workflow: flush the
latest autosave, run canonical validation, publish an immutable revision,
atomically activate that revision with its parameter and scene bindings, and
follow reconciliation to a terminal result. If any stage fails, the previous
active revision remains the audio authority. Published inactive graphs offer
**Apply**; the active graph offers **Deactivate** in the same primary action
slot. A reusable subgraph can be published but is never activated by itself.

The simple editor compiles ordered `WHEN / THEN / OTHERWISE` rules into the same
desired document used by the advanced editor; its source representation lives
under the document's extensions and is removed when an incompatible advanced
edit is made, so it cannot become a competing configuration. Advanced-only
graphs get a readable explanation instead of a misleading editable rule form.
The advanced editor obtains node types, ports, compatibility contracts,
configuration schemas, availability, and plugin diagnostics from the backend
catalogue.

Nodes remain compact at every canvas zoom. Selecting one opens a stable
page-level inspector outside the transformed canvas; selection does not add a
toolbar or resize the node. The inspector uses Ant Design controls for
primitives, choices, arrays, key/value mappings, selectors, and graph interface
bindings. Conditions use named operation, live-fact, typed-value, nested-rule,
and duration controls; endpoint groups, target signal contracts, and
output-specific CamillaDSP profiles also have dedicated editors. Each compact
node exposes its catalogue description from a hover/focus information control.
There are no per-node Save/Reload buttons because every change enters autosave.
Unsupported open-ended structures remain lossless under an explicit **Advanced
JSON** section with parse validation and cancel semantics.

Inputs and outputs represent logical endpoints. Processors are distinct graph
elements with lifecycle and health: CamillaDSP nodes select immutable profile
lineage/version pairs, the adaptive decoder exposes input/output format fields,
and processing plugins contribute their own schema and typed signal contract.

Reusable subgraphs have an explicit public parameter/port interface. A parent graph pins a published subgraph revision and stores parameter/port bindings. Upgrades show a compatibility preview and require confirmation.

## Live state and failure handling

The client first loads one full snapshot and then subscribes to `/api/audio/v1/events`. It resumes with its last sequence. A client-observed sequence gap or server `snapshot` event replaces runtime projections from a consistent snapshot. Duplicate/stale events are ignored.

When the runtime or processors are unhealthy, desired editing and diagnostics remain available. Only unsafe live actions—temporary endpoint selection, volume, mute, publication activation—are disabled, with the readiness blocker displayed.

Manual choices use typed, expiring overrides and remain visibly distinct from
persistent desired changes such as an explicit endpoint binding.

## Product boundary and visual baseline

All management workflows live in `apps/admin`. `apps/ui` is an independent
minimal placeholder for the future physical display, and Django admin is not an
end-user surface. The editor retains the accepted React Flow canvas, compact
nodes, typed handles, inline fields, node toolbar, controls, minimap, and
auto-layout. Revised screens use Ant Design/Refine primitives and the existing
graph stylesheet only. See [the recorded baseline](UI_BASELINE.md) and
[`docs/ui-current`](ui-current/README.md) for the current review captures.

The daily management flow is organized as follows:

- Dashboard: overall status, current route/format, bounded live metrics,
  component versions, master level, and guarded system controls.
- Devices: logical physical/virtual endpoints, availability and binding
  evidence, plus capability-aware device or input level.
- Managed resources: adapter configuration and correlated processing runtime;
  restart controls come exclusively from server action descriptors.
- Audio graphs: desired routing/processing, autosave, one lifecycle action, and
  the human-first Result / Audio path / Why / Signal / Transition explanation.
- CamillaDSP and Speaker test: profile authoring and spatially stable channel
  verification respectively.

Initial loading preserves the page shell with Skeletons. Asynchronous status
uses reserved regions so alerts do not push primary controls. Responsive review
must cover desktop and narrow layouts, light and dark theme, keyboard order,
focus visibility, menus at multiple graph zoom levels, and button bounding
boxes before/during/after long-running actions.

## Compatibility and local development

Both apps read `VITE_API_URL` (default `/api`). The first request verifies API and schema version 1; future contracts stop the workspace with an explicit compatibility error.

Run:

```bash
npm run type-check
npm test
npm run build
npm run test:e2e
```

Playwright covers the simple and advanced workflows. Browser tests require the
standard Chromium system dependencies. CI images should run
`npx playwright install --with-deps chromium` during setup.
