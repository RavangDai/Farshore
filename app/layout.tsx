import type { Metadata } from "next";
import { preload } from "react-dom";
import "../src/styles/global.css";
import "./online.css";
import "../src/styles/farshore-brand.css";
import "../src/styles/farshore-pixel-shell.css";
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
  // The pixel faces are needed on the first frame of every arcade screen.
  preload("/fonts/pixelify-sans.ttf", { as: "font", type: "font/ttf", crossOrigin: "" });
  preload("/fonts/press-start-2p.ttf", { as: "font", type: "font/ttf", crossOrigin: "" });
  return <html lang="en"><body>{children}</body></html>;
}
