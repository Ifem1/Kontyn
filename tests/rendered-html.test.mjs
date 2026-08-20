import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("defines the Kontyn operational dashboard information architecture", async () => {
  const [page, shell, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/kontyn/KontynShell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /export const metadata:\s*Metadata/);
  for (const section of ["Mission", "Charter", "Objectives", "Capabilities", "Treasury", "Epochs", "Governance", "Constitution", "Keeper", "Audit"]) {
    assert.match(shell, new RegExp(section));
  }
  for (const view of ["MissionView", "CharterView", "ObjectivesView", "CapabilitiesView", "TreasuryView", "EpochsView", "GovernanceView", "ConstitutionView", "KeeperView", "AuditView"]) {
    assert.match(shell, new RegExp(`function ${view}`));
  }
  assert.match(shell, /Load state/);
  assert.match(shell, /Not loaded/);
  assert.match(css, /\.selector-strip/);
  assert.match(css, /\.metrics/);
  assert.match(css, /\.data-card/);
  assert.match(css, /\.badge/);
  assert.match(css, /@media \(max-width: 980px\)/);
  assert.doesNotMatch(shell, /Your site is taking shape|Building your site/);
});

test("keeps contract and deployment surfaces out of the UX refactor", async () => {
  const [contract, config, queue, fullCycle, exercise, continuation, shell] = await Promise.all([
    readFile(new URL("../contracts/kontyn.py", import.meta.url), "utf8"),
    readFile(new URL("../lib/genlayer/config.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/genlayer/queue.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/full-cycle-studionet.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/exercise-studionet.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/continue-studionet-cycle.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/components/kontyn/KontynShell.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(config, /NEXT_PUBLIC_KONTYN_CONTRACT_ADDRESS/);
  assert.match(config, /NEXT_PUBLIC_GENLAYER_CHAIN/);
  assert.match(queue, /NEXT_PUBLIC_STUDIO_RPM/);
  assert.match(contract, /class KontynProtocol/);
  assert.match(fullCycle, /KONTYN_EVIDENCE_URL is required/);
  assert.match(exercise, /create_org/);
  assert.match(continuation, /recover_treasury/);
  assert.match(shell, /writeContract/);
  assert.match(shell, /waitForTransactionReceipt/);
  assert.match(shell, /txExecutionResultName/);
  assert.match(shell, /create_org/);
  assert.match(shell, /open_epoch/);
  assert.match(shell, /withdraw_allocation/);
});
