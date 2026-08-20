import type { Metadata } from "next";
import "./globals.css";
import "./scale.css";
export const metadata: Metadata = { title: "Kontyn — A mission that outlives its operator", description: "Mission-bound autonomous organizations on GenLayer.", icons: { icon: "/favicon.svg" } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
