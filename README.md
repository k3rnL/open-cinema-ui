# Open Cinema UI

Open Cinema UI is an npm-workspace repository containing two deliberately
separate web applications:

- `apps/admin` is the end-user administration console. It uses Refine and Ant
  Design for system status, device discovery, audio adapters, desired audio
  graphs, processor profiles, and speaker testing.
- `apps/ui` is the independent on-box display application. It is intentionally
  a small placeholder until the physical-screen interaction is designed; it is
  not a second administration console.

No Django admin site is part of this repository or required to use the
management console.

## Architecture

```text
apps/admin/       Refine management console, normally mounted at /admin/
apps/ui/          On-box placeholder, normally mounted at /ui/
packages/shared/  Typed API client and audio-orchestration contract/state layer
contracts/        Versioned client compatibility metadata shipped with admin
e2e/              Deterministic browser tests with mocked backend contracts
scripts/          Version, packaging, provenance, and archive verification tools
```

The administration console authenticates through `/api/auth/*` and negotiates
the versioned `/api/audio/v1` orchestration contract before using audio
features. Desired, resolved, applied, and observed runtime representations stay
separate. Processors such as CamillaDSP and the adaptive PCM decoder are graph
nodes, while logical audio inputs and outputs are durable endpoint references.

The management navigation has distinct operational roles:

- **Dashboard** summarizes appliance/audio health, bounded live CPU and RAM
  history, versions, master output level, and capability-advertised system
  controls.
- **Devices** lists durable logical inputs and outputs, including disconnected
  preferences, binding evidence, and confirmed volume/mute capabilities.
- **Managed resources** owns ROC/debug adapters and correlated CamillaDSP or
  decoder instances. It exposes only actions advertised by the backend.
- **Audio graphs** authors desired routing and processing; **CamillaDSP** owns
  profile documents; **Speaker test** performs bounded channel checks.
- **Plugins** separates the first-party Marketplace from Installed integrations,
  advanced trusted Git inspection, provenance/permission diagnostics, operation
  progress, and lifecycle controls.

Enabled plugins may add navigation and pages without rebuilding this repository.
The shared package validates their versioned declarative descriptors and the
admin app renders only product-owned Ant Design templates and typed widgets at
`/plugins/:pluginId/:pageId`. Contributions cannot ship browser JavaScript,
HTML, or CSS. Invalid or failed contributions are isolated to their own page;
core dashboard/navigation startup does not wait for plugin data endpoints.

Graph changes start or reuse a draft automatically and are autosaved. The
canvas remains compact while node configuration appears in a stable page-level
inspector. Common fields, graph parameters, public ports, and subgraph bindings
use structured controls. Conditions name their operation and expose live facts
and typed values; endpoint groups, signal adapters, and per-output CamillaDSP
profiles have dedicated editors. Hover or focus a node's information icon for
its catalogue description. Advanced JSON is an explicit lossless fallback only
for genuinely open-ended schemas. Apply drains pending saves before validation,
publication, activation, and reconciliation.

The shared package is resolved from TypeScript source by Vite during local
development. Its compiled output is still a required release gate and is
produced in `packages/shared/dist`.

## Requirements and installation

- Node.js 20
- npm with lockfile v3 support

Use the lockfile for reproducible development and CI installs:

```bash
npm ci
npm run build:shared
```

`npm install` is appropriate when intentionally changing dependencies; review
and commit the resulting `package-lock.json` change.

## Environment configuration

Both example files default to the same-origin API mount:

```bash
cp apps/admin/.env.example apps/admin/.env
cp apps/ui/.env.example apps/ui/.env
```

The supported settings are:

- `VITE_API_URL` — API prefix used by application code; default `/api`.
- `VITE_API_PROXY_TARGET` — admin development-server proxy target for `/api`;
  default `http://127.0.0.1:8000`.
- `VITE_BASE_PATH` — deployment base used by a Vite build or development
  server; defaults to `/admin/` for admin and `/ui/` for the on-box app.

For a same-origin appliance deployment, serve each static build at its base
path and reverse-proxy `/api` to Open Cinema. Do not put credentials in Vite
environment variables because `VITE_*` values are embedded in browser assets.

