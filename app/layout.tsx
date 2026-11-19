import type { Metadata } from "next";
import "@fontsource-variable/cinzel/wght.css";
import "@fontsource-variable/cormorant-garamond/wght.css";
import "@fontsource-variable/cormorant-garamond/wght-italic.css";
import "@fontsource-variable/inter/wght.css";
import "../src/styles/global.css";
import "./online.css";
import "../src/styles/farshore-brand.css";
import "../src/styles/cinema-shell.css";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "FARSHORE | Eight Trials. One Journey Home.",
  description: "FARSHORE: a cinematic voyage through eight trials from Homer’s Odyssey, against trained and adaptive AI rivals. Rescue your crew, outwit the gods, and bring Odysseus home.",
  robots: { index: false, follow: false },
  // Declared explicitly: without this the browser falls back to requesting
  // /favicon.ico, which this project does not ship, and logs a 404.
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }] },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
