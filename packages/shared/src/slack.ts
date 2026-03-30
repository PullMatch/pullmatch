export interface SlackReviewer {
  login: string;
  score: number;
}

export interface SlackPREvent {
  title: string;
  author: string;
  htmlUrl: string;
  repo: string;
  prNumber: number;
}

export interface SlackMessage {
  text: string;
  blocks: Array<Record<string, unknown>>;
  channel?: string;
}

export function formatSlackMessage(prEvent: SlackPREvent, reviewers: SlackReviewer[]): SlackMessage {
  const reviewerLines = reviewers.map((reviewer, index) => `${index + 1}. @${reviewer.login} (score: ${reviewer.score})`);
  const reviewerText = reviewerLines.length > 0 ? reviewerLines.join('\n') : 'No reviewer suggestions available.';

  return {
    text: `PullMatch suggestions for PR #${prEvent.prNumber}: ${prEvent.title}`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: 'PullMatch Reviewer Suggestions',
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Repository*\n${prEvent.repo}`,
          },
          {
            type: 'mrkdwn',
            text: `*PR*\n#${prEvent.prNumber}`,
          },
          {
            type: 'mrkdwn',
            text: `*Title*\n${prEvent.title}`,
          },
          {
            type: 'mrkdwn',
            text: `*Author*\n@${prEvent.author}`,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Suggested reviewers*\n${reviewerText}`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Open Pull Request',
              emoji: true,
            },
            url: prEvent.htmlUrl,
          },
        ],
      },
    ],
  };
}

export async function sendSlackNotification(webhookUrl: string, message: SlackMessage): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Slack webhook error ${response.status}: ${body}`);
  }
}
