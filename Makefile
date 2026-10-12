.PHONY: test check dist security-check

test:
	go test -race ./server
	npm --prefix webapp test
check:
	go vet ./server
	npm --prefix webapp run typecheck
	npm --prefix webapp run lint
dist:
	./scripts/build.sh
security-check:
	./scripts/security-check.sh
