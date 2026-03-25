# PullMatch MVP

PullMatch is the intelligence layer for software decisions. It analyzes pull requests to surface the right reviewer, the right context, and the right decision -- fast.

## Core User Flow

1. Developer opens a PR on GitHub.
2. PullMatch analyzes the diff: files changed, domains touched, complexity signals.
3. PullMatch recommends the best reviewer(s) based on code ownership, recent activity, and expertise.
4. Reviewer gets a context brief: why they were picked, what to focus on, and relevant prior decisions.

## First 3 Features (MVP Scope)

### 1. Smart Reviewer Matching
- Analyze PR diffs to identify which files and modules are touched.
- Match against a contributor graph (git blame history, review history, file ownership).
- Recommend 1-2 reviewers ranked by relevance.

### 2. PR Context Brief
- For each recommended reviewer, generate a short brief: what changed, why it matters, and what to look for.
- Pull from commit messages, linked issues, and prior review threads on the same files.

### 3. GitHub Integration
- GitHub App that listens for PR events (opened, updated).
- Posts reviewer recommendations as a PR comment.
- Minimal config: install the app, point it at a repo, done.

## Out of Scope (for MVP)

- Slack/Teams notifications
- Custom review policies or routing rules
- Multi-repo or monorepo-specific logic
- Analytics dashboards
- Self-hosted / on-prem deployment
- CI/CD integration or merge gating
- User accounts or billing
