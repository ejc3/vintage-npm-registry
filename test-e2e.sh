#!/bin/bash
#
# End-to-end test for Vintage NPM Registry
# Tests: container build, startup, filtering, hot reload
#
# NOTE: These tests rely on actual publish dates from npmjs.org:
#   lodash:
#     4.17.11 - 2018-09-12 (before 2019-01-01)
#     4.17.14 - 2019-07-12 (before 2020-01-01)
#     4.17.15 - 2019-07-19 (before 2020-01-01)
#     4.17.16 - 2020-07-08 (after 2020-01-01)
#     4.17.20 - 2020-08-13 (after 2020-01-01)
#     4.17.21 - 2021-02-20 (after 2020-01-01)
#   @babel/core:
#     7.7.0  - 2019-11-05 (before 2020-01-01)
#     7.12.0 - 2020-10-13 (after 2020-01-01)
#
# If these packages publish new versions or modify metadata, tests may need updates.
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

CONTAINER_NAME="vintage-npm-registry-test"
IMAGE_NAME="vintage-npm-registry"
REGISTRY_URL="http://localhost:4873"
TEST_DENYLIST="./test-denylist.txt"
TEST_ALLOWLIST="./test-allowlist.txt"
TEST_CONFIG="./test-config.yaml"

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Cleaning up...${NC}"
    podman stop "$CONTAINER_NAME" 2>/dev/null || true
    podman rm "$CONTAINER_NAME" 2>/dev/null || true
    rm -f "$TEST_DENYLIST" "$TEST_ALLOWLIST" "$TEST_CONFIG"
}

# Run cleanup on exit
trap cleanup EXIT

# Helper functions
pass() {
    echo -e "${GREEN}✓ $1${NC}"
}

fail() {
    echo -e "${RED}✗ $1${NC}"
    exit 1
}

info() {
    echo -e "${YELLOW}→ $1${NC}"
}

wait_for_registry() {
    local max_attempts=30
    local attempt=1
    while [ $attempt -le $max_attempts ]; do
        if curl -s "$REGISTRY_URL/-/ping" > /dev/null 2>&1; then
            return 0
        fi
        sleep 1
        attempt=$((attempt + 1))
    done
    return 1
}

get_latest_version() {
    local package=$1
    npm view "$package" dist-tags.latest --registry "$REGISTRY_URL" 2>/dev/null
}

version_exists() {
    local package=$1
    local version=$2
    npm view "$package@$version" version --registry "$REGISTRY_URL" 2>/dev/null | grep -q "$version"
}

# ============================================================================
# TEST SUITE
# ============================================================================

echo "============================================"
echo "  Vintage NPM Registry - E2E Test Suite"
echo "============================================"
echo ""

# ----------------------------------------------------------------------------
# Test 1: Build container
# ----------------------------------------------------------------------------
info "Test 1: Building container image..."

if podman build -t "$IMAGE_NAME" . > /dev/null 2>&1; then
    pass "Container image built successfully"
else
    fail "Failed to build container image"
fi

# ----------------------------------------------------------------------------
# Test 2: Start container with empty denylist
# ----------------------------------------------------------------------------
info "Test 2: Starting container with empty denylist..."

# Create empty test denylist
cat > "$TEST_DENYLIST" << 'EOF'
# Test denylist - empty
EOF

# Stop any existing test container
podman stop "$CONTAINER_NAME" 2>/dev/null || true
podman rm "$CONTAINER_NAME" 2>/dev/null || true

# Start container
podman run -d \
    --name "$CONTAINER_NAME" \
    -p 4873:4873 \
    -v "$PWD/$TEST_DENYLIST:/verdaccio/conf/denylist.txt:ro" \
    "$IMAGE_NAME" > /dev/null

if wait_for_registry; then
    pass "Registry started and responding"
else
    fail "Registry failed to start"
fi

# ----------------------------------------------------------------------------
# Test 3: Verify unfiltered access
# ----------------------------------------------------------------------------
info "Test 3: Verifying unfiltered package access..."

# lodash 4.17.21 is the latest version (as of 2021)
if version_exists "lodash" "4.17.21"; then
    pass "lodash@4.17.21 is available (no filtering)"
else
    fail "lodash@4.17.21 should be available with empty denylist"
fi

# ----------------------------------------------------------------------------
# Test 4: Add date-based cutoff rule
# ----------------------------------------------------------------------------
info "Test 4: Testing date-based cutoff (lodash@2020-01-01)..."

