import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.container}>
      {/* ── Nav ── */}
      <nav className={styles.nav}>
        <a href="/" className={styles.logo}>
          PullMatch
        </a>
        <ul className={styles.navLinks}>
          <li>
            <a href="#how-it-works">How it works</a>
          </li>
          <li>
            <a href="#features">Features</a>
          </li>
          <li>
            <a href="https://github.com/PullMatch/pullmatch">GitHub</a>
          </li>
        </ul>
      </nav>

      {/* ── Hero ── */}
      <section className={styles.hero}>
        <h1>Smart reviewer suggestions for every pull request</h1>
        <p>
          PullMatch analyzes your code changes and contributor history to
          recommend the right reviewer — with clear context on what matters most.
        </p>
        <a href="#waitlist" className={styles.ctaPrimary}>
          Join the waitlist
        </a>
        <a href="#how-it-works" className={styles.ctaSecondary}>
          See how it works
        </a>
      </section>

      {/* ── How It Works ── */}
      <section className={styles.section} id="how-it-works">
        <h2>How it works</h2>
        <div className={styles.steps}>
          <article className={styles.card}>
            <div className={styles.stepNumber}>1</div>
            <h3>Install the GitHub App</h3>
            <p>Add PullMatch to your repository in one click. No config needed.</p>
          </article>
          <article className={styles.card}>
            <div className={styles.stepNumber}>2</div>
            <h3>Open a pull request</h3>
            <p>Push your branch and open or update a PR as you normally would.</p>
          </article>
          <article className={styles.card}>
            <div className={styles.stepNumber}>3</div>
            <h3>Get reviewer suggestions</h3>
            <p>
              PullMatch comments on the PR with ranked reviewer recommendations
              and the reasoning behind each one.
            </p>
          </article>
        </div>
      </section>

      {/* ── What You Get ── */}
      <section className={styles.section}>
        <h2>What the PR comment looks like</h2>
        <div className={styles.codeBlock}>
          <pre>{`## Suggested Reviewers

`}<span className={styles.highlight}>@alice</span>{`  — Score: 92
  • Modified 14 of these files in the last 30 days
  • Listed as CODEOWNER for src/api/

`}<span className={styles.highlight}>@bob</span>{`    — Score: 78
  • Deep commit history on the auth module
  • Reviewed 3 related PRs this month

`}<span className={styles.highlight}>@carol</span>{`  — Score: 65
  • Recent contributor to shared utilities
  • Familiar with the test patterns used here`}</pre>
        </div>
      </section>

      {/* ── Features ── */}
      <section className={styles.section} id="features">
        <h2>Why teams use PullMatch</h2>
        <ul className={styles.features}>
          <li>
            <strong>Commit history analysis</strong> — uses real contribution
            signals to rank reviewers by file-level expertise.
          </li>
          <li>
            <strong>CODEOWNERS support</strong> — respects your ownership rules
            without any extra configuration.
          </li>
          <li>
            <strong>Context-aware scoring</strong> — weights recency, depth, and
            review history so the best match floats to the top.
          </li>
          <li>
            <strong>Zero config</strong> — install once and start getting
            recommendations on every PR.
          </li>
        </ul>
      </section>

      {/* ── Waitlist CTA ── */}
      <section className={styles.ctaBanner} id="waitlist">
        <h2>Get early access</h2>
        <p>
          PullMatch is in private beta. Join the waitlist and we will reach out
          when your spot opens up.
        </p>
        <a
          href="https://forms.gle/pullmatch-waitlist"
          className={styles.ctaPrimary}
        >
          Join the waitlist
        </a>
      </section>

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        <span>&copy; {new Date().getFullYear()} PullMatch</span>
        <ul className={styles.footerLinks}>
          <li>
            <a href="https://github.com/PullMatch/pullmatch">GitHub</a>
          </li>
          <li>
            <a href="mailto:hello@pullmatch.com">Contact</a>
          </li>
        </ul>
      </footer>
    </main>
  );
}
