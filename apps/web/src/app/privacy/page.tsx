export const metadata = {
  title: "Privacy Policy | PullMatch",
  description: "How PullMatch handles GitHub data for reviewer suggestions.",
};

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 760, margin: "64px auto", padding: "0 20px", fontFamily: "system-ui" }}>
      <h1>Privacy Policy</h1>
      <p>Last updated: April 16, 2026</p>

      <h2>What PullMatch collects</h2>
      <p>
        PullMatch reads GitHub pull request metadata, commit authors, and repository structure signals from git
        blame analysis. This is used to understand who has context on changed code.
      </p>

      <h2>How we use this data</h2>
      <p>We use this data to generate reviewer suggestions and lightweight PR analysis for your team.</p>

      <h2>How we do not use this data</h2>
      <p>We do not sell your data. We do not use repository data to train foundation models.</p>

      <h2>Data retention</h2>
      <p>
        PullMatch is session-scoped by default. Data is not persisted long-term unless your team explicitly opts in to
        longer retention.
      </p>

      <h2>Your control</h2>
      <p>You can remove PullMatch access at any time by uninstalling the GitHub App from your organization.</p>

      <h2>Contact</h2>
      <p>
        For privacy questions or requests, contact{" "}
        <a href="mailto:privacy@pullmatch.dev">privacy@pullmatch.dev</a>.
      </p>
    </main>
  );
}