# Add rule to block lodash versions after 2020-01-01
cat > "$TEST_DENYLIST" << 'EOF'
# Test denylist - date cutoff
lodash@2020-01-01
EOF

# Wait for hot reload (polling interval is 2s, wait a bit longer)
sleep 4

# 4.17.21 was published 2021-02-20, should be filtered
if version_exists "lodash" "4.17.21"; then
    fail "lodash@4.17.21 should be filtered (published after 2020-01-01)"
else
    pass "lodash@4.17.21 is filtered out"
fi

# 4.17.15 was published 2019-07-19, should be available
if version_exists "lodash" "4.17.15"; then
    pass "lodash@4.17.15 is available (published before 2020-01-01)"
else
    fail "lodash@4.17.15 should be available"
fi

# ----------------------------------------------------------------------------
# Test 5: Verify latest tag is updated
# ----------------------------------------------------------------------------
info "Test 5: Verifying dist-tags are updated..."

latest=$(get_latest_version "lodash")
# With 2020-01-01 cutoff, latest should be 4.17.15
if [ "$latest" = "4.17.15" ]; then
    pass "latest tag points to 4.17.15 (correct)"
else
    fail "latest tag should be 4.17.15, got: $latest"
fi

# ----------------------------------------------------------------------------
# Test 6: Add version-specific block
# ----------------------------------------------------------------------------
info "Test 6: Testing version-specific blocking..."

# Block a specific version
cat > "$TEST_DENYLIST" << 'EOF'
# Test denylist - specific version block
lodash@4.17.20
EOF

sleep 4

# 4.17.20 should be blocked
if version_exists "lodash" "4.17.20"; then
    fail "lodash@4.17.20 should be blocked"
else
    pass "lodash@4.17.20 is blocked"
fi

# 4.17.21 should be available (only 4.17.20 is blocked)
if version_exists "lodash" "4.17.21"; then
    pass "lodash@4.17.21 is available (not blocked)"
else
    fail "lodash@4.17.21 should be available"
fi

# ----------------------------------------------------------------------------
# Test 7: Test scoped package filtering
# ----------------------------------------------------------------------------
info "Test 7: Testing scoped package filtering..."

cat > "$TEST_DENYLIST" << 'EOF'
# Test denylist - scoped package
@babel/core@2020-01-01
EOF

sleep 4

# Check that filtering works for scoped packages
# @babel/core@7.12.0 was published 2020-10-13, should be filtered
if version_exists "@babel/core" "7.12.0"; then
    fail "@babel/core@7.12.0 should be filtered (published after 2020-01-01)"
else
    pass "@babel/core@7.12.0 is filtered out"
fi

# @babel/core@7.7.0 was published 2019-11-05, should be available
if version_exists "@babel/core" "7.7.0"; then
    pass "@babel/core@7.7.0 is available (published before 2020-01-01)"
else
    fail "@babel/core@7.7.0 should be available"
fi

# ----------------------------------------------------------------------------
# Test 8: Test combined rules
# ----------------------------------------------------------------------------
info "Test 8: Testing combined rules..."

cat > "$TEST_DENYLIST" << 'EOF'
# Test denylist - combined rules
lodash@2020-01-01
lodash@4.17.15
EOF

sleep 4

# 4.17.15 should be blocked (specific version)
if version_exists "lodash" "4.17.15"; then
    fail "lodash@4.17.15 should be blocked by specific version rule"
else
    pass "lodash@4.17.15 is blocked (specific version rule)"
fi

# 4.17.14 should be available
if version_exists "lodash" "4.17.14"; then
    pass "lodash@4.17.14 is available"
else
    fail "lodash@4.17.14 should be available"
fi

# 4.17.16 should be blocked (date cutoff)
if version_exists "lodash" "4.17.16"; then
    fail "lodash@4.17.16 should be blocked by date cutoff"
else
    pass "lodash@4.17.16 is blocked (date cutoff)"
fi

# ----------------------------------------------------------------------------
# Test 9: Test hot reload removes rules
# ----------------------------------------------------------------------------
info "Test 9: Testing hot reload rule removal..."

# Clear all rules
cat > "$TEST_DENYLIST" << 'EOF'
# Test denylist - cleared
EOF

sleep 4

# All versions should be available again
if version_exists "lodash" "4.17.21"; then
    pass "lodash@4.17.21 is available after clearing rules"
else
    fail "lodash@4.17.21 should be available after clearing rules"
fi

# ----------------------------------------------------------------------------
# Test 10: Test allowlist functionality
# ----------------------------------------------------------------------------
info "Test 10: Testing allowlist to bypass date filtering..."

