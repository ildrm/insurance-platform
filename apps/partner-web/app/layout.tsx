import type { Metadata } from "next";
import "@insurance/ui/styles.css";
export const metadata: Metadata = { title: "Insurance operations | Coverline", description: "Secure insurance partner portal", };
export default function Layout({children}: Readonly<{children: React.ReactNode}>) { return <html lang="en"><body>{children}</body></html>; }
