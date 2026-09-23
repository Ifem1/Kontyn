"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TransactionStatus } from "genlayer-js/types";
import { contractAddress, explorerBase, readClient } from "../../../lib/genlayer/config";
import { assertKontynTxSuccessful, isKontynTxSuccessful } from "../../../lib/genlayer/tx-success";
import { browserWallet, connectInjected, disconnectWallet, exportBrowserWallet, importBrowserWallet, restoreWallet, writeClient, type WalletState } from "../../../lib/genlayer/wallet";
import { studioQueue } from "../../../lib/genlayer/queue";

const nav = ["Mission", "Charter", "Objectives", "Capabilities", "Treasury", "Epochs", "Governance", "Constitution", "Keeper", "Audit"] as const;
const navGroups: Array<{ label: string; items: Section[] }> = [
  { label: "Organization", items: ["Mission", "Charter", "Objectives", "Capabilities"] },
  { label: "Control", items: ["Treasury", "Epochs", "Governance", "Constitution", "Keeper", "Audit"] },
];
type Section = typeof nav[number];
type TxState = { hash: string; stage: string; error?: string };
type SubmitOutcome = { verified: boolean; hash?: string; finalized?: boolean; receipt?: TransactionSnapshot };
type Loaded = { org?: string; charter?: string; treasury?: string; policy?: string; epoch?: string; action?: string; capability?: string; timing?: string };

type AppState = {
  active: Section; setActive: (section: Section) => void; wallet: WalletState | null; connect: (type: "injected" | "browser") => Promise<void>; disconnect: () => void;
  org: string; setOrg: (value: string) => void; actionId: string; setActionId: (value: string) => void; epochNo: string; setEpochNo: (value: string) => void; capabilityId: string; setCapabilityId: (value: string) => void;
  orgName: string; setOrgName: (value: string) => void; charter: string; setCharter: (value: string) => void; capability: string; setCapability: (value: string) => void; policy: string; setPolicy: (value: string) => void;
  manifest: string; setManifest: (value: string) => void; counterSourceUrl: string; setCounterSourceUrl: (value: string) => void; counterUrl: string; setCounterUrl: (value: string) => void; counterHash: string; setCounterHash: (value: string) => void;
  fundWei: string; setFundWei: (value: string) => void; result: string; setResult: (value: string) => void; notice: string; setNotice: (value: string) => void; tx: TxState | null; loaded: Loaded; loading: boolean;
  createOrg: () => Promise<void>; submit: (method: string, args: unknown[], key: string, value?: bigint) => Promise<SubmitOutcome>; read: (method: string, args: unknown[]) => Promise<string>; loadState: () => Promise<void>; verifyDraftCapability: () => Promise<void>; loadDemo: () => void;
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

async function sha256(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(canonical(value))));
  return Array.from(new Uint8Array(digest), (part) => part.toString(16).padStart(2, "0")).join("");
}

function parseJson<T>(raw?: string): T | undefined {
  if (!raw) return undefined;
  try { return JSON.parse(raw) as T; } catch { return undefined; }
}

function pretty(raw?: string) {
  const parsed = parseJson<unknown>(raw);
  return parsed ? JSON.stringify(parsed, null, 2) : raw || "No live state loaded.";
}

function short(value?: string) {
  if (!value) return "--";
  return value.length > 22 ? `${value.slice(0, 10)}...${value.slice(-8)}` : value;
}

function empty(value?: React.ReactNode) {
  return value || "--";
}

function Field({ label, value, onChange, placeholder, multiline, inputMode }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; multiline?: boolean; inputMode?: "numeric" }) {
  return <label className="field"><span>{label}</span>{multiline ? <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /> : <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} inputMode={inputMode} />}</label>;
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "bad" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function Metric({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "good" | "warn" | "bad" }) {
  return <div className="metric"><span>{label}</span><strong>{value || "--"}</strong>{tone && <Badge tone={tone}>{tone}</Badge>}</div>;
}

function formatUnix(value?: string | number) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return "--";
  return `${new Date(raw * 1000).toLocaleString()} (${raw})`;
}

type TransactionSnapshot = { statusName?: string; status_name?: string; resultName?: string; result_name?: string; txExecutionResultName?: string; tx_execution_result_name?: string; result?: string | number };
type ReceiptWithLeaderResult = TransactionSnapshot & { consensus_data?: { leader_receipt?: Array<{ result?: { status?: string; payload?: { readable?: string } } }> } };

function createdOrgId(receipt?: TransactionSnapshot): string | undefined {
  const payload = (receipt as ReceiptWithLeaderResult)?.consensus_data?.leader_receipt?.[0]?.result?.payload?.readable;
  if (!payload) return undefined;
  try {
    const candidate = JSON.parse(payload);
    return typeof candidate === "string" && /^\d+$/.test(candidate) ? candidate : undefined;
  } catch { return undefined; }
}

function successFollowUp(method: string) {
  const next: Record<string, string> = {
    create_org: "Success — draft organization created. Kontyn is verifying and selecting its new ID now.",
    configure_treasury_policy: "Success — treasury policy saved. Next: add the approved capability.",
    add_capability: "Success — capability saved. Next: fund the treasury.",
    fund_org: "Success — treasury funded. Next: activate the organization.",
    activate_org: "Success — organization activated. Next: wait for the epoch due time, then open the first epoch.",
    open_epoch: "Success — epoch opened. Next: load state and review the consensus decision.",
    finalize_challenge_window: "Success — challenge window finalized. Next: reserve the READY allocation.",
    ratify_action: "Success — Tier-2 action ratified. Next: wait for and finalize its challenge window.",
    submit_counter_evidence: "Success — counter-evidence submitted. Next: wait for the deadline, then resolve the challenge.",
    resolve_challenge: "Success — challenge resolved. Next: load state to see whether the action is READY or CANCELED.",
    execute_ready_action: "Success — allocation reserved. Next: the immutable beneficiary may withdraw before the deadline.",
    withdraw_allocation: "Success — allocation withdrawn to the immutable beneficiary.",
    recover_expired_allocation: "Success — expired allocation recovered to the treasury.",
    cancel_ready_action: "Success — ready action canceled. No funds were reserved.",
  };
  return next[method] ?? "Success — transaction finalized. Next: refresh live state.";
}