## Development

```bash
npm run dev:admin  # http://localhost:3000/admin/
npm run dev:ui     # http://localhost:3001/ui/
npm run dev        # both development servers
```

The admin server listens on the network for appliance/LAN development and
proxies `/api` to the configured backend target. Authentication is provided by
Open Cinema; the test contract uses `admin` / `admin`, but production
credentials belong to the backend deployment.

## Validation

The release gate is intentionally explicit and has no advisory lint or skipped
workspace tests:

```bash
npm ci
npm run audit
npm run version:check
npm run build:shared
npm run type-check
npm run lint
npm test
npm run build
npm run version:check -- --dist
npx playwright install chromium
npm run test:e2e:release
```

`npm test` runs the shared contract/state tests and both applications' unit and
component tests. `npm run test:e2e` runs the complete deterministic browser
suite. `npm run test:e2e:release` is the bounded release subset: it proves that
the management application boots and authenticates against its test contract,
and that the independent on-box placeholder boots.

`npm run audit` fails for every reported severity. Findings must be reviewed by
production reachability; forced major upgrades are not an accepted shortcut.
The current triage and remediation evidence is in
[`docs/SECURITY_AUDIT.md`](docs/SECURITY_AUDIT.md).

## Production builds and deployment assets

```bash
npm run build:shared
npm run build
```

The outputs are `apps/admin/dist` and `apps/ui/dist`. Each contains
`open-cinema-release.json` plus matching HTML version metadata. The admin build
also contains `contracts/audio-orchestration-client-v1.json`, which records the
API/schema contract it supports.

The release workflow publishes separate static archives:

- `open-cinema-admin-v<version>.tar.gz` for the end-user management console;
- `open-cinema-ui-v<version>.tar.gz` for the on-box placeholder;
- one portable `.provenance.json` record per archive;
- `checksums.sha256` covering both archives and both provenance records.

Archives contain the files to place directly at their configured web root, not
an outer application directory. A deployment must verify the checksum before
extracting it.

## Workspace versioning

All four manifests and their lockfile entries use one explicit version. Set it
without creating a commit, tag, push, or publication:

```bash
npm run version:set -- 2.1.1
npm run version:check
```

The command updates the root, admin, on-box, and shared package versions, pins
both internal shared-package dependencies to that version, and updates the
lockfile. It accepts an exact SemVer value only. Review the diff and run the
complete validation gate before committing it.

For a tag candidate, verify identity explicitly:

```bash
npm run version:check -- --tag v2.1.1
```

## Release flow

1. Curate and review the intended source commits; exclude generated, secret,
   editor-local, and deferred user files.
2. Apply the exact workspace version with `version:set`, then run the complete
   validation sequence above.
3. Push the reviewed commit through normal branch CI and wait for all release
   gates to pass.
4. Create and push one matching `v<version>` tag. The tag workflow repeats the
   same gates and rejects a tag/version mismatch.
5. Before tagging, a maintainer enables repository release immutability and sets
   the `IMMUTABLE_RELEASES_ENABLED=true` repository variable. The workflow builds
   separate admin/on-box archives, checksums, and portable provenance, uploads
   them to an isolated job, downloads them again, and verifies contents and
   served builds. It then creates a draft, attaches every verified asset,
   publishes only after the complete set is present, and verifies the published
   release reports itself immutable.
6. Download published assets into a new directory and rerun verification before
   adding their URLs and digests to a deployment manifest.

For local packaging/verification of an already validated build:

```bash
npm run release:package -- --tag v2.1.1
npm run version:check -- --tag v2.1.1 --dist --artifacts release-dist
npm run release:verify -- --input release-dist --tag v2.1.1 --smoke
```

Verification checks archive paths, SHA-256 values, provenance, application
entry points, referenced static files, admin contract metadata, version
identity, and both applications through a temporary HTTP server. These commands
never create or push a Git tag. Local provenance records whether the source tree
was dirty; workflow provenance is rejected unless the tagged checkout is clean.

Conventional commit messages are used for generated release notes, for example
`feat: add endpoint adapter controls`, `fix: preserve graph apply state`, or
`chore: harden UI release gates`.
