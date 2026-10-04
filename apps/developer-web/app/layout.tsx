import type { Metadata } from "next";
import "@insurance/ui/styles.css";
export const metadata: Metadata = { title: "Build with confidence | Coverline", description: "Secure insurance developer portal", };
export default function Layout({children}: Readonly<{children: React.ReactNode}>) { return <html lang="en"><body>{children}</body></html>; }