function transactionStage(receipt: TransactionSnapshot) {
  const status = receipt.statusName ?? receipt.status_name;
  if (status === "ACCEPTED") return "Accepted — awaiting finality";
  if (status === "FINALIZED" && !isKontynTxSuccessful(receipt)) return "Finalized — execution outcome unavailable";
  if (status === "FINALIZED") return "Finalized — successful";
  return "Submitted — awaiting acceptance";
}

function SelectorStrip({ state }: { state: AppState }) {
  const loadedOrg = parseJson<{ id?: string; name?: string; state?: string }>(state.loaded.org);
  const selectedOrgIsLoaded = Boolean(loadedOrg?.id && loadedOrg.id === state.org.trim());
  return <section className="selector-strip">
    <div className="selector-help"><span className="eyebrow">Live State</span><p>{selectedOrgIsLoaded ? `Loaded organization #${loadedOrg?.id} · ${loadedOrg?.name || "Unnamed"} · ${loadedOrg?.state || "Unknown state"}` : "Enter an organization ID and load its live StudioNet state."}</p></div>
    <Field label="Organization ID" value={state.org} onChange={state.setOrg} placeholder="Enter a live ID" />
    <Field label="Epoch" value={state.epochNo} onChange={state.setEpochNo} placeholder="Enter an epoch number" inputMode="numeric" />
    <Field label="Action ID" value={state.actionId} onChange={state.setActionId} placeholder="Enter a live action ID" />
    <Field label="Capability ID" value={state.capabilityId} onChange={state.setCapabilityId} placeholder="Enter a stored capability ID" />
    <button onClick={() => void state.loadState()}>{state.loading ? "Loading..." : "Load state"}</button><button className="quiet" onClick={state.loadDemo}>Use demo data</button>
  </section>;
}

function WorkflowNextStep({ state }: { state: AppState }) {
  const org = parseJson<{ id?: string; state?: string }>(state.loaded.org);
  const policy = parseJson<{ reserve_floor_wei?: string; max_spend_epoch_wei?: string }>(state.loaded.policy);
  const treasury = parseJson<{ total_wei?: string }>(state.loaded.treasury);
  const storedCapability = parseJson<{ id?: string }>(state.loaded.capability);
  const draftedCapability = parseJson<{ id?: string }>(state.capability);
  const transactionInFlight = /Queued|Signature|Submitted|Accepted/.test(state.tx?.stage ?? "");
  const transactionFinalized = (state.tx?.stage ?? "").startsWith("Finalized");
  let title = "Start by loading an organization";
  let detail = "Enter the organization ID, then select Load state. Kontyn will not send any organization-scoped write until it has verified the selected organization.";
  let action: (() => void) | undefined;
  let label = "Load state";
  if (org?.id && transactionInFlight) {
    title = "Transaction in progress"; detail = "Wait for the current transaction to finalize. Do not repeat the click or move to the next setup step yet."; label = "Refresh live state"; action = () => void state.loadState();
  } else if (org?.id && transactionFinalized) {
    title = "Transaction finalized — refresh live state"; detail = "Refresh the contract state now. Kontyn will then show the exact next required setup step."; label = "Refresh live state"; action = () => void state.loadState();
  } else if (org?.id && org.state === "DRAFT" && (policy?.reserve_floor_wei === "0" || policy?.max_spend_epoch_wei === "0" || !policy)) {
    title = "Next: set the treasury policy"; detail = "Define the reserve floor and maximum spending bound before funding or activation."; label = "Go to Treasury"; action = () => state.setActive("Treasury");
  } else if (org?.id && org.state === "DRAFT" && !storedCapability?.id) {
    title = "Next: add the approved capability"; detail = draftedCapability?.id ? `Add ${draftedCapability.id}, then refresh live state to verify it is stored.` : "Add at least one capability. A draft organization cannot activate without one."; label = "Go to Capabilities"; action = () => state.setActive("Capabilities");
  } else if (org?.id && org.state === "DRAFT" && Number(treasury?.total_wei ?? "0") === 0) {
    title = "Next: fund the treasury"; detail = "Fund the organization with the amount needed for its bounded operations while preserving its reserve floor."; label = "Go to Treasury"; action = () => state.setActive("Treasury");
  } else if (org?.id && org.state === "DRAFT") {
    title = "Next: activate the organization"; detail = "The charter, policy, capability, and funding are present. Activate to begin the deterministic epoch cadence."; label = "Go to Treasury"; action = () => state.setActive("Treasury");
  } else if (org?.id && org.state === "ACTIVE") {
    title = "Next: wait for the due epoch, then open it"; detail = "Open Epochs only when the contract's displayed due time arrives. The contract rejects early attempts."; label = "Go to Epochs"; action = () => state.setActive("Epochs");
  }
  return <section className="next-step" aria-live="polite"><span className="eyebrow">Guided workflow</span><div><div><strong>{title}</strong><p>{detail}</p></div>{action && <button className="quiet" onClick={action}>{label}</button>}</div></section>;
}

function StateCard({ title, raw }: { title: string; raw?: string }) {
  return <section className="panel"><span className="eyebrow">{title}</span><pre className="result compact">{pretty(raw)}</pre></section>;
}

