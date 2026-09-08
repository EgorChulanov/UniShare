.DEFAULT_GOAL := help

.PHONY: help bootstrap generate open secrets clean backend-start backend-reset backend-stop backend-demo test-static test-backend test-e2e test-ui-e2e

help:
	@echo "UniShare — available commands:"
	@echo "  make bootstrap   Install dependencies and generate Xcode project"
	@echo "  make generate    Regenerate Xcode project from project.yml"
	@echo "  make open        Open workspace in Xcode"
	@echo "  make secrets     Copy secrets template (first-time setup)"
	@echo "  make backend-start  Start local Supabase (requires Docker)"
	@echo "  make backend-reset  Rebuild local DB from migrations and seed"
	@echo "  make backend-stop   Stop local Supabase"
	@echo "  make backend-demo   Reset and seed local profiles, matches, chats and stories"
	@echo "  make test-backend   Validate schema and security rules in temporary Postgres"
	@echo "  make test-static    Validate localizations and release metadata"
	@echo "  make test-e2e       Run the three-user local Supabase E2E scenario"
	@echo "  make test-ui-e2e    Register, onboard and delete a real local user in Simulator"
	@echo "  make clean       Remove derived data and generated project"

bootstrap:
	@echo "→ Checking for Homebrew..."
	@which brew > /dev/null || (echo "Install Homebrew first: https://brew.sh" && exit 1)
	@echo "→ Installing XcodeGen..."
	@brew install xcodegen 2>/dev/null || brew upgrade xcodegen
	@echo "→ Installing Supabase CLI..."
	@brew install supabase/tap/supabase 2>/dev/null || brew upgrade supabase/tap/supabase
	@echo "→ Setting up secrets..."
	@$(MAKE) secrets
	@echo "→ Generating Xcode project..."
	@$(MAKE) generate
	@echo ""
	@echo "✓ Done! Next steps:"
	@echo "  1. Add Config/Secrets.xcconfig with your API keys"
	@echo "  2. Run the Supabase migrations from docs/SUPABASE_SETUP.md"
	@echo "  3. Run: make open"

generate:
	@xcodegen generate --spec project.yml
	@echo "✓ Xcode project generated"

open:
	@open UniShare.xcworkspace 2>/dev/null || open UniShare.xcodeproj

backend-start:
	@./scripts/start_local_supabase.sh

backend-reset:
	@supabase db reset

backend-stop:
	@supabase stop

backend-demo:
	@./scripts/seed_local_demo.sh

test-backend:
	@./scripts/test_supabase_schema.sh

test-static:
	@ruby scripts/check_localizations.rb
	@ruby scripts/check_release_metadata.rb
	@./scripts/check_legal_pages.sh
	@plutil -lint UniShare/Info.plist UniShare/PrivacyInfo.xcprivacy UniShare/UniShare.entitlements

test-e2e:
	@./scripts/e2e_supabase.sh

test-ui-e2e:
	@./scripts/run_local_ui_e2e.sh

secrets:
	@if [ ! -f Config/Secrets.xcconfig ]; then \
		cp Config/Secrets.xcconfig.template Config/Secrets.xcconfig; \
		echo "✓ Created Config/Secrets.xcconfig — fill in your API keys"; \
	else \
		echo "→ Config/Secrets.xcconfig already exists, skipping"; \
	fi

clean:
	@rm -rf UniShare.xcodeproj UniShare.xcworkspace DerivedData
	@echo "✓ Cleaned"
