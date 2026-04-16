import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.container}>
      {/* ── Hero ── */}
      <section className={styles.hero}>
        <p className={styles.badge}>GitHub App</p>
        <h1>
          Stop guessing who should review your PRs
        </h1>
        <p className={styles.heroSub}>
          PullMatch analyzes your code changes, commit history, and CODEOWNERS
          to surface the right reviewer — instantly, on every pull request.
        </p>
        <div className={styles.heroCtas}>
          <a
            href="https://github.com/apps/pullmatch/installations/new"
            className={styles.ctaPrimary}
          >
            Install on GitHub — Free
          </a>
          <a href="#how-it-works" className={styles.ctaSecondary}>
            See how it works &darr;
          </a>
        </div>
      </section>

      {/* ── Social Proof ── */}
      <section className={styles.socialProof}>
        <p className={styles.socialLabel}>Trusted by engineering teams at</p>
        <div className={styles.logoRow}>
          <span className={styles.logoPlaceholder}>YourCo</span>
          <span className={styles.logoPlaceholder}>Acme Inc</span>
          <span className={styles.logoPlaceholder}>Devtools Co</span>
          <span className={styles.logoPlaceholder}>StartupHQ</span>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className={styles.section} id="how-it-works">
        <h2>Up and running in 60 seconds</h2>
        <div className={styles.steps}>
          <article className={styles.card}>
            <div className={styles.stepNumber}>1</div>
            <h3>Install the GitHub App</h3>
            <p>One click. No config files, no tokens, no YAML.</p>
          </article>
          <article className={styles.card}>
            <div className={styles.stepNumber}>2</div>
            <h3>Open a pull request</h3>
            <p>Push your branch and open a PR like you always do.</p>
          </article>
          <article className={styles.card}>
            <div className={styles.stepNumber}>3</div>
            <h3>Get the right reviewer</h3>
            <p>
              PullMatch comments with ranked suggestions and the reasoning
              behind each pick.
            </p>
          </article>
        </div>
      </section>

      {/* ── Code Preview ── */}
      <section className={styles.section}>
        <h2>What you see on every PR</h2>
        <div className={styles.codeBlock}>
          <div className={styles.codeHeader}>
            <span className={styles.codeDot} />
            <span className={styles.codeDot} />
            <span className={styles.codeDot} />
            <span className={styles.codeTitle}>pullmatch bot</span>
          </div>
          <pre>{`## Suggested Reviewers

`}<span className={styles.highlight}>@alice</span>{`  — Score: 92
  Modified 14 of these files in the last 30 days
  Listed as CODEOWNER for src/api/

`}<span className={styles.highlight}>@bob</span>{`    — Score: 78
  Deep commit history on the auth module
  Reviewed 3 related PRs this month

`}<span className={styles.highlight}>@carol</span>{`  — Score: 65
  Recent contributor to shared utilities
  Familiar with the test patterns used here`}</pre>
        </div>
      </section>

      {/* ── Features ── */}
      <section className={styles.section} id="features">
        <h2>Why teams switch to PullMatch</h2>
        <div className={styles.featuresGrid}>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>&#128269;</div>
            <h3>Find the expert, not just the available</h3>
            <p>
              Surfaces reviewers with real file-level expertise based on commit
              history — not just whoever is online.
            </p>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>&#128220;</div>
            <h3>Respects your CODEOWNERS</h3>
            <p>
              Integrates with your existing ownership rules automatically. No
              duplicate configuration.
            </p>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>&#9889;</div>
            <h3>Faster review cycles</h3>
            <p>
              PRs get reviewed by the person who knows the code best, cutting
              back-and-forth and time-to-merge.
            </p>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>&#128268;</div>
            <h3>Zero config, instant value</h3>
            <p>
              Install once and start getting recommendations on your very next
              pull request. Nothing to maintain.
            </p>
          </div>
        </div>
      </section>

      {/* ── Testimonial ── */}
      <section className={styles.testimonial}>
        <blockquote>
          &ldquo;We used to spend 10 minutes per PR figuring out who should
          review it. PullMatch just handles it.&rdquo;
        </blockquote>
        <cite>— Engineering Lead, Series A startup</cite>
      </section>

      {/* ── Install CTA ── */}
      <section className={styles.ctaBanner} id="install">
        <h2>Ready to stop guessing?</h2>
        <p>
          Install in seconds. No configuration needed — PullMatch starts
          suggesting reviewers on your very next pull request.
        </p>
        <div className={styles.ctaBannerActions}>
          <a
            href="https://github.com/apps/pullmatch/installations/new"
            className={styles.ctaPrimary}
          >
            Install on GitHub — Free
          </a>
          <a href="#how-it-works" className={styles.ctaSecondary}>
            See how it looks first
          </a>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        <div className={styles.footerLeft}>
          <span className={styles.footerBrand}>PullMatch</span>
          <span>&copy; {new Date().getFullYear()}</span>
        </div>
        <ul className={styles.footerLinks}>
          <li>
            <a href="/docs/getting-started">Docs</a>
          </li>
          <li>
            <a href="https://github.com/PullMatch/pullmatch">GitHub</a>
          </li>
          <li>
            <a href="/privacy">Privacy</a>
          </li>
          <li>
            <a href="/terms">Terms</a>
          </li>
          <li>
            <a href="mailto:hello@pullmatch.com">Contact</a>
          </li>
        </ul>
      </footer>
    </main>
  );
}