function MissionView({ state }: { state: AppState }) {
  const org = parseJson<Record<string, unknown>>(state.loaded.org);
  const charter = parseJson<Record<string, unknown>>(state.loaded.charter);
  const treasury = parseJson<Record<string, string>>(state.loaded.treasury);
  const epoch = parseJson<{ decision?: Record<string, string>; action_id?: string; status?: string }>(state.loaded.epoch);
  const action = parseJson<Record<string, string>>(state.loaded.action);
  const timing = parseJson<Record<string, string | number>>(state.loaded.timing);
  const hasOrg = Boolean(state.loaded.org && org);
  return <div className="view-stack">
    <section className="orrey mission-orrey">
      <div className="core"><span>MISSION CORE</span><strong>{String(charter?.mission || (hasOrg ? "Awaiting charter state" : "Select an organization"))}</strong><small>{String(org?.state || "Awaiting organization state")}</small></div>
      <div className="orbit o1">OBJECTIVE<br /><b>{epoch?.decision?.mission_state || "--"}</b></div>
      <div className="orbit o2">CAPABILITY<br /><b>{action?.capability_id || "--"}</b></div>
      <div className="orbit o3">RUNWAY<br /><b>{treasury?.available_wei ? `${treasury.available_wei} wei` : "--"}</b></div>
    </section>
    <section className="metrics">
      <Metric label="Organization" value={empty(org?.name ? `${org.name}` : undefined)} />
      <Metric label="State" value={empty(org?.state ? String(org.state) : undefined)} tone={org?.state === "ACTIVE" ? "good" : undefined} />
      <Metric label="Available treasury" value={empty(treasury?.available_wei ? `${treasury.available_wei} wei` : undefined)} />
      <Metric label="Latest decision" value={empty(epoch?.decision?.decision)} />
      <Metric label="Latest action" value={empty(action?.status)} />
      <Metric label="Next epoch due" value={formatUnix(timing?.next_epoch_timestamp)} />
      <Metric label="Capability lookup" value={state.capabilityId ? "Ready to load" : "--"} />
    </section>
    <section className="panel"><span className="eyebrow">Shortcuts</span><div className="actions"><button onClick={() => state.setActive("Charter")}>Create or inspect charter</button><button onClick={() => state.setActive("Epochs")}>Open consensus epoch</button><button onClick={() => state.setActive("Treasury")}>Manage treasury</button><button onClick={() => state.setActive("Audit")}>Exact reads</button></div></section>
  </div>;
}

function CharterView({ state }: { state: AppState }) {
  const charter = parseJson<{ mission?: string; source_bindings?: Array<Record<string, string>> }>(state.charter || state.loaded.charter);
  return <div className="two-col">
    <section className="panel">
      <span className="eyebrow">Create Organization</span><h2>Immutable charter setup</h2>
      <Field label="Organization name" value={state.orgName} onChange={state.setOrgName} placeholder="Your organization name" />
      <div className="readable-card"><span>Mission</span><strong>{charter?.mission || "Awaiting charter JSON"}</strong></div>
      <details open><summary>Advanced JSON charter</summary><Field label="Charter JSON" value={state.charter} onChange={state.setCharter} multiline placeholder="Paste charter JSON with source_bindings" /><button onClick={() => void state.createOrg()}>Create draft organization</button></details>
      <div className="empty">After the transaction is confirmed, enter its organization ID above and select <strong>Load state</strong>. The organization should read <strong>DRAFT</strong>; then set the treasury policy and add a capability. Values in this form are only a local draft until their own write is confirmed and loaded back from StudioNet.</div>
    </section>
    <section className="panel">
      <span className="eyebrow">Source Commitments</span><h2>Hash-bound evidence</h2>
      {charter?.source_bindings?.length ? <div className="table-wrap"><table><thead><tr><th>Type</th><th>URL</th><th>SHA-256</th></tr></thead><tbody>{charter.source_bindings.flatMap((binding, index) => [["Source", binding.source_url, binding.source_hash], ["Metadata", binding.metadata_url, binding.metadata_hash], ["License", binding.license_url, binding.license_hash], ["Version", "Version hash", binding.version_hash]].map(([label, url, hash]) => <tr key={`${index}-${label}`}><td>{label}</td><td>{url}</td><td><code>{short(hash)}</code></td></tr>))}</tbody></table></div> : <div className="empty">Paste charter JSON or load an organization to inspect hash-bound source commitments.</div>}
    </section>
  </div>;
}

function ObjectivesView({ state }: { state: AppState }) {
  const charter = parseJson<{ mission?: string; source_bindings?: Array<Record<string, string>> }>(state.loaded.charter);
  const epoch = parseJson<{ decision?: Record<string, string> }>(state.loaded.epoch);
  return <div className="view-stack">
    <section className="panel hero-panel"><span className="eyebrow">Mission Evidence</span><h2>{charter?.mission || "Awaiting organization state"}</h2><p>Kontyn derives this view from the loaded charter and epoch decision only.</p></section>
    <section className="metrics"><Metric label="Mission state" value={epoch?.decision?.mission_state} /><Metric label="Evidence quality" value={epoch?.decision?.evidence_quality} /><Metric label="KPI direction" value={epoch?.decision?.kpi_direction} /><Metric label="Priority" value={epoch?.decision?.priority} /></section>
    <section className="panel"><span className="eyebrow">Source Bindings</span>{charter?.source_bindings?.length ? <div className="card-grid">{charter.source_bindings.map((binding, index) => <div className="data-card" key={index}><strong>Binding {index + 1}</strong><p>{binding.source_url}</p><code>{short(binding.source_hash)}</code></div>)}</div> : <div className="empty">No source bindings loaded.</div>}</section>
    <StateCard title="Last Assessment" raw={state.loaded.epoch} />
  </div>;
}

