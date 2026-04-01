import styles from "./page.module.css";

export default function SuccessPage() {
  return (
    <main className={styles.container}>
      <section className={styles.hero}>
        <div className={styles.checkmark}>&#10003;</div>
        <h1>You&apos;re all set!</h1>
        <p>
          PullMatch is now installed on your repository. Open a pull request and
          you&apos;ll see reviewer suggestions automatically.
        </p>
      </section>

      <section className={styles.nextSteps}>
        <h2>What happens next</h2>
        <ol className={styles.stepList}>
          <li>
            <strong>Open or update a pull request</strong> in any repository
            where PullMatch is installed.
          </li>
          <li>
            <strong>PullMatch analyzes the diff</strong>, commit history, and
            CODEOWNERS to find the best reviewers.
          </li>
          <li>
            <strong>A comment appears on your PR</strong> with ranked reviewer
            suggestions and the reasoning behind each one.
          </li>
        </ol>
      </section>

      <div className={styles.actions}>
        <a href="/" className={styles.link}>
          Back to home
        </a>
        <a href="/dashboard" className={styles.link}>
          View dashboard
        </a>
      </div>
    </main>
  );
}
