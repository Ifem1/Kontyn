"use client";

import { KontynShell } from "./kontyn/KontynShell";

export function KontynApp({ route = "Mission" }: { route?: string }) {
  return <KontynShell route={route} />;
}
