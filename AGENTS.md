# Vintage NPM Registry

A Verdaccio plugin that acts as a time machine for npm packages, filtering out versions published after a cutoff date.

## Project Structure

```
plugin/           # Verdaccio filter plugin (TypeScript)
conf/             # Verdaccio configuration
denylist.txt      # Packages to block entirely
allowlist.txt     # Package versions to allow regardless of cutoff date
test-e2e.sh       # End-to-end tests using podman
```

## Development

```bash
cd plugin
npm install
npm run test:unit    # Unit tests only
npm run test         # Unit + e2e tests
npm run build        # Compile TypeScript
```

## Publishing

This project uses **release-please** for automated releases.

### Workflow

1. Use conventional commits when making changes:
   - `feat:` - New feature (bumps minor version)
   - `fix:` - Bug fix (bumps patch version)
   - `docs:` - Documentation only
   - `chore:` - Maintenance tasks
   - `feat!:` or `BREAKING CHANGE:` - Breaking change (bumps major version)

2. Push to `main` branch

3. release-please automatically creates/updates a Release PR with:
   - Version bump in `plugin/package.json`
   - Generated changelog

4. Merge the Release PR → triggers npm publish via OIDC trusted publishing

### Manual Publishing (if needed)

```bash
cd plugin
npm run build
npm publish --access public
```

## Session Values Stay Out of the Repository

A value copied from a working session (a shell, an environment variable, a launch command or a transcript) is not useful to the repository and goes stale: profile names, account names, one-off paths, model names, local ports. Don't put one in a file, a comment, a commit message, or a pull request title, description or review comment. Use a variable or a made-up placeholder (`example-profile`, `example-name`). Where something specific has to be named, use its publicly documented identifier. Check the diff, the commit messages and the PR text before every push.

## npm Package

- **Name:** `verdaccio-plugin-vintage`
- **URL:** https://www.npmjs.com/package/verdaccio-plugin-vintage
