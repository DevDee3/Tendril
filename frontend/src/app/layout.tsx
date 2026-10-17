import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tendril — graph-native risk findings",
  description: "Structural risk findings for Solidity protocols, traced through a FalkorDB graph.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
