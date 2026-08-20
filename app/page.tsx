import type { Metadata } from "next";
import { KontynApp } from "./components/KontynApp";

export const metadata: Metadata = {
  title: "Kontyn - Mission Orrery",
  description: "Mission-bound autonomous organizations on GenLayer.",
};

export default function Home() { return <KontynApp />; }
