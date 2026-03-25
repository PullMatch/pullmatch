import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PullMatch",
  description: "The intelligence layer for software decisions",
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
