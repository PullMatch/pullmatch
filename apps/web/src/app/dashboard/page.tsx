import styles from "./page.module.css";

type DashboardMetric = {
  label: string;
  value: string;
  helper: string;
};

type RecentAnalysis = {
  repository: string;
  pullRequestNumber: number;
  reviewersSuggested: number;
  analyzedAt: string;
};

const metrics: DashboardMetric[] = [
  { label: "PRs analyzed", value: "1,284", helper: "Last 30 days" },
  { label: "Reviewers suggested", value: "3,962", helper: "Across all analyses" },
  { label: "Active installations", value: "47", helper: "Repositories connected" },
  { label: "Average response time", value: "184 ms", helper: "Webhook to recommendation" },
];

const recentAnalyses: RecentAnalysis[] = [
  {
    repository: "pullmatch/pullmatch",
    pullRequestNumber: 208,
    reviewersSuggested: 3,
    analyzedAt: "2026-03-29T21:14:00Z",
  },
  {
    repository: "acme/api-platform",
    pullRequestNumber: 912,
    reviewersSuggested: 4,
    analyzedAt: "2026-03-29T20:42:00Z",
  },
  {
    repository: "orbit/web-client",
    pullRequestNumber: 154,
    reviewersSuggested: 2,
    analyzedAt: "2026-03-29T19:58:00Z",
  },
  {
    repository: "northstar/mobile-app",
    pullRequestNumber: 433,
    reviewersSuggested: 3,
    analyzedAt: "2026-03-29T18:17:00Z",
  },
];

function formatTimestamp(isoTimestamp: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(isoTimestamp));
}

export default function DashboardPage() {
  return (
    <main className={styles.container}>
      <section className={styles.header}>
        <h1>Usage dashboard</h1>
        <p>
          Placeholder analytics while we wire the live metrics API. Data below is
          mock data used to validate layout and information hierarchy.
        </p>
      </section>

      <section className={styles.metricGrid} aria-label="Summary metrics">
        {metrics.map((metric) => (
          <article key={metric.label} className={styles.metricCard}>
            <h2>{metric.label}</h2>
            <strong>{metric.value}</strong>
            <p>{metric.helper}</p>
          </article>
        ))}
      </section>

      <section className={styles.tableSection}>
        <div className={styles.tableHeading}>
          <h2>Recent PR analyses</h2>
          <span>Latest {recentAnalyses.length}</span>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Repository</th>
                <th>PR #</th>
                <th>Reviewers suggested</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {recentAnalyses.map((analysis) => (
                <tr key={`${analysis.repository}-${analysis.pullRequestNumber}`}>
                  <td>{analysis.repository}</td>
                  <td>#{analysis.pullRequestNumber}</td>
                  <td>{analysis.reviewersSuggested}</td>
                  <td>{formatTimestamp(analysis.analyzedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