function CapabilitiesView({ state }: { state: AppState }) {
  const loadedCapability = parseJson<Record<string, string>>(state.loaded.capability);
  const draftCapability = parseJson<Record<string, string>>(state.capability);
  const cap = loadedCapability || draftCapability;
  return <div className="two-col">
    <section className="panel"><span className="eyebrow">Registry</span><h2>{loadedCapability ? "Saved on-chain capability" : "Capability ready to add"}</h2>{cap ? <><div className="card-grid"><Metric label="Capability ID" value={cap.id} /><Metric label="Action type" value={cap.action_type} /><Metric label="Risk tier" value={cap.risk_tier} /><Metric label="Max amount" value={cap.max_amount_wei ? `${cap.max_amount_wei} wei` : undefined} /><Metric label="Beneficiary" value={cap.beneficiary ? short(cap.beneficiary) : undefined} /><Metric label="Challenge duration" value={cap.challenge_duration_seconds ? `${cap.challenge_duration_seconds}s` : undefined} /><Metric label="Allocation expiry" value={cap.allocation_expiry_seconds ? `${cap.allocation_expiry_seconds}s` : undefined} /></div>{!loadedCapability && <div className="empty">This is the capability that will be added to the selected organization. Select <strong>Add capability</strong> once, wait for finality, then select <strong>Check saved capability</strong>.</div>}</> : <div className="empty">Add a capability after loading a DRAFT organization.</div>}</section>
    <section className="panel"><span className="eyebrow">Add Capability</span><h2>Draft-only registry write</h2><Field label="Capability JSON" value={state.capability} onChange={state.setCapability} multiline placeholder="Paste a capability JSON object" /><div className="actions"><button onClick={() => void state.submit("add_capability", [state.org.trim(), state.capability], `cap:${state.org.trim()}`)}>Add capability</button><button className="quiet" onClick={() => void state.verifyDraftCapability()}>Check saved capability</button></div></section>
  </div>;
}

function TreasuryView({ state }: { state: AppState }) {
  const treasury = parseJson<Record<string, string>>(state.loaded.treasury);
  const policy = parseJson<Record<string, string>>(state.loaded.policy || state.policy);
  const action = parseJson<Record<string, string | number>>(state.loaded.action);
  return <div className="view-stack">
    <section className="metrics"><Metric label="Available" value={treasury?.available_wei ? `${treasury.available_wei} wei` : undefined} tone="good" /><Metric label="Reserved" value={treasury?.reserved_wei ? `${treasury.reserved_wei} wei` : undefined} /><Metric label="Total" value={treasury?.total_wei ? `${treasury.total_wei} wei` : undefined} /><Metric label="Reserve floor" value={policy?.reserve_floor_wei ? `${policy.reserve_floor_wei} wei` : undefined} /><Metric label="Max spend / epoch" value={policy?.max_spend_epoch_wei ? `${policy.max_spend_epoch_wei} wei` : undefined} /><Metric label="Allocated at" value={formatUnix(action?.allocated_at)} /><Metric label="Withdrawal/recovery deadline" value={formatUnix(action?.allocation_expires_at)} /></section>
    <section className="panel"><span className="eyebrow">Policy and Funding</span><Field label="Policy JSON" value={state.policy} onChange={state.setPolicy} multiline placeholder="Treasury policy JSON" /><Field label="Fund amount (wei)" value={state.fundWei} onChange={state.setFundWei} inputMode="numeric" placeholder="10" /><div className="actions"><button onClick={() => void state.submit("configure_treasury_policy", [state.org.trim(), state.policy], `policy:${state.org.trim()}`)}>Set treasury policy</button><button onClick={() => { try { void state.submit("fund_org", [state.org.trim()], `fund:${state.org.trim()}`, BigInt(state.fundWei)); } catch { state.setNotice("Fund amount must be a whole wei value."); } }}>Fund treasury</button><button onClick={() => void state.submit("activate_org", [state.org.trim()], `activate:${state.org.trim()}`)}>Activate organization</button></div></section>
    <section className="panel"><span className="eyebrow">Settlement</span><div className="actions"><button onClick={() => void state.submit("execute_ready_action", [state.org.trim(), state.actionId], `execute:${state.org.trim()}:${state.actionId}`)}>Reserve allocation</button><button onClick={() => void state.submit("withdraw_allocation", [state.org.trim(), state.actionId], `withdraw:${state.org.trim()}:${state.actionId}`)}>Withdraw allocation</button><button onClick={() => void state.submit("recover_expired_allocation", [state.org.trim(), state.actionId], `recover:${state.org.trim()}:${state.actionId}`)}>Recover expired allocation</button><button onClick={() => void state.submit("cancel_ready_action", [state.org.trim(), state.actionId], `cancel:${state.org.trim()}:${state.actionId}`)}>Cancel ready action</button></div></section>
  </div>;
}

function EpochsView({ state }: { state: AppState }) {
  const epoch = parseJson<{ decision?: Record<string, string>; action_id?: string; status?: string }>(state.loaded.epoch);
  const timing = parseJson<Record<string, string | number>>(state.loaded.timing);
  return <div className="view-stack"><section className="metrics"><Metric label="Decision" value={epoch?.decision?.decision} /><Metric label="Mission state" value={epoch?.decision?.mission_state} /><Metric label="Evidence" value={epoch?.decision?.evidence_quality} /><Metric label="Spend" value={epoch?.decision?.spend_amount_wei ? `${epoch.decision.spend_amount_wei} wei` : undefined} /><Metric label="Action ID" value={epoch?.action_id} /><Metric label="Latest epoch" value={timing?.last_epoch === undefined ? undefined : String(timing.last_epoch)} /><Metric label="Next epoch due" value={formatUnix(timing?.next_epoch_timestamp)} /></section><section className="panel"><span className="eyebrow">Open Consensus Epoch</span><Field label="Source manifest JSON" value={state.manifest} onChange={state.setManifest} multiline placeholder="Paste source manifest JSON" /><button onClick={() => void state.submit("open_epoch", [state.org.trim(), Number(state.epochNo), state.manifest], `epoch:${state.org.trim()}:${state.epochNo}`)}>Open epoch</button></section><section className="panel"><span className="eyebrow">Reason</span><p>{epoch?.decision?.short_reason || "Awaiting epoch decision."}</p></section></div>;
}

