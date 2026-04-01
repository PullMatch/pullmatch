import type { ContextBrief } from './index.ts';
import type { ExpertiseMap } from './expertise.ts';
import { formatExpertiseTag } from './expertise.ts';
import { PULLMATCH_MARKER } from './github.ts';

interface ReviewerRecommendationLike {
  login: string;
  score: number;
  reasons: string[];
}

interface FormatReviewerCommentParams {
  title: string;
  recommendations: ReviewerRecommendationLike[];
  briefs?: Map<string, ContextBrief>;
  expertiseMap?: ExpertiseMap;
  degradationNotes?: string[];
  footerNotes?: string[];
}

function quoteLines(markdown: string): string[] {
  return markdown.split('\n').map((line) => `> ${line}`);
}

export function formatReviewerComment(params: FormatReviewerCommentParams): string {
  const { title, recommendations, briefs, expertiseMap, degradationNotes = [], footerNotes = [] } = params;

  const lines: string[] = [
    PULLMATCH_MARKER,
    '## PullMatch Reviewer Suggestions',
    '',
    `Analyzed **${title}** and found ${recommendations.length} suggested reviewer(s) based on code ownership and recent activity.`,
    '',
  ];

  for (const recommendation of recommendations) {
    const expertiseTag = expertiseMap ? formatExpertiseTag(recommendation.login, expertiseMap) : undefined;
    const header = expertiseTag
      ? `### @${recommendation.login} (score: ${recommendation.score}) — ${expertiseTag}`
      : `### @${recommendation.login} (score: ${recommendation.score})`;
    lines.push(header);

    const brief = briefs?.get(recommendation.login);
    if (brief) {
      lines.push('> **Context:**');
      lines.push(...quoteLines(brief.brief));
    }

    for (const reason of recommendation.reasons) {
      lines.push(`- ${reason}`);
    }
    lines.push('');
  }

  if (recommendations.length === 0) {
    lines.push('No confident reviewer candidates were found for this PR yet.');
    lines.push('');
  }

  if (degradationNotes.length > 0) {
    lines.push('### Analysis Notes');
    for (const note of degradationNotes) {
      lines.push(`- ${note}`);
    }
    lines.push('');
  }

  if (footerNotes.length > 0) {
    for (const note of footerNotes) {
      lines.push(`- ${note}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('_Powered by [PullMatch](https://github.com/pullmatch)_');

  return lines.join('\n');
}
