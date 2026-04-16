"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";

type ApiStats = {
  total_prs_analyzed: number;
  total_reviewers_suggested: number;
  active_installations: number;
  avg_response_ms: number;
};

type ApiRecentAnalysis = {
  repo: string;
  pr_number: number;
  reviewers_suggested: number;
  timestamp: string;
};

type DashboardMetric = {
  label: string;
  value: string;
  helper: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function toMetrics(stats: ApiStats): DashboardMetric[] {
  return [
    {
      label: "PRs analyzed",
      value: formatNumber(stats.total_prs_analyzed),
      helper: "Lifetime total",
    },
    {
      label: "Reviewers suggested",
      value: formatNumber(stats.total_reviewers_suggested),
      helper: "Across all analyses",
    },
    {
      label: "Active installations",
      value: formatNumber(stats.active_installations),
      helper: "Repositories connected",
    },
    {
      label: "Average response time",
      value: `${Math.round(stats.avg_response_ms)} ms`,
      helper: "Webhook to recommendation",
    },
  ];
}

function formatTimestamp(isoTimestamp: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(isoTimestamp));
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetric[] | null>(null);
  const [recent, setRecent] = useState<ApiRecentAnalysis[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [statsRes, recentRes] = await Promise.all([
          fetch(`${API_BASE}/api/stats`),
          fetch(`${API_BASE}/api/recent`),
        ]);

        if (!statsRes.ok) throw new Error(`Stats API returned ${statsRes.status}`);
        if (!recentRes.ok) throw new Error(`Recent API returned ${recentRes.status}`);

        const stats: ApiStats = await statsRes.json();
        const analyses: ApiRecentAnalysis[] = await recentRes.json();

        if (!cancelled) {
          setMetrics(toMetrics(stats));
          setRecent(analyses);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load dashboard data");
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <main className={styles.container}>
        <section className={styles.header}>
          <h1>Usage dashboard</h1>
        </section>
        <div className={styles.errorBanner} role="alert">
          <p>Unable to load dashboard data: {error}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </main>
    );
  }

  const loading = metrics === null;

  return (
    <main className={styles.container}>
      <section className={styles.header}>
        <h1>Usage dashboard</h1>
        <p>
          Real-time analytics from the PullMatch analysis engine.
        </p>
      </section>

      <section className={styles.metricGrid} aria-label="Summary metrics">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <article key={i} className={`${styles.metricCard} ${styles.skeleton}`}>
                <h2>&nbsp;</h2>
                <strong>&nbsp;</strong>
                <p>&nbsp;</p>
              </article>
            ))
          : metrics.map((metric) => (
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
          {recent && <span>Latest {recent.length}</span>}
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
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className={styles.skeleton}>
                    <td>&nbsp;</td>
                    <td>&nbsp;</td>
                    <td>&nbsp;</td>
                    <td>&nbsp;</td>
                  </tr>
                ))
              ) : recent && recent.length > 0 ? (
                recent.map((analysis) => (
                  <tr key={`${analysis.repo}-${analysis.pr_number}`}>
                    <td>{analysis.repo}</td>
                    <td>#{analysis.pr_number}</td>
                    <td>{analysis.reviewers_suggested}</td>
                    <td>{formatTimestamp(analysis.timestamp)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className={styles.emptyRow}>
                    No analyses recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