function GovernanceView({ state }: { state: AppState }) {
  const action = parseJson<Record<string, string | number>>(state.loaded.action);
  return <div className="two-col"><section className="panel"><span className="eyebrow">Action Governance</span><h2>{String(action?.status || "Awaiting action state")}</h2><div className="card-grid"><Metric label="Action ID" value={action?.id === undefined ? undefined : String(action.id)} /><Metric label="Created epoch" value={action?.created_epoch === undefined ? undefined : String(action.created_epoch)} /><Metric label="Created at" value={formatUnix(action?.created_at)} /><Metric label="Challenge deadline" value={formatUnix(action?.challenge_deadline)} /><Metric label="Challenge duration" value={action?.challenge_duration_seconds === undefined ? undefined : `${action.challenge_duration_seconds}s`} /><Metric label="Policy version" value={action?.policy_version === undefined ? undefined : String(action.policy_version)} /></div><div className="actions"><button onClick={() => void state.submit("finalize_challenge_window", [state.org.trim(), state.actionId], `finalize:${state.org.trim()}:${state.actionId}`)}>Finalize challenge window</button><button onClick={() => void state.submit("ratify_action", [state.org.trim(), state.actionId, true], `ratify:${state.org.trim()}:${state.actionId}`)}>Ratify action</button></div></section><section className="panel"><span className="eyebrow">Counter Evidence</span><Field label="Original locked source URL" value={state.counterSourceUrl} onChange={state.setCounterSourceUrl} placeholder="https://..." /><Field label="Counter-evidence URL" value={state.counterUrl} onChange={state.setCounterUrl} placeholder="https://..." /><Field label="Counter-evidence SHA-256" value={state.counterHash} onChange={state.setCounterHash} placeholder="64-character SHA-256 hash" /><div className="actions"><button onClick={() => void state.submit("submit_counter_evidence", [state.org.trim(), state.actionId, state.counterSourceUrl, state.counterUrl, state.counterHash], `challenge:${state.org.trim()}:${state.actionId}`)}>Submit challenge</button><button onClick={() => void state.submit("resolve_challenge", [state.org.trim(), state.actionId], `resolve:${state.org.trim()}:${state.actionId}`)}>Resolve challenge</button></div></section></div>;
}

function ConstitutionView({ state }: { state: AppState }) {
  return <div className="card-grid constitution"><div className="data-card"><strong>AI cannot invent authority</strong><p>Consensus may select only a capability already stored for the organization.</p></div><div className="data-card"><strong>Code controls value</strong><p>Spend bounds, reserve floor, beneficiary, withdrawal deadline, recovery deadline, and cadence are deterministic contract checks.</p></div><div className="data-card"><strong>Beneficiary is immutable</strong><p>Value-moving capabilities bind the recipient before activation; withdrawal requires that wallet before allocation expiry.</p></div><div className="data-card"><strong>Founder / Constitutional Authority</strong><p>The founder retains enumerated setup, ratification, recovery, safe-mode, treasury-withdrawal and sunset powers. Kontyn is bounded autonomy under a founder-set constitution, not zero-human-authority governance.</p></div><div className="data-card"><strong>Evidence fails closed</strong><p>Missing, changed, weak, or contradictory hash-bound evidence should abstain instead of spending.</p></div><div className="data-card"><strong>Challenges are permissionless</strong><p>Counter-evidence is hash-bound and resolved through a fresh GenLayer review.</p></div><div className="data-card"><strong>Loaded contract</strong><p><a href={`${explorerBase}/address/${contractAddress}`} target="_blank" rel="noreferrer">{contractAddress || "Not configured"}</a></p></div><StateCard title="Loaded Organization" raw={state.loaded.org} /></div>;
}

function KeeperView({ state }: { state: AppState }) {
  const timing = parseJson<Record<string, string | number>>(state.loaded.timing);
  return <div className="view-stack"><section className="panel hero-panel"><span className="eyebrow">Keeper</span><h2>Liveness convenience only, no special wallet required</h2><p>A keeper may read the next due timestamp and submit an epoch when due. The contract itself rejects early epochs, so keeper clocks, cron jobs, Vercel timing and environment variables are never the security boundary.</p></section><section className="metrics"><Metric label="Latest epoch" value={timing?.last_epoch === undefined ? undefined : String(timing.last_epoch)} /><Metric label="Next epoch due" value={formatUnix(timing?.next_epoch_timestamp)} /><Metric label="Epoch cadence" value={timing?.epoch_duration_seconds === undefined ? undefined : `${timing.epoch_duration_seconds}s`} /></section><section className="panel"><span className="eyebrow">Available in this frontend</span><div className="status-list"><Badge tone="good">Open epoch lives in Epochs</Badge><Badge tone="good">Finalize challenge window lives in Governance</Badge><Badge tone="good">Reserve and recover live in Treasury</Badge><Badge tone="warn">Keeper submits only; contract enforces due time</Badge></div></section></div>;
}

function AuditView({ state }: { state: AppState }) {
  return <div className="view-stack"><section className="panel"><span className="eyebrow">Verified Contract</span><h2>{contractAddress || "Not configured"}</h2>{contractAddress && <a className="button-link" href={`${explorerBase}/address/${contractAddress}`} target="_blank" rel="noreferrer">Open explorer</a>}</section><section className="panel"><span className="eyebrow">Exact Reads</span><div className="actions"><button onClick={() => void state.read("get_org", [state.org.trim()])}>Organization</button><button onClick={() => void state.read("get_timing_state", [state.org.trim()])}>Timing</button><button onClick={() => void state.read("get_charter", [state.org.trim()])}>Charter</button><button onClick={() => void state.read("get_treasury_state", [state.org.trim()])}>Treasury</button><button onClick={() => void state.read("get_treasury_policy", [state.org.trim()])}>Policy</button><button onClick={() => void state.read("get_epoch", [state.org.trim(), Number(state.epochNo)])}>Epoch</button><button onClick={() => void state.read("get_action", [state.org.trim(), state.actionId])}>Action</button><button onClick={() => void state.read("get_capability", [state.org.trim(), state.capabilityId])}>Capability</button></div>{state.result && <pre className="result">{state.result}</pre>}</section><div className="grid-2"><StateCard title="Organization" raw={state.loaded.org} /><StateCard title="Timing" raw={state.loaded.timing} /><StateCard title="Epoch" raw={state.loaded.epoch} /><StateCard title="Action" raw={state.loaded.action} /><StateCard title="Treasury" raw={state.loaded.treasury} /></div></div>;
}

