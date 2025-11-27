# Vintage NPM Registry

A "time machine" npm registry powered by [Verdaccio](https://verdaccio.org/). Hide package versions published after a cutoff date and/or block specific versions via a denylist file.

## Features

- **Global cutoff date** - Hide all package versions published after a specific date
- **Denylist file** - Block specific versions or set per-package date cutoffs
- **Hot reload** - Changes to the denylist file apply immediately without restart
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

# Block all versions of a package after a date
react@2024-01-01
@babel/core@2024-06-15T00:00:00.000Z
```

Changes are detected automatically (hot reload) - no restart needed.

## Denylist Format

| Format | Example | Effect |
|--------|---------|--------|
| `package@version` | `lodash@4.17.20` | Block specific version |
| `package@YYYY-MM-DD` | `react@2024-01-01` | Block versions after date |
| `package@ISO-timestamp` | `vue@2024-06-15T12:00:00Z` | Block versions after timestamp |

- Lines starting with `#` are comments
- Blank lines are ignored
- Scoped packages work: `@babel/core@2024-01-01`

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
│   │   ├── metadata-filter.ts
│   │   └── file-watcher.ts
│   └── tests/
├── conf/                   # Container configuration
│   ├── config.yaml        # Verdaccio config
│   └── denylist.txt       # Default denylist
├── Containerfile
├── Makefile
└── denylist.txt           # Mounted denylist (edit this one)
```

## How It Works

1. Client requests package metadata from your registry
2. Verdaccio fetches metadata from npmjs.org (upstream)
3. **Vintage plugin** filters the metadata:
   - Removes versions after the global cutoff date
   - Removes versions after per-package cutoff dates
   - Removes explicitly blocked versions
   - Fixes `dist-tags` to point to allowed versions
4. Client receives filtered metadata and installs allowed versions

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| All versions filtered | Returns 404 (package not found) |
| Missing publish date | Version is kept (fail-open) |
| Invalid denylist line | Warning logged, line skipped |
| Denylist file missing | Warning logged, no filtering |
| `latest` tag filtered | Reassigned to newest allowed version |

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
