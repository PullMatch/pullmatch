import Link from "next/link";

export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: "80px auto", fontFamily: "system-ui", padding: "0 20px" }}>
      <h1>PullMatch</h1>
      <p>The intelligence layer for software decisions.</p>
      <p style={{ color: "#666" }}>
        Smart reviewer matching, context briefs, and GitHub integration — coming soon.
      </p>
      <footer style={{ marginTop: 48, paddingTop: 16, borderTop: "1px solid #e5e5e5", display: "flex", gap: 16 }}>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </footer>
    </main>
  );
}
