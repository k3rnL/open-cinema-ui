# Dependency audit evidence

Audit date: 2026-08-26

Scope: the root npm lockfile and all workspaces, using npm's advisory database.
No `npm audit fix --force`, unreviewed major upgrade, or ignored audit exit code
was used.

## Initial classification

`npm audit --json` initially reported 25 vulnerable package entries: 17 high,
7 moderate, 1 low, and 0 critical. `npm audit --omit=dev --json` identified 16
entries in production dependency paths (10 high and 6 moderate).

| Reachability | Packages | Classification and action |
| --- | --- | --- |
| Production application paths | `@refinedev/antd`, `@ant-design/pro-layout`, `path-to-regexp`, `axios`, `follow-redirects`, `form-data`, `lodash`, `lodash-es`, `nanoid`, `postcss`, `prismjs`, `qs`, `react-router`, `react-syntax-highlighter`, `refractor`, `styled-components` | Browser/runtime or bundled transitive paths. Treated as release blocking and remediated. |
| Development/build paths | `@babel/core`, `ajv`, `brace-expansion`, `flatted`, `js-yaml`, `minimatch`, `picomatch`, `rollup`, `vite` | CI, compiler, linter, test, or dev-server paths. Not shipped as Node services, but still remediated because they process repository/build inputs and the release gate accepts no current advisory. |

The normal non-forced audit remediation refreshed dependencies within declared
ranges. The two dependency chains for which npm proposed a forced parent
downgrade/major operation were handled with reviewed same-major transitive
overrides instead:

- `path-to-regexp` is constrained to `^8.3.1` for Refine's Ant Design layout
  chain (resolved to a patched 8.x release).
- `prismjs` is constrained to `^1.30.0` for the syntax-highlighting chain.

`styled-components` was updated within major version 6 to `^6.5.3`, removing
its vulnerable nested PostCSS release. Other direct dependencies remained
within their declared major-version ranges. Unit, type, lint, production build,
and browser gates are required after these lockfile changes.

## Result and policy

The final command:

```bash
npm audit --audit-level=low
```

reports `found 0 vulnerabilities` for the current lockfile. There are therefore
no accepted or suppressed production or development findings at this point.
CI and the tag workflow run the same command as a hard failure. If the advisory
database changes, classify the new path and either safely remediate it or add a
time-bounded evidence entry here before changing the gate; never use a forced
major upgrade as an automatic release step.
