import type { Metadata } from "next";
import { HomeLanding } from "./components/kontyn/HomeLanding";

export const metadata: Metadata = {
  title: "Kontyn - Mission Orrery",
  description: "Mission-bound autonomous organizations on GenLayer.",
};

export default function Home() { return <HomeLanding />; }
