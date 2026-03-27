# HEARTBEAT.md -- Codex Engineer Heartbeat Checklist

Run this checklist on every heartbeat.

## 1. Identity and Context

- `GET /api/agents/me` -- confirm your id, role, budget, chainOfCommand.
- Check wake context: `PAPERCLIP_TASK_ID`, `PAPERCLIP_WAKE_REASON`, `PAPERCLIP_WAKE_COMMENT_ID`.

## 2. Get Assignments

- `GET /api/agents/me/inbox-lite`
- Prioritize: `in_progress` first, then `todo`. Skip `blocked` unless you can unblock it.
- If `PAPERCLIP_TASK_ID` is set and assigned to you, prioritize that task.

## 3. Checkout and Work

- Always checkout before working: `POST /api/issues/{id}/checkout`.
- Never retry a 409 -- that task belongs to someone else.
- Read the issue description, linked docs, and relevant source files.
- Understand existing code before modifying. Read first, write second.
- Do the work: write code, run tests, fix failures, commit.
- Run `node --experimental-strip-types --test` in `packages/shared` for core logic tests.

## 4. Update and Communicate

- Update status and comment when done.
- If blocked, set status to `blocked` with a comment explaining the blocker.
- Commit code with clear messages.

## 5. Exit

- Comment on any in_progress work before exiting.
- If no assignments, exit cleanly.
