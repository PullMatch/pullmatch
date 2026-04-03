import type { Metadata } from "next";
import "./globals.css";

const SITE_URL = "https://pullmatch.dev";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "PullMatch — Smart reviewer suggestions for every pull request",
    template: "%s | PullMatch",
  },
  description:
    "PullMatch analyzes code changes and contributor history to recommend the right reviewer with clear context on what matters most.",
  alternates: {
    canonical: "./",
  },
  icons: {
    icon: "/favicon.svg",
    apple: "/favicon.svg",
  },
  openGraph: {
    title: "PullMatch",
    description:
      "Smart reviewer suggestions for every pull request. Install the GitHub App and get ranked reviewer recommendations automatically.",
    siteName: "PullMatch",
    type: "website",
    url: SITE_URL,
  },
  twitter: {
    card: "summary",
    title: "PullMatch",
    description:
      "Smart reviewer suggestions for every pull request. Install the GitHub App and get ranked reviewer recommendations automatically.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "PullMatch",
      url: SITE_URL,
      logo: `${SITE_URL}/favicon.svg`,
      description:
        "Smart reviewer suggestions for every pull request. PullMatch analyzes code changes and contributor history to recommend the right reviewer.",
    },
    {
      "@type": "WebSite",
      name: "PullMatch",
      url: SITE_URL,
      description:
        "PullMatch analyzes code changes and contributor history to recommend the right reviewer with clear context on what matters most.",
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <div className="siteShell">
          <header className="siteHeader">
            <div className="siteInner">
              <a href="/" className="siteLogo">
                PullMatch
              </a>
              <nav aria-label="Main navigation">
                <ul className="siteNavLinks">
                  <li>
                    <a href="/">Home</a>
                  </li>
                  <li>
                    <a href="/dashboard">Dashboard</a>
                  </li>
                  <li>
                    <a href="https://github.com/PullMatch/pullmatch">GitHub</a>
                  </li>
                </ul>
              </nav>
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
