import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateContextBrief } from '../context-brief.ts';
import type { ExpertiseMap } from '../expertise.ts';
import type { ReviewerRecommendation } from '../index.ts';

const recommendations: ReviewerRecommendation[] = [
  { login: 'alice', score: 12.4, reasons: ['strong ownership in API files'] },
  { login: 'bob', score: 10.1, reasons: ['recent activity in UI files'] },
];

describe('generateContextBrief', () => {
  it('returns one markdown brief per recommended reviewer', () => {
    const briefs = generateContextBrief(
      recommendations,
      ['apps/api/src/webhook.ts', 'packages/shared/src/matcher.ts'],
      ['feat(api): add reviewer ranking signal']
    );

    assert.equal(briefs.length, 2);
    assert.equal(briefs[0].reviewer, 'alice');
    assert.ok(briefs[0].brief.includes('**What changed:**'));
    assert.ok(briefs[0].brief.includes('**Why it matters:**'));
    assert.ok(briefs[0].brief.includes('**What to look for:**'));
  });

  it('extracts fix signal from commit messages', () => {
    const brief = generateContextBrief(
      [{ login: 'alice', score: 9, reasons: [] }],
      ['apps/api/src/routes/pr.ts'],
      ['fix(api): handle null reviewer list', 'fix: recover from API timeout']
    )[0];

    assert.ok(brief.brief.includes('fix-focused'));
  });

  it('uses expertise domain to suggest targeted focus areas', () => {
    const expertiseMap: ExpertiseMap = {
      alice: [{ domain: 'API', score: 8 }],
    };

    const brief = generateContextBrief(
      [{ login: 'alice', score: 9, reasons: [] }],
      ['apps/api/src/webhook.ts', 'docs/MVP.md'],
      ['feat(api): improve webhook router'],
      expertiseMap
    )[0];

    assert.ok(brief.brief.includes('API focus:'));
    assert.ok(brief.brief.includes('match your API domain'));
  });

  it('handles no commits with deterministic fallback text', () => {
    const brief = generateContextBrief(
      [{ login: 'alice', score: 9, reasons: [] }],
      ['packages/shared/src/matcher.ts'],
      []
    )[0];

    assert.ok(brief.brief.includes('No commit messages were provided'));
  });

  it('handles single-file changes and reviewer without prior history', () => {
    const brief = generateContextBrief(
      [{ login: 'new-reviewer', score: 4, reasons: [] }],
      ['README.md'],
      ['refactor(docs): simplify setup section']
    )[0];

    assert.ok(brief.brief.includes('Primary touched files: README.md.'));
    assert.ok(brief.brief.includes('Cross-domain review (Docs):'));
  });

  it('handles empty changed files input', () => {
    const brief = generateContextBrief(
      [{ login: 'alice', score: 6, reasons: [] }],
      [],
      ['feat: add support for context briefs']
    )[0];

    assert.ok(brief.brief.includes('No changed files were provided.'));
  });
});
