# Vintage NPM Registry

A "time machine" npm registry powered by [Verdaccio](https://verdaccio.org/). Hide package versions published after a cutoff date and/or block specific versions via a denylist file.

## Features

- **Global cutoff date** - Hide all package versions published after a specific date
- **Denylist file** - Block specific versions or set per-package date cutoffs
- **Allowlist file** - Allow specific versions to bypass date filtering
- **Hot reload** - Changes to denylist/allowlist files apply immediately without restart
- **Podman deployment** - Ready-to-run container with everything pre-configured

## Quick Start

```bash
# Clone and start
git clone <repo>
cd vintage-npm-registry
make run

# Use the registry
npm install lodash --registry http://localhost:4873
```

## Configuration

### Global Cutoff Date

Edit `conf/config.yaml` to set a global cutoff date:

```yaml
filters:
  vintage:
    global_cutoff: '2024-01-01T00:00:00.000Z'
```

This hides ALL package versions published after January 1, 2024.

### Denylist File

Edit `denylist.txt` to block specific packages/versions:

```txt
# Block a specific version
event-stream@3.3.6
lodash@4.17.20

# Block version ranges using semver syntax
lodash@^4.17.0        # block 4.17.0 and above (same major)
react@~18.2.0         # block 18.2.x only
axios@>=2.0.0         # block 2.0.0 and above

# Block all versions of a package after a date
react@2024-01-01
@babel/core@2024-06-15T00:00:00.000Z
```

Changes are detected automatically (hot reload) - no restart needed.

### Allowlist File

Edit `allowlist.txt` to allow specific versions or version ranges that bypass date filtering:

```txt
# Allow specific newer versions despite global/per-package cutoff dates
lodash@4.17.21
react@18.3.0
@babel/core@7.24.0

# Allow version ranges using semver syntax
lodash@^4.17.20      # caret range: 4.17.20 and above (same major)
react@~18.2.0        # tilde range: 18.2.x only
axios@>=1.6.0        # comparison range: 1.6.0 and above
express@4.18.x       # x-range: all 4.18.x versions
```

This is useful when you have a global cutoff date but need specific newer versions for security patches or critical features. Semver ranges let you allow a range of versions without listing each one individually.

## Denylist Format

| Format | Example | Effect |
|--------|---------|--------|
| `package@version` | `lodash@4.17.20` | Block specific version |
| `package@^version` | `lodash@^4.17.0` | Caret range: block same major, >= specified |
| `package@~version` | `react@~18.2.0` | Tilde range: block same minor, >= specified |
| `package@>=version` | `axios@>=2.0.0` | Comparison: block >= specified version |
| `package@<version` | `lodash@<4.0.0` | Comparison: block < specified version |
| `package@<=version` | `lodash@<=4.17.19` | Comparison: block <= specified version |
| `package@version.x` | `express@4.18.x` | X-range: block any version in range |
| `package@YYYY-MM-DD` | `react@2024-01-01` | Block versions after date |
| `package@ISO-timestamp` | `vue@2024-06-15T12:00:00Z` | Block versions after timestamp |

- Supports all [semver range syntax](https://github.com/npm/node-semver#ranges)
- Lines starting with `#` are comments
- Blank lines are ignored
- Scoped packages work: `@babel/core@^7.20.0`

## Allowlist Format

| Format | Example | Effect |
|--------|---------|--------|
| `package@version` | `lodash@4.17.21` | Allow specific version |
| `package@^version` | `lodash@^4.17.20` | Caret range: same major, >= specified |
| `package@~version` | `react@~18.2.0` | Tilde range: same minor, >= specified |
| `package@>=version` | `axios@>=1.6.0` | Comparison: >= specified version |
| `package@version.x` | `express@4.18.x` | X-range: match any in range |

- Supports all [semver range syntax](https://github.com/npm/node-semver#ranges)
- Only version/range entries are supported (not date entries)
- Allowlist is applied after date filtering
- Denylist takes precedence (a version both allowed and blocked will be blocked)
- Scoped packages work: `@babel/core@^7.20.0`

## Commands

```bash
make build          # Build the container image
make run            # Start the registry
make stop           # Stop the registry
make logs           # View logs
make clean          # Remove container, image, and volumes
make test           # Run all tests (unit + e2e)
```

## Using the Registry

### Per-command

```bash
npm install lodash --registry http://localhost:4873
npm view react versions --registry http://localhost:4873
```

### Global configuration

```bash
npm config set registry http://localhost:4873
```

### Per-project (.npmrc)

Create `.npmrc` in your project:

```
registry=http://localhost:4873
```

## Architecture

```
vintage-npm-registry/
├── plugin/                 # Verdaccio filter plugin (TypeScript)
│   ├── src/
│   │   ├── index.ts       # Main plugin class
│   │   ├── denylist-parser.ts
│   │   ├── allowlist-parser.ts
│   │   ├── metadata-filter.ts
│   │   └── file-watcher.ts
│   └── tests/
├── conf/                   # Container configuration
│   ├── config.yaml        # Verdaccio config
│   └── denylist.txt       # Default denylist
├── Containerfile
├── Makefile
├── denylist.txt           # Mounted denylist (edit this one)
└── allowlist.txt          # Mounted allowlist (edit this one)
```

## How It Works

1. Client requests package metadata from your registry
2. Verdaccio fetches metadata from npmjs.org (upstream)
3. **Vintage plugin** filters the metadata:
   - Removes versions after the global cutoff date
   - Removes versions after per-package cutoff dates
   - Adds back explicitly allowed versions (from allowlist)
   - Removes explicitly blocked versions (denylist takes precedence)
   - Fixes `dist-tags` to point to allowed versions
4. Client receives filtered metadata and installs allowed versions

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| All versions filtered | Returns 404 (package not found) |
| Missing publish date | Version is kept (fail-open) |
| Invalid denylist/allowlist line | Warning logged, line skipped |
| Denylist/allowlist file missing | Error if configured but missing |
| `latest` tag filtered | Reassigned to newest allowed version |
| Version both allowed and blocked | Blocked (denylist takes precedence) |
| Allowlist version doesn't exist | Ignored (no error) |

## Development

```bash
# Install plugin dependencies
cd plugin && npm install

# Run tests
npm test

# Build plugin
npm run build

# Rebuild container after plugin changes
cd .. && make build
```

## License

MIT
