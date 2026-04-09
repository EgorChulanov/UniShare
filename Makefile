.DEFAULT_GOAL := help

.PHONY: help bootstrap generate open secrets clean

help:
	@echo "UniShare — available commands:"
	@echo "  make bootstrap   Install dependencies and generate Xcode project"
	@echo "  make generate    Regenerate Xcode project from project.yml"
	@echo "  make open        Open workspace in Xcode"
	@echo "  make secrets     Copy secrets template (first-time setup)"
	@echo "  make clean       Remove derived data and generated project"

bootstrap:
	@echo "→ Checking for Homebrew..."
	@which brew > /dev/null || (echo "Install Homebrew first: https://brew.sh" && exit 1)
	@echo "→ Installing XcodeGen..."
	@brew install xcodegen 2>/dev/null || brew upgrade xcodegen
	@echo "→ Setting up secrets..."
	@$(MAKE) secrets
	@echo "→ Generating Xcode project..."
	@$(MAKE) generate
	@echo ""
	@echo "✓ Done! Next steps:"
	@echo "  1. Add Config/Secrets.xcconfig with your API keys"
	@echo "  2. Add GoogleService-Info.plist (from Firebase console)"
	@echo "  3. Run: make open"

generate:
	@xcodegen generate --spec project.yml
	@echo "✓ Xcode project generated"

open:
	@open UniShare.xcworkspace 2>/dev/null || open UniShare.xcodeproj

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
