# Contributing to PullMatch

Thanks for your interest in contributing to PullMatch! This guide will help you get set up.

## Local Development Setup

See [docs/local-dev.md](docs/local-dev.md) for full instructions. The quick version:

```bash
# Prerequisites: Node.js 22+, pnpm
pnpm install

# Start the API server
cd apps/api && pnpm dev

# Run tests
node --experimental-strip-types --test packages/shared/src/__tests__/*.test.ts
```

For GitHub webhook testing, see [docs/github-app-setup.md](docs/github-app-setup.md).

## Running Tests

Run the full test suite before submitting a PR:

```bash
node --experimental-strip-types --test packages/shared/src/__tests__/*.test.ts
```

Tests cover the core scoring engine, CODEOWNERS parsing, and reviewer ranking logic.

## Pull Request Guidelines

1. **Keep PRs focused.** One logical change per PR.
2. **Add tests** for new scoring logic or bug fixes in the shared package.
3. **Update docs** if your change affects configuration options or user-facing behavior.
4. **Write clear commit messages** that explain *why*, not just *what*.
5. **Ensure tests pass** before requesting review.

## Project Structure

```
apps/api/       — Hono-based webhook API server
apps/web/       — Next.js marketing/install site
packages/shared/ — Core scoring engine, types, and utilities
docs/           — User-facing documentation
```

## Code of Conduct

We are committed to providing a welcoming and inclusive experience for everyone. Please be respectful and constructive in all interactions. Harassment, discrimination, and disruptive behavior will not be tolerated.

## Questions?

Open a [GitHub Discussion](https://github.com/pullmatch/pullmatch/discussions) or reach out at hello@pullmatch.dev.
