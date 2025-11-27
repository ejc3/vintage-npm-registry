.PHONY: build run stop logs clean test test-registry help

IMAGE_NAME := vintage-npm-registry
CONTAINER_NAME := vintage-npm-registry

# Default target
help:
	@echo "Vintage NPM Registry - Available commands:"
	@echo ""
	@echo "  make build         - Build the container image"
	@echo "  make run           - Start the registry"
	@echo "  make stop          - Stop the registry"
	@echo "  make logs          - View registry logs"
	@echo "  make clean         - Remove container and image"
	@echo ""
	@echo "  make test          - Run all tests (unit + e2e)"
	@echo "  make test-registry - Quick test of running registry"
	@echo ""

# Container commands
build:
	podman build -t $(IMAGE_NAME) .

run: build
	podman run -d --name $(CONTAINER_NAME) \
		-p 4873:4873 \
		-v ./denylist.txt:/verdaccio/conf/denylist.txt:ro \
		-v vintage-storage:/verdaccio/storage \
		$(IMAGE_NAME)
	@echo ""
	@echo "Registry is starting at http://localhost:4873"
	@echo ""
	@echo "To use this registry:"
	@echo "  npm config set registry http://localhost:4873"
	@echo ""
	@echo "Or per-command:"
	@echo "  npm install lodash --registry http://localhost:4873"
	@echo ""

stop:
	-podman stop $(CONTAINER_NAME)
	-podman rm $(CONTAINER_NAME)

logs:
	podman logs -f $(CONTAINER_NAME)

clean: stop
	-podman rmi $(IMAGE_NAME)
	-podman volume rm vintage-storage
	rm -rf plugin/dist plugin/node_modules

# Test the running registry
test-registry:
	@echo "Testing registry at http://localhost:4873..."
	@echo ""
	@echo "1. Ping test:"
	@curl -s http://localhost:4873/-/ping && echo " OK" || echo " FAILED"
	@echo ""
	@echo "2. Fetching lodash versions:"
	@npm view lodash versions --registry http://localhost:4873 2>/dev/null | head -5 || echo "   (run 'make run' first)"
	@echo ""

# Run all tests (unit + e2e)
test:
	cd plugin && npm install && npm test
