import type { Metadata } from "next";
import "@insurance/ui/styles.css";
export const metadata: Metadata = { title: "Platform administration | Coverline", description: "Secure insurance admin portal", };
export default function Layout({children}: Readonly<{children: React.ReactNode}>) { return <html lang="en"><body>{children}</body></html>; }