# Stop current container to restart with allowlist config
podman stop "$CONTAINER_NAME" 2>/dev/null || true
podman rm "$CONTAINER_NAME" 2>/dev/null || true

# Create test config with allowlist
cat > "$TEST_CONFIG" << 'EOF'
storage: /verdaccio/storage/data
plugins: /verdaccio/plugins

web:
  title: Vintage NPM Registry Test

auth:
  htpasswd:
    file: /verdaccio/storage/htpasswd
    max_users: 1000

uplinks:
  npmjs:
    url: https://registry.npmjs.org/
    cache: true

packages:
  '@*/*':
    access: $all
    publish: $authenticated
    proxy: npmjs
  '**':
    access: $all
    publish: $authenticated
    proxy: npmjs

listen: 0.0.0.0:4873
log: { type: stdout, format: pretty, level: info }

filters:
  vintage:
    denylist_file: /verdaccio/conf/denylist.txt
    allowlist_file: /verdaccio/conf/allowlist.txt
    watch_denylist: true
EOF

# Create denylist with date cutoff
cat > "$TEST_DENYLIST" << 'EOF'
# Test denylist - date cutoff
lodash@2020-01-01
EOF

# Create allowlist to allow a specific version after the cutoff
cat > "$TEST_ALLOWLIST" << 'EOF'
# Test allowlist - allow specific version despite date cutoff
lodash@4.17.21
EOF

# Start container with custom config and allowlist
podman run -d \
    --name "$CONTAINER_NAME" \
    -p 4873:4873 \
    -v "$PWD/$TEST_CONFIG:/verdaccio/conf/config.yaml:ro" \
    -v "$PWD/$TEST_DENYLIST:/verdaccio/conf/denylist.txt:ro" \
    -v "$PWD/$TEST_ALLOWLIST:/verdaccio/conf/allowlist.txt:ro" \
    "$IMAGE_NAME" > /dev/null

if wait_for_registry; then
    pass "Registry restarted with allowlist config"
else
    fail "Registry failed to start with allowlist config"
fi

# 4.17.21 was published 2021-02-20, should be filtered by date cutoff
# BUT it's in the allowlist, so should be available
if version_exists "lodash" "4.17.21"; then
    pass "lodash@4.17.21 is available (allowlisted despite date cutoff)"
else
    fail "lodash@4.17.21 should be available (in allowlist)"
fi

# 4.17.20 was published 2020-08-13, should be filtered (not in allowlist)
if version_exists "lodash" "4.17.20"; then
    fail "lodash@4.17.20 should be filtered (after date cutoff, not in allowlist)"
else
    pass "lodash@4.17.20 is filtered (after date cutoff, not in allowlist)"
fi

# 4.17.15 was published 2019-07-19, should be available (before cutoff)
if version_exists "lodash" "4.17.15"; then
    pass "lodash@4.17.15 is available (before date cutoff)"
else
    fail "lodash@4.17.15 should be available (before date cutoff)"
fi

# Verify latest tag points to the allowlisted version
latest=$(get_latest_version "lodash")
if [ "$latest" = "4.17.21" ]; then
    pass "latest tag points to 4.17.21 (allowlisted version)"
else
    fail "latest tag should be 4.17.21 (allowlisted), got: $latest"
fi

# ----------------------------------------------------------------------------
# Test 11: Verify npm install works
# ----------------------------------------------------------------------------
info "Test 11: Testing npm install..."

TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

# Create minimal package.json
cat > package.json << 'EOF'
{"name": "test", "version": "1.0.0"}
EOF

# Try to install a package
if npm install lodash@4.17.15 --registry "$REGISTRY_URL" > /dev/null 2>&1; then
    pass "npm install lodash@4.17.15 succeeded"
else
    fail "npm install should work"
fi

cd - > /dev/null
rm -rf "$TEMP_DIR"

# ============================================================================
# RESULTS
# ============================================================================

echo ""
echo "============================================"
echo -e "  ${GREEN}All tests passed!${NC}"
echo "============================================"
echo ""
echo "Features verified:"
echo "  • Container build and startup"
echo "  • Package proxying from upstream npm"
echo "  • Date-based version filtering"
echo "  • Version-specific blocking"
echo "  • Scoped package filtering"
echo "  • Combined filtering rules"
echo "  • Hot reload of denylist changes"
echo "  • Allowlist to bypass date filtering"
echo "  • dist-tags update after filtering"
echo "  • npm install compatibility"
echo ""
