export const metadata = {
  title: "Terms of Service | PullMatch",
  description: "Terms for using PullMatch and the PullMatch GitHub App.",
};

export default function TermsPage() {
  return (
    <main style={{ maxWidth: 760, margin: "64px auto", padding: "0 20px", fontFamily: "system-ui" }}>
      <h1>Terms of Service</h1>
      <p>Last updated: April 16, 2026</p>

      <h2>Acceptable use</h2>
      <p>
        You agree not to abuse PullMatch infrastructure, scrape the service in bulk, or send malicious traffic to API
        and webhook endpoints.
      </p>

      <h2>Service scope</h2>
      <p>
        PullMatch provides reviewer suggestions and PR context support. You remain responsible for engineering,
        security, and release decisions.
      </p>

      <h2>No warranty</h2>
      <p>
        PullMatch is provided as-is without warranties of any kind, express or implied, including fitness for a
        particular purpose.
      </p>

      <h2>GitHub App control</h2>
      <p>You can revoke PullMatch at any time by uninstalling the GitHub App from your account or organization.</p>

      <h2>Changes</h2>
      <p>We may update these terms as the product evolves. Material changes will be reflected on this page.</p>
    </main>
  );
}
