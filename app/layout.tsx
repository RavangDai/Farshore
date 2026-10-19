import type { Metadata } from "next";
import "../src/styles.css";
import "./online.css";
import "../src/farshore-brand.css";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "FARSHORE | Eight Trials. One Journey Home.",
  description: "FARSHORE: eight playable Greek mythology arcade trials inspired by Homer’s Odyssey. Rescue your crew, outwit the gods, and bring Odysseus home.",
  robots: { index: false, follow: false },
  // Declared explicitly: without this the browser falls back to requesting
  // /favicon.ico, which this project does not ship, and logs a 404.
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }] },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
