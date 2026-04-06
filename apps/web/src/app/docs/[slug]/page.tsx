import { notFound } from "next/navigation";
import fs from "node:fs";
import path from "node:path";
import { remark } from "remark";
import html from "remark-html";
import type { Metadata } from "next";
import styles from "../docs.module.css";

const DOCS: Record<string, { file: string; title: string }> = {
  "getting-started": {
    file: "getting-started.md",
    title: "Getting Started",
  },
  configuration: { file: "configuration.md", title: "Configuration" },
  faq: { file: "faq.md", title: "FAQ" },
  "local-dev": { file: "local-dev.md", title: "Local Development" },
};

const DOCS_DIR = path.join(process.cwd(), "..", "..", "docs");

function getDoc(slug: string): { content: string; title: string } | null {
  const entry = DOCS[slug];
  if (!entry) return null;

  const filePath = path.join(DOCS_DIR, entry.file);
  if (!fs.existsSync(filePath)) return null;

  return { content: fs.readFileSync(filePath, "utf-8"), title: entry.title };
}

export function generateStaticParams() {
  return Object.keys(DOCS).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = DOCS[slug];
  if (!entry) return {};
  return {
    title: `${entry.title} — Docs`,
    description: `PullMatch documentation: ${entry.title}`,
  };
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) notFound();

  const result = await remark().use(html).process(doc.content);
  const htmlContent = result.toString();

  return (
    <article
      className={styles.prose}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
}
