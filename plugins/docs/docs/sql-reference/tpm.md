---
sidebar_position: 4
---

# tpm — Plugin Package Manager

The `tpm` extension is Trex's NPM-compatible package manager. It resolves
plugin specifications against an NPM-style registry, fetches tarballs,
extracts them into a plugin directory, and tracks installed packages. The
admin UI's "Plugins" page and the GraphQL `installPlugin` mutation both
delegate here.

Use it when you want to install or manage plugins from SQL or scripts. For
the plugin system as a whole, see [Concepts → Plugin System](../concepts/plugin-system).

## Concepts

### Registry

`tpm` reads from the URL configured in the `TPM_REGISTRY_URL` environment
variable. The registry must speak the standard NPM HTTP API (the same one
`npm install` uses) — `pkgs.dev.azure.com`, GitHub Packages, npm.js,
Verdaccio, and Sonatype Nexus all work.

A separate `PLUGINS_INFORMATION_URL` controls discovery (the package feed
listing): the admin UI lists what's available; `tpm` actually installs.

### Install layout

By convention, plugins install under `PLUGINS_PATH` (default `./plugins`)
with their scoped name preserved on disk:

```
plugins/
└── @trex/
    └── my-plugin/
        ├── package.json
        ├── functions/
        └── dist/
```

The plugin loader (re-)scans `PLUGINS_PATH` at server startup, so installs
take effect after restart. There is no live hot-reload of installed plugins
(only of dev-mounted ones in `PLUGINS_DEV_PATH`).

### Dependency resolution

`trex_plugin_install` installs a single package. `trex_plugin_install_with_deps`
walks the dep tree (using semver ranges from each `package.json`) and
installs every dependency too — same algorithm as `npm install`, but only
within the Trex-plugin scope (it doesn't pull in arbitrary npm packages,
only those that are themselves Trex plugins).

## Typical workflow

```sql
-- See what's in the registry
SELECT * FROM trex_plugin_info('@trex/notebook');

-- Inspect resolution + the dep tree before committing
SELECT * FROM trex_plugin_resolve('@trex/notebook@^1.0.0');
SELECT * FROM trex_plugin_tree('@trex/notebook@1.2.0');

-- Install with all dependencies
SELECT * FROM trex_plugin_install_with_deps('@trex/notebook@1.2.0', './plugins');

-- Confirm
SELECT * FROM trex_plugin_list('./plugins');

-- Restart the Trex container to pick up the new plugin

-- Later: remove
SELECT * FROM trex_plugin_delete('@trex/notebook', './plugins');
```

## Functions

Every function returns JSON wrapped in a single `VARCHAR` column. Most return
multiple rows (one per package).

### `trex_plugin(name)`

Fetch a package's npm metadata document (the `/{name}` endpoint of the
registry). Lower-level than `trex_plugin_info` — useful when you need raw
fields (deprecated flags, dist-tags, maintainers).

```sql
SELECT * FROM trex_plugin('@trex/notebook');
```

### `trex_plugin_info(package_name)`

Return a curated JSON describing the package: name, versions, latest, deps.
Used by the admin UI's plugin browser.

```sql
SELECT * FROM trex_plugin_info('@trex/notebook');
```

### `trex_plugin_resolve(package_spec)`

Resolve a semver range to a concrete version without downloading. Returns
the chosen version plus the resolved tarball URL.

```sql
SELECT * FROM trex_plugin_resolve('@trex/notebook@^1.0.0');
-- → {"name":"@trex/notebook","version":"1.4.2","tarball":"https://..."}
```

### `trex_plugin_tree(package_spec)`

Show the full dependency tree, one row per node. Good for verifying what
`install_with_deps` will pull in before you run it.

```sql
SELECT * FROM trex_plugin_tree('@trex/notebook@1.4.2');
```

### `trex_plugin_install(package_spec, install_dir)`

Install a single package — no dependencies. Use only when you're certain
the deps already exist on disk; otherwise prefer `install_with_deps`.

| Parameter | Type | Description |
|-----------|------|-------------|
| package_spec | VARCHAR | `@scope/name@version` or `@scope/name@semver-range`. |
| install_dir | VARCHAR | Target plugin directory (typically `./plugins`). |

```sql
SELECT * FROM trex_plugin_install('@trex/notebook@1.4.2', './plugins');
```

### `trex_plugin_install_with_deps(package_spec, install_dir)`

Install a package and all of its transitive dependencies. Idempotent —
already-installed deps are skipped.

```sql
SELECT * FROM trex_plugin_install_with_deps('@trex/notebook@1.4.2', './plugins');
```

This is the function the admin UI and GraphQL `installPlugin` mutation
ultimately call.

### `trex_plugin_list(install_dir)`

Enumerate the installed plugins in a directory. Reads each
`package.json/version` field and reports.

```sql
SELECT * FROM trex_plugin_list('./plugins');
```

### `trex_plugin_seed(install_dir)`

Bulk-install the plugins listed in the `PLUGINS_SEED` environment variable (a
JSON array of package specs). Used in build pipelines to bake a known set of
plugins into the runtime image. The function also honors `PLUGINS_SEED_UPDATE`
(re-fetch/update already-installed seed packages) and `PLUGINS_API_VERSION`
(the dist-tag to resolve, default `latest`). If `PLUGINS_SEED` is empty or
unset, this is a no-op.

```sql
SELECT * FROM trex_plugin_seed('./plugins');
```

### `trex_plugin_delete(package_name, install_dir)`

Remove an installed plugin's directory. Does **not** remove dependencies
even if they're now orphaned — current `tpm` does not refcount.

```sql
SELECT * FROM trex_plugin_delete('@trex/notebook', './plugins');
```

## Operational notes

- **Restart required.** The plugin loader scans on server startup. Install
  via `tpm`, then restart Trex (the admin UI's "pendingRestart" flag tracks
  this).
- **Registry auth**: embed credentials directly in `TPM_REGISTRY_URL`
  (e.g. `https://user:token@private-registry/...`). This is the only supported
  auth mechanism — there is no separate auth-token environment variable.
- **Disk space**: installs are uncompressed tarballs. Large plugins (the
  notebook bundle, the storage worker) can run to 100+ MB each.
- **Aliases**: `tpm_install` is a deprecated alias for `trex_plugin_install`.
  Prefer the `trex_plugin_*` form in new code.

## Next steps

- [Concepts → Plugin System](../concepts/plugin-system) — what gets loaded
  after a successful install.
- [Plugins → Overview](../plugins/overview) — the per-type config a plugin's
  `package.json` declares.
- [APIs → MCP](../apis/mcp) — the `plugin-install` and `plugin-list` MCP
  tools wrap these SQL functions.
