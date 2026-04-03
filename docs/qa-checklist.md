# QA Checklist

## Webhook E2E Verification

- [ ] Health endpoint returns 200
- [ ] Webhook receives `pull_request.opened` events
- [ ] Webhook signature validation passes
- [ ] Contributor graph builds from commit history
- [ ] Reviewer recommendations posted as PR comment
- [ ] No unhandled exceptions in logs

## Last verified

- Date: 2026-04-03
- Method: Test PR opened to verify webhook delivery
