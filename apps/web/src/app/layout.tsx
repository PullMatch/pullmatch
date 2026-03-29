import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PullMatch — Smart reviewer suggestions for every pull request",
  description:
    "PullMatch analyzes code changes and contributor history to recommend the right reviewer with clear context on what matters most.",
  openGraph: {
    title: "PullMatch",
    description:
      "Smart reviewer suggestions for every pull request. Install the GitHub App and get ranked reviewer recommendations automatically.",
    siteName: "PullMatch",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
