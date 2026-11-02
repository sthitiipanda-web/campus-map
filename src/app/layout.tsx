import type { Metadata, Viewport } from "next";
import { Instrument_Sans } from "next/font/google";
import "./globals.css";

// Placeholder typeface until the licensed-typeface decision (design direction §11).
const instrument = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Roehampton Campus Navigator",
    template: "%s · Roehampton Campus Navigator",
  },
  description:
    "On-foot wayfinding across the University of Roehampton parkland campus: buildings, step-free routes and campus facilities.",
};

// Nonce-based CSP (src/proxy.ts) needs every page rendered per request:
// statically prerendered HTML carries no nonce, so browsers block Next's
// own bootstrap scripts in production and the app never hydrates.
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f0" },
    { media: "(prefers-color-scheme: dark)", color: "#161b14" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={instrument.variable}>
      {/* suppressHydrationWarning: browser extensions (e.g. Grammarly) inject
          attributes into <body> before hydration; attribute-only mismatches
          are expected and safe to ignore. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
