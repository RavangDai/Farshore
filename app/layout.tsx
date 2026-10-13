import type { Metadata } from "next";
import "../src/styles.css";
import "./online.css";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Farshore Online - The Odyssey: Arcade Trials",
  description: "Five Odyssey arcade trials. Sign in to keep your voyage with you across devices.",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
