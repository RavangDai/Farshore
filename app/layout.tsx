import type { Metadata } from "next";
import "../src/styles.css";
import "./online.css";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "FARSHORE | Eight Trials. One Journey Home.",
  description: "FARSHORE: eight playable Greek mythology arcade trials inspired by Homer’s Odyssey. Rescue your crew, outwit the gods, and bring Odysseus home.",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
