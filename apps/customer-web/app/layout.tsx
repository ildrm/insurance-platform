import type { Metadata } from "next";
import "@insurance/ui/styles.css";
export const metadata: Metadata = { title: "Your cover, clearly | Coverline", description: "Secure insurance customer portal", manifest: "/manifest.webmanifest", };
export default function Layout({children}: Readonly<{children: React.ReactNode}>) { return <html lang="en"><body>{children}</body></html>; }
