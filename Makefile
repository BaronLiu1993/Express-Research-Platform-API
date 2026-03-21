.PHONY: setup dev down restart logs test clean

# First-time setup: copy env template, build containers, start everything
setup:
	@if [ ! -f API/.env ]; then \
		cp API/.env.example API/.env; \
		echo "Created API/.env from template — fill in your values before running 'make dev'"; \
	else \
		echo "API/.env already exists, skipping copy"; \
	fi
	docker compose build

# Start dev environment (API + Redis)
dev:
	docker compose up -d
	@echo ""
	@echo "API running at http://localhost:8080"
	@echo "Redis running at localhost:6379"
	@echo ""
	@echo "View logs:  make logs"
	@echo "Stop:       make down"

# Stop everything
down:
	docker compose down

# Restart API only (after code changes)
restart:
	docker compose up -d --build api

# Tail logs
logs:
	docker compose logs -f

# Tail API logs only
logs-api:
	docker compose logs -f api

# Run tests (locally, not in Docker)
test:
	cd API && npm test

# Run tests with coverage
test-coverage:
	cd API && npm run test:coverage

# Nuke everything: containers, volumes, images
clean:
	docker compose down -v --rmi local
	@echo "Cleaned up containers, volumes, and images"
