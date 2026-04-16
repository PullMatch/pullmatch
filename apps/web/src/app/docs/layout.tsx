import type { Metadata } from "next";
import styles from "./docs.module.css";

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "Learn how to install, configure, and get the most out of PullMatch — smart reviewer suggestions for every pull request.",
};

const NAV_ITEMS = [
  { slug: "getting-started", label: "Getting Started" },
  { slug: "configuration", label: "Configuration" },
  { slug: "faq", label: "FAQ" },
  { slug: "local-dev", label: "Local Development" },
];

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.docsLayout}>
      <aside className={styles.sidebar}>
        <p className={styles.sidebarTitle}>Documentation</p>
        <ul className={styles.sidebarNav}>
          {NAV_ITEMS.map((item) => (
            <li key={item.slug}>
              <a href={`/docs/${item.slug}`}>{item.label}</a>
            </li>
          ))}
        </ul>
      </aside>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
