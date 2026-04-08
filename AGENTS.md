# Better Life Naver — Agent Instructions

네이버 블로그 자동화 프로젝트를 위한 AI 에이전트 시스템.

**Version:** 1.9.0 (based on Everything Claude Code)

## Core Principles

1. **Agent-First** — Delegate to specialized agents for domain tasks
2. **Test-Driven** — Write tests before implementation, 80%+ coverage required
3. **Security-First** — Never compromise on security; validate all inputs
4. **Immutability** — Always create new objects, never mutate existing ones
5. **Plan Before Execute** — Plan complex features before writing code

## Available Agents

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| planner | Implementation planning | Complex features, refactoring |
| architect | System design and scalability | Architectural decisions |
| tdd-guide | Test-driven development | New features, bug fixes |
| code-reviewer | Code quality and maintainability | After writing/modifying code |
| security-reviewer | Vulnerability detection | Before commits, sensitive code |
| build-error-resolver | Fix build/type errors | When build fails |
| e2e-runner | End-to-end Playwright testing | Critical user flows |
| refactor-cleaner | Dead code cleanup | Code maintenance |
| doc-updater | Documentation and codemaps | Updating docs |
| performance-optimizer | Performance analysis | Slow operations |
| typescript-reviewer | TypeScript/JavaScript code review | TS/JS projects |

## Agent Orchestration

Use agents proactively without user prompt:
- Complex feature requests → **planner**
- Code just written/modified → **code-reviewer**
- Bug fix or new feature → **tdd-guide**
- Architectural decision → **architect**
- Security-sensitive code → **security-reviewer**

Use parallel execution for independent operations — launch multiple agents simultaneously.

## Security Guidelines

**Before ANY commit:**
- No hardcoded secrets (API keys, passwords, tokens)
- All user inputs validated
- XSS prevention (sanitized HTML)
- Authentication/authorization verified
- Error messages don't leak sensitive data

**Secret management:** NEVER hardcode secrets. Use environment variables or .env files.

## Coding Style

**Immutability (CRITICAL):** Always create new objects, never mutate.

**File organization:** Many small files over few large ones. 200-400 lines typical, 800 max.

**Error handling:** Handle errors at every level. Never silently swallow errors.

**Input validation:** Validate all user input at system boundaries.

**Code quality checklist:**
- Functions small (<50 lines), files focused (<800 lines)
- No deep nesting (>4 levels)
- Proper error handling, no hardcoded values
- Readable, well-named identifiers

## Testing Requirements

**Minimum coverage: 80%**

**TDD workflow:**
1. Write test first (RED) — test should FAIL
2. Write minimal implementation (GREEN) — test should PASS
3. Refactor (IMPROVE) — verify coverage 80%+

## Development Workflow

1. **Plan** — Use planner agent, identify dependencies and risks
2. **TDD** — Use tdd-guide agent, write tests first
3. **Review** — Use code-reviewer agent immediately
4. **Commit** — Conventional commits format

## Git Workflow

**Commit format:** `<type>: <description>` — Types: feat, fix, refactor, docs, test, chore, perf, ci

## Performance

**Build troubleshooting:** Use build-error-resolver agent → analyze errors → fix incrementally → verify after each fix.

## Success Metrics

- All tests pass with 80%+ coverage
- No security vulnerabilities
- Code is readable and maintainable
- User requirements are met