function SectionView({ state }: { state: AppState }) {
  if (state.active === "Mission") return <MissionView state={state} />;
  if (state.active === "Charter") return <CharterView state={state} />;
  if (state.active === "Objectives") return <ObjectivesView state={state} />;
  if (state.active === "Capabilities") return <CapabilitiesView state={state} />;
  if (state.active === "Treasury") return <TreasuryView state={state} />;
  if (state.active === "Epochs") return <EpochsView state={state} />;
  if (state.active === "Governance") return <GovernanceView state={state} />;
  if (state.active === "Constitution") return <ConstitutionView state={state} />;
  if (state.active === "Keeper") return <KeeperView state={state} />;
  return <AuditView state={state} />;
}

export function KontynShell({ route = "Mission" }: { route?: string }) {
  const initial = nav.find((item) => item.toLowerCase() === route.toLowerCase()) ?? "Mission";
  const [active, setActive] = useState<Section>(initial);
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [org, setOrg] = useState(""); const [actionId, setActionId] = useState(""); const [epochNo, setEpochNo] = useState(""); const [capabilityId, setCapabilityId] = useState("");
  const [orgName, setOrgName] = useState(""); const [charter, setCharter] = useState(""); const [capability, setCapability] = useState(""); const [policy, setPolicy] = useState("");
  const [manifest, setManifest] = useState(""); const [counterSourceUrl, setCounterSourceUrl] = useState(""); const [counterUrl, setCounterUrl] = useState(""); const [counterHash, setCounterHash] = useState(""); const [fundWei, setFundWei] = useState("");
  const [result, setResult] = useState(""); const [notice, setNotice] = useState(""); const [tx, setTx] = useState<TxState | null>(null); const [loaded, setLoaded] = useState<Loaded>({}); const [loading, setLoading] = useState(false);

  useEffect(() => { void restoreWallet().then(setWallet).catch(() => undefined); }, []);

  useEffect(() => {
    const pending = studioQueue.pendingTxs(); const hash = tx?.hash || pending.at(-1);
    if (!hash) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const details = await readClient.getTransaction({ hash: hash as never }) as TransactionSnapshot;
        if (cancelled) return;
        const stage = transactionStage(details);
        setTx({ hash, stage, ...(stage.includes("unavailable") ? { error: "StudioNet did not expose the explicit execution result required to verify success." } : {}) });
        if (isKontynTxSuccessful(details)) studioQueue.forgetTx(hash);
        if (details.statusName === TransactionStatus.FINALIZED && !isKontynTxSuccessful(details)) setNotice("Transaction finalized. StudioNet omitted the explicit execution-result field Kontyn requires for receipt-level success. Refresh live state to confirm the resulting on-chain step and continue.");
      } catch { if (!cancelled) setTx({ hash, stage: "Submitted — receipt temporarily unavailable" }); }
    };
    void refresh(); const timer = window.setInterval(() => void refresh(), 20_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [tx?.hash]);

  async function connect(type: "injected" | "browser") { try { setWallet(type === "injected" ? await connectInjected() : browserWallet()); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not connect wallet."); } }
  function loadDemo() {
    const base = "https://raw.githubusercontent.com/Ifem1/Kontyn/b9422590317b07f135329ad65566e3e089ed2792/evidence";
    const source = `${base}/demo-riverbend-source-v1.txt`;
    const metadata = `${base}/demo-riverbend-metadata-v1.json`;
    const license = `${base}/demo-riverbend-license-v1.txt`;
    const sourceHash = "1e541b7c9902f284da25ac7a33b41dbe8241fe8a8ed5da81126a79f59d7030bf";
    const metadataHash = "ec96fa47ec45b2b4e5828a246a8dab412b3a8ba74002de91edfb6d07b46d16e5";
    const licenseHash = "97dfb077eed84419532a768fb6baa279997558da8e7cf31cde6b3fb739280566";
    setOrg(""); setEpochNo(""); setActionId(""); setCapabilityId("");
    setOrgName("Riverbend Community Archive");
    setCharter(JSON.stringify({ mission: "Maintain public access to the Riverbend Community Archive", epoch_duration_seconds: 300, source_bindings: [{ source_url: source, metadata_url: metadata, license_url: license, source_hash: sourceHash, metadata_hash: metadataHash, license_hash: licenseHash, version_hash: sourceHash }] }, null, 2));
    setPolicy(JSON.stringify({ reserve_floor_wei: "10", max_spend_epoch_wei: "25" }, null, 2));
    setCapability(JSON.stringify({ id: "archive-hosting-renewal", action_type: "FUND_SERVICE", risk_tier: "TIER_1", max_amount_wei: "25", beneficiary: "0x4a8A4C6A09f6E2d9A5CDB4B6DfC22e52f0eF69A1", challenge_duration_seconds: 300, allocation_expiry_seconds: 600 }, null, 2));
    setManifest(JSON.stringify({ sources: [source] }, null, 2)); setFundWei("35"); setCounterSourceUrl(source); setCounterUrl(metadata); setCounterHash(metadataHash);
    setNotice("Riverbend Community Archive sample loaded. It uses real, version-pinned source, metadata, and licence hashes, but it remains local sample data until you create an organization.");
  }
  async function submit(method: string, args: unknown[], key: string, value = 0n): Promise<SubmitOutcome> { const address = contractAddress; if (!address) { setNotice("Configuration required: set NEXT_PUBLIC_KONTYN_CONTRACT_ADDRESS to the verified contract address."); return { verified: false }; } if (args.some((item) => typeof item === "string" && item.trim() === "")) { setNotice("Complete every required field; Kontyn never substitutes a stale ID or placeholder value."); return { verified: false }; } const loadedOrg = parseJson<{ id?: string }>(loaded.org); if (method !== "create_org" && loadedOrg?.id !== org.trim()) { setNotice("Load the selected organization before submitting a write. This prevents a treasury, capability, epoch, or action from being sent under an unverified ID."); return { verified: false }; } if (!wallet) { setNotice("Choose a wallet before submitting."); return { verified: false }; } setTx({ hash: "", stage: "Queued — waiting for StudioNet capacity" }); setNotice(`${method.replaceAll("_", " ")} is queued. Kontyn will request your signature when StudioNet capacity is available.`); return studioQueue.enqueue(key, "user", async () => { let hash = ""; try { setTx({ hash, stage: "Signature requested" }); const client = writeClient(wallet); if (wallet.mode === "injected") await client.connect("studionet"); hash = await client.writeContract({ address, functionName: method, args: args as never[], value }); studioQueue.rememberTx(hash); setTx({ hash, stage: "Submitted — awaiting acceptance" }); try { const current = await readClient.getTransaction({ hash: hash as never }) as TransactionSnapshot; setTx({ hash, stage: transactionStage(current) }); } catch {} const receipt = await readClient.waitForTransactionReceipt({ hash: hash as never, status: TransactionStatus.FINALIZED, interval: 20000, retries: 30 }); const finality = receipt as TransactionSnapshot; const details = await readClient.getTransaction({ hash: hash as never }) as TransactionSnapshot; const combined = { ...finality, ...details, statusName: details.statusName ?? finality.statusName, status_name: details.status_name ?? finality.status_name }; assertKontynTxSuccessful(combined, hash); studioQueue.forgetTx(hash); setTx({ hash, stage: "Finalized — successful" }); setNotice(successFollowUp(method)); return { verified: true, hash, finalized: true, receipt: combined }; } catch (error) { if (hash) { try { const details = await readClient.getTransaction({ hash: hash as never }) as TransactionSnapshot; const stage = transactionStage(details); setTx({ hash, stage, ...(stage.includes("unavailable") ? { error: "StudioNet did not expose the explicit execution result required to verify success." } : {}) }); return { verified: false, hash, finalized: details.statusName === TransactionStatus.FINALIZED, receipt: details }; } catch { setTx({ hash, stage: "Submitted — receipt temporarily unavailable", error: error instanceof Error ? error.message : "Unknown receipt error" }); return { verified: false, hash }; } } setTx({ hash: "", stage: "Failed before submission", error: error instanceof Error ? error.message : "Unknown error" }); return { verified: false }; } }); }
  async function createOrg() {
    try {
      const parsed = JSON.parse(charter); const charterHash = await sha256(parsed);
      const outcome = await submit("create_org", [orgName, charterHash, JSON.stringify(parsed)], "create");
      const orgId = createdOrgId(outcome.receipt);
      if (!orgId || !outcome.finalized || !wallet || !contractAddress) {
        if (outcome.hash) setNotice("The creation transaction finalized, but Kontyn could not yet confirm its new organization ID. Keep the transaction hash and try again when StudioNet receipt data is available.");
        return;
      }
      const address = contractAddress;
      const orgRaw = String(await readClient.readContract({ address, functionName: "get_org", args: [orgId] as never[] }));
      const created = parseJson<{ id?: string; name?: string; founder?: string; charter_hash?: string }>(orgRaw);
      if (created?.id !== orgId || created.name !== orgName.trim() || created.charter_hash !== charterHash || created.founder?.toLowerCase() !== wallet.address.toLowerCase()) {
        setNotice("Kontyn could not match the receipt's suggested ID to the newly created on-chain organization. No organization was selected automatically."); return;
      }
      const [charterRaw, treasuryRaw, policyRaw, timingRaw] = await Promise.all(["get_charter", "get_treasury_state", "get_treasury_policy", "get_timing_state"].map(async (method) => String(await readClient.readContract({ address, functionName: method, args: [orgId] as never[] }))));
      const draftedCapabilityId = parseJson<{ id?: string }>(capability)?.id;
      setOrg(orgId); if (draftedCapabilityId) setCapabilityId(draftedCapabilityId); setLoaded({ org: orgRaw, charter: charterRaw, treasury: treasuryRaw, policy: policyRaw, timing: timingRaw }); setActive("Treasury");
      setNotice(`Success — organization #${orgId} was created and selected. Next: set its treasury policy.`);
    } catch { setNotice("Charter must be valid JSON. Add real SHA-256 source, metadata, and license hashes before opening an epoch."); }
  }
  async function read(method: string, args: unknown[]) { if (!contractAddress) { setNotice("Configuration required: no contract address is set."); return ""; } try { const value = String(await readClient.readContract({ address: contractAddress, functionName: method, args: args as never[] })); setResult(value); return value; } catch (error) { const value = error instanceof Error ? error.message : "Read failed."; setResult(value); return ""; } }
  async function loadState() {
    if (!contractAddress || !org.trim()) { setNotice("Enter an organization ID and make sure the contract address is configured."); return; }
    const address = contractAddress;
    setLoading(true);
    const next: Loaded = {};
    const safe = async (method: string, args: unknown[]) => { try { return String(await readClient.readContract({ address, functionName: method, args: args as never[] })); } catch { return ""; } };
    next.org = await safe("get_org", [org.trim()]);
    if (!parseJson<{ id?: string }>(next.org)?.id) {
      setLoaded({}); setLoading(false); setNotice(`Organization ID ${org.trim()} was not found on this contract. Check the ID, then load state again.`); return;
    }
    next.charter = await safe("get_charter", [org.trim()]);
    next.treasury = await safe("get_treasury_state", [org.trim()]);
    next.policy = await safe("get_treasury_policy", [org.trim()]);
    next.timing = await safe("get_timing_state", [org.trim()]);
    if (epochNo.trim()) next.epoch = await safe("get_epoch", [org.trim(), Number(epochNo)]);
    if (actionId.trim()) next.action = await safe("get_action", [org.trim(), actionId]);
    const inferredCapabilityId = capabilityId.trim() || parseJson<{ id?: string }>(capability)?.id?.trim() || "";
    if (inferredCapabilityId) {
      next.capability = await safe("get_capability", [org.trim(), inferredCapabilityId]);
      if (parseJson<{ id?: string }>(next.capability)?.id) { setCapabilityId(inferredCapabilityId); setCapability(""); }
    }
    const livePolicy = parseJson<{ reserve_floor_wei?: string; max_spend_epoch_wei?: string }>(next.policy);
    const liveTreasury = parseJson<{ total_wei?: string }>(next.treasury);
    const liveCapability = parseJson<{ id?: string }>(next.capability);
    let nextMessage = "Next: set the treasury policy.";
    if (livePolicy && livePolicy.reserve_floor_wei !== "0" && livePolicy.max_spend_epoch_wei !== "0") nextMessage = !liveCapability?.id ? "Success — treasury policy is saved. Next: add the approved capability." : Number(liveTreasury?.total_wei ?? "0") === 0 ? "Success — capability is saved. Next: fund the treasury." : "Success — setup is complete. Next: activate the organization.";
    if (parseJson<{ state?: string }>(next.org)?.state === "ACTIVE") nextMessage = "Success — organization is active. Next: wait for the displayed epoch due time, then open the first epoch.";
    setLoaded(next); setLoading(false); setNotice(`Live state confirmed. ${nextMessage}`);
  }

  async function verifyDraftCapability() {
    const capabilityId = parseJson<{ id?: string }>(capability)?.id;
    const loadedOrg = parseJson<{ id?: string }>(loaded.org);
    if (!contractAddress || !capabilityId || loadedOrg?.id !== org.trim()) {
      setNotice("Load the organization and enter a valid capability JSON before checking whether the capability was saved."); return;
    }
    setTx({ hash: "", stage: "Checking saved capability" });
    try {
      const stored = String(await readClient.readContract({ address: contractAddress, functionName: "get_capability", args: [org.trim(), capabilityId] as never[] }));
      if (!parseJson<{ id?: string }>(stored)?.id) {
        setNotice(`Capability ${capabilityId} is not stored yet. Wait for the add-capability transaction to finalize, then check again.`); return;
      }
      setCapabilityId(capabilityId); setCapability(""); setLoaded((current) => ({ ...current, capability: stored }));
      setTx({ hash: "", stage: "Saved on-chain capability confirmed" });
      setNotice(`Success — ${capabilityId} is saved on-chain. Its draft form was cleared to prevent a duplicate submission. Next: fund the treasury if needed, then activate the organization.`);
    } catch {
      setNotice("Could not read the capability from StudioNet. Check the connection and try again.");
    }
  }

  const state: AppState = { active, setActive, wallet, connect, disconnect: () => { disconnectWallet(); setWallet(null); }, org, setOrg, actionId, setActionId, epochNo, setEpochNo, capabilityId, setCapabilityId, orgName, setOrgName, charter, setCharter, capability, setCapability, policy, setPolicy, manifest, setManifest, counterSourceUrl, setCounterSourceUrl, counterUrl, setCounterUrl, counterHash, setCounterHash, fundWei, setFundWei, result, setResult, notice, setNotice, tx, loaded, loading, createOrg, submit, read, loadState, verifyDraftCapability, loadDemo };

  return <main className="shell"><aside><Link className="brand" href="/">KONTYN<small>MISSION ORRERY</small></Link><nav><Link className="nav-home" href="/">Home</Link>{navGroups.map((group) => <div className="nav-group" key={group.label}><span>{group.label}</span>{group.items.map((item) => <button key={item} className={active === item ? "active" : ""} onClick={() => setActive(item)}>{item}</button>)}</div>)}</nav><p className="rate">STUDIO SAFEGUARD<br /><b>18 RPM - user first</b></p></aside><section className="content"><header><div><span className="eyebrow">STUDIONET - EXPERIMENTAL</span><h1>{active}</h1></div><div className="wallet">{wallet ? <><span className="dot" /> {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)} <button onClick={state.disconnect}>Disconnect</button></> : <><button onClick={() => void connect("injected")}>Use wallet</button><button className="quiet" onClick={() => void connect("browser")}>Browser wallet</button></>}</div></header>{wallet?.warning && <div className="warning"><b>Browser wallet:</b> this key is stored only in this browser. <button onClick={() => { void navigator.clipboard.writeText(exportBrowserWallet() ?? ""); setNotice("Browser-wallet private key copied. Store it securely."); }}>Copy private key</button><button onClick={() => { const key = exportBrowserWallet(); if (!key) return; const url = URL.createObjectURL(new Blob([key + "\n"], { type: "text/plain" })); const link = document.createElement("a"); link.href = url; link.download = "kontyn-browser-wallet-private-key.txt"; link.click(); URL.revokeObjectURL(url); setNotice("Browser-wallet backup exported. Store it securely."); }}>Export backup</button><button onClick={() => { const value = prompt("Paste browser-wallet private key"); if (value) try { setWallet(importBrowserWallet(value)); } catch (error) { setNotice(error instanceof Error ? error.message : "Import failed."); } }}>Import</button></div>}<SelectorStrip state={state} /><WorkflowNextStep state={state} /><SectionView state={state} />{tx && <section className="tx" aria-live="polite"><div><span className="eyebrow">Transaction</span><strong>{tx.stage}</strong>{tx.error && <p>{tx.error}</p>}</div>{tx.hash && <a href={`${explorerBase}/tx/${tx.hash}`} target="_blank" rel="noreferrer">Explorer</a>}<ol><li>Signature</li><li>Submitted</li><li>Proposing</li><li>Committing</li><li>Revealing</li><li>Accepted</li><li>Finalized</li></ol></section>}{notice && <p className="notice notice-toast" role="status">{notice}</p>}</section></main>;
}
