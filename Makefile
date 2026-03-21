.PHONY: setup dev down logs test test-coverage clean

# First-time setup: copy env template, install deps
setup:
	@if [ ! -f API/.env ]; then \
		cp API/.env.example API/.env; \
		echo "Created API/.env from template — fill in your values before running 'make dev'"; \
	else \
		echo "API/.env already exists, skipping copy"; \
	fi
	cd API && npm install

# Start dev environment: Redis (Docker) + API (local with hot reload)
dev:
	docker compose up -d
	@echo ""
	@echo "Redis running at localhost:6379"
	@echo "Starting API with hot reload..."
	@echo ""
	cd API && npm run dev

# Stop Redis
down:
	docker compose down

# Tail Redis logs
logs:
	docker compose logs -f

# Run tests
test:
	cd API && npm test

# Run tests with coverage
test-coverage:
	cd API && npm run test:coverage

# Nuke Redis container + volume
clean:
	docker compose down -v
	@echo "Cleaned up containers and volumes"
