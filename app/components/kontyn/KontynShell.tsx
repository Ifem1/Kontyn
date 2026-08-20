"use client";

import { useState } from "react";
import Link from "next/link";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";
import { contractAddress, explorerBase, readClient } from "../../../lib/genlayer/config";
import { browserWallet, connectInjected, exportBrowserWallet, importBrowserWallet, writeClient, type WalletState } from "../../../lib/genlayer/wallet";
import { studioQueue } from "../../../lib/genlayer/queue";

const nav = ["Mission", "Charter", "Objectives", "Capabilities", "Treasury", "Epochs", "Governance", "Constitution", "Keeper", "Audit"] as const;
type Section = typeof nav[number];
type TxState = { hash: string; stage: string; error?: string };
type Loaded = { org?: string; charter?: string; treasury?: string; policy?: string; epoch?: string; action?: string; capability?: string };

type AppState = {
  active: Section; setActive: (section: Section) => void; wallet: WalletState | null; connect: (type: "injected" | "browser") => Promise<void>; disconnect: () => void;
  org: string; setOrg: (value: string) => void; actionId: string; setActionId: (value: string) => void; epochNo: string; setEpochNo: (value: string) => void; capabilityId: string; setCapabilityId: (value: string) => void;
  orgName: string; setOrgName: (value: string) => void; charter: string; setCharter: (value: string) => void; capability: string; setCapability: (value: string) => void; policy: string; setPolicy: (value: string) => void;
  manifest: string; setManifest: (value: string) => void; counterSourceUrl: string; setCounterSourceUrl: (value: string) => void; counterUrl: string; setCounterUrl: (value: string) => void; counterHash: string; setCounterHash: (value: string) => void;
  fundWei: string; setFundWei: (value: string) => void; result: string; setResult: (value: string) => void; notice: string; setNotice: (value: string) => void; tx: TxState | null; loaded: Loaded; loading: boolean;
  createOrg: () => Promise<void>; submit: (method: string, args: unknown[], key: string, value?: bigint) => Promise<boolean>; read: (method: string, args: unknown[]) => Promise<string>; loadState: () => Promise<void>;
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
  return parsed ? JSON.stringify(parsed, null, 2) : raw || "Not loaded";
}

function short(value?: string) {
  if (!value) return "Not loaded";
  return value.length > 22 ? `${value.slice(0, 10)}...${value.slice(-8)}` : value;
}

function Field({ label, value, onChange, placeholder, multiline, inputMode }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; multiline?: boolean; inputMode?: "numeric" }) {
  return <label className="field"><span>{label}</span>{multiline ? <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /> : <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} inputMode={inputMode} />}</label>;
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "bad" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function Metric({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "good" | "warn" | "bad" }) {
  return <div className="metric"><span>{label}</span><strong>{value || "Not loaded"}</strong>{tone && <Badge tone={tone}>{tone}</Badge>}</div>;
}

function SelectorStrip({ state }: { state: AppState }) {
  return <section className="selector-strip">
    <Field label="Organization ID" value={state.org} onChange={state.setOrg} placeholder="1" />
    <Field label="Epoch" value={state.epochNo} onChange={state.setEpochNo} placeholder="1" inputMode="numeric" />
    <Field label="Action ID" value={state.actionId} onChange={state.setActionId} placeholder="1" />
    <Field label="Capability ID" value={state.capabilityId} onChange={state.setCapabilityId} placeholder="test-grant" />
    <button onClick={() => void state.loadState()}>{state.loading ? "Loading..." : "Load state"}</button>
  </section>;
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
  return <div className="view-stack">
    <section className="orrey mission-orrey">
      <div className="core"><span>MISSION CORE</span><strong>{String(charter?.mission || "Not loaded")}</strong><small>{String(org?.state || "Not loaded")}</small></div>
      <div className="orbit o1">OBJECTIVE<br /><b>{epoch?.decision?.mission_state || "Not loaded"}</b></div>
      <div className="orbit o2">CAPABILITY<br /><b>{action?.capability_id || "Not loaded"}</b></div>
      <div className="orbit o3">RUNWAY<br /><b>{treasury?.available_wei ?? "Not loaded"} wei</b></div>
    </section>
    <section className="metrics">
      <Metric label="Organization" value={org?.name ? `${org.name}` : "Not loaded"} />
      <Metric label="State" value={String(org?.state || "Not loaded")} tone={org?.state === "ACTIVE" ? "good" : undefined} />
      <Metric label="Available treasury" value={treasury?.available_wei ? `${treasury.available_wei} wei` : "Not loaded"} />
      <Metric label="Latest decision" value={epoch?.decision?.decision || "Not loaded"} />
      <Metric label="Latest action" value={action?.status || "Not loaded"} />
      <Metric label="Capability count" value="Load by capability ID" />
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
      <div className="readable-card"><span>Mission</span><strong>{charter?.mission || "Not loaded"}</strong></div>
      <details open><summary>Advanced JSON charter</summary><Field label="Charter JSON" value={state.charter} onChange={state.setCharter} multiline placeholder="Paste charter JSON with source_bindings" /><button onClick={() => void state.createOrg()}>Create draft organization</button></details>
    </section>
    <section className="panel">
      <span className="eyebrow">Source Commitments</span><h2>Hash-bound evidence</h2>
      {charter?.source_bindings?.length ? <div className="table-wrap"><table><thead><tr><th>Type</th><th>URL</th><th>SHA-256</th></tr></thead><tbody>{charter.source_bindings.flatMap((binding, index) => [["Source", binding.source_url, binding.source_hash], ["Metadata", binding.metadata_url, binding.metadata_hash], ["License", binding.license_url, binding.license_hash], ["Version", "Version hash", binding.version_hash]].map(([label, url, hash]) => <tr key={`${index}-${label}`}><td>{label}</td><td>{url}</td><td><code>{short(hash)}</code></td></tr>))}</tbody></table></div> : <div className="empty">Not loaded. Paste charter JSON or load an organization.</div>}
    </section>
  </div>;
}

function ObjectivesView({ state }: { state: AppState }) {
  const charter = parseJson<{ mission?: string; source_bindings?: Array<Record<string, string>> }>(state.loaded.charter);
  const epoch = parseJson<{ decision?: Record<string, string> }>(state.loaded.epoch);
  return <div className="view-stack">
    <section className="panel hero-panel"><span className="eyebrow">Mission Evidence</span><h2>{charter?.mission || "Not loaded"}</h2><p>Kontyn derives this view from the loaded charter and epoch decision only.</p></section>
    <section className="metrics"><Metric label="Mission state" value={epoch?.decision?.mission_state || "Not loaded"} /><Metric label="Evidence quality" value={epoch?.decision?.evidence_quality || "Not loaded"} /><Metric label="KPI direction" value={epoch?.decision?.kpi_direction || "Not loaded"} /><Metric label="Priority" value={epoch?.decision?.priority || "Not loaded"} /></section>
    <section className="panel"><span className="eyebrow">Source Bindings</span>{charter?.source_bindings?.length ? <div className="card-grid">{charter.source_bindings.map((binding, index) => <div className="data-card" key={index}><strong>Binding {index + 1}</strong><p>{binding.source_url}</p><code>{short(binding.source_hash)}</code></div>)}</div> : <div className="empty">No source bindings loaded.</div>}</section>
    <StateCard title="Last Assessment" raw={state.loaded.epoch} />
  </div>;
}

function CapabilitiesView({ state }: { state: AppState }) {
  const cap = parseJson<Record<string, string>>(state.loaded.capability || state.capability);
  return <div className="two-col">
    <section className="panel"><span className="eyebrow">Registry</span><h2>Loaded capability</h2>{cap ? <div className="card-grid"><Metric label="Capability ID" value={cap.id} /><Metric label="Action type" value={cap.action_type} /><Metric label="Risk tier" value={cap.risk_tier} /><Metric label="Max amount" value={cap.max_amount_wei ? `${cap.max_amount_wei} wei` : "Not loaded"} /><Metric label="Beneficiary" value={cap.beneficiary ? short(cap.beneficiary) : "Not loaded"} /><Metric label="Challenge epochs" value={String(cap.challenge_epochs ?? "Not loaded")} /></div> : <div className="empty">Enter an org ID and capability ID, then load state.</div>}</section>
    <section className="panel"><span className="eyebrow">Add Capability</span><h2>Draft-only registry write</h2><Field label="Capability JSON" value={state.capability} onChange={state.setCapability} multiline placeholder="Paste a capability JSON object" /><button onClick={() => void state.submit("add_capability", [state.org.trim(), state.capability], `cap:${state.org.trim()}`)}>Add capability</button></section>
  </div>;
}

function TreasuryView({ state }: { state: AppState }) {
  const treasury = parseJson<Record<string, string>>(state.loaded.treasury);
  const policy = parseJson<Record<string, string>>(state.loaded.policy || state.policy);
  return <div className="view-stack">
    <section className="metrics"><Metric label="Available" value={treasury?.available_wei ? `${treasury.available_wei} wei` : "Not loaded"} tone="good" /><Metric label="Reserved" value={treasury?.reserved_wei ? `${treasury.reserved_wei} wei` : "Not loaded"} /><Metric label="Total" value={treasury?.total_wei ? `${treasury.total_wei} wei` : "Not loaded"} /><Metric label="Reserve floor" value={policy?.reserve_floor_wei ? `${policy.reserve_floor_wei} wei` : "Not loaded"} /><Metric label="Max spend / epoch" value={policy?.max_spend_epoch_wei ? `${policy.max_spend_epoch_wei} wei` : "Not loaded"} /></section>
    <section className="panel"><span className="eyebrow">Policy and Funding</span><Field label="Policy JSON" value={state.policy} onChange={state.setPolicy} multiline placeholder="Treasury policy JSON" /><Field label="Fund amount (wei)" value={state.fundWei} onChange={state.setFundWei} inputMode="numeric" placeholder="10" /><div className="actions"><button onClick={() => void state.submit("configure_treasury_policy", [state.org.trim(), state.policy], `policy:${state.org.trim()}`)}>Set treasury policy</button><button onClick={() => { try { void state.submit("fund_org", [state.org.trim()], `fund:${state.org.trim()}`, BigInt(state.fundWei)); } catch { state.setNotice("Fund amount must be a whole wei value."); } }}>Fund treasury</button><button onClick={() => void state.submit("activate_org", [state.org.trim()], `activate:${state.org.trim()}`)}>Activate organization</button></div></section>
    <section className="panel"><span className="eyebrow">Settlement</span><div className="actions"><button onClick={() => void state.submit("execute_ready_action", [state.org.trim(), state.actionId], `execute:${state.org.trim()}:${state.actionId}`)}>Reserve allocation</button><button onClick={() => void state.submit("withdraw_allocation", [state.org.trim(), state.actionId], `withdraw:${state.org.trim()}:${state.actionId}`)}>Withdraw allocation</button><button onClick={() => void state.submit("recover_expired_allocation", [state.org.trim(), state.actionId], `recover:${state.org.trim()}:${state.actionId}`)}>Recover expired allocation</button><button onClick={() => void state.submit("cancel_ready_action", [state.org.trim(), state.actionId], `cancel:${state.org.trim()}:${state.actionId}`)}>Cancel ready action</button></div></section>
  </div>;
}

function EpochsView({ state }: { state: AppState }) {
  const epoch = parseJson<{ decision?: Record<string, string>; action_id?: string; status?: string }>(state.loaded.epoch);
  return <div className="view-stack"><section className="metrics"><Metric label="Decision" value={epoch?.decision?.decision || "Not loaded"} /><Metric label="Mission state" value={epoch?.decision?.mission_state || "Not loaded"} /><Metric label="Evidence" value={epoch?.decision?.evidence_quality || "Not loaded"} /><Metric label="Spend" value={epoch?.decision?.spend_amount_wei ? `${epoch.decision.spend_amount_wei} wei` : "Not loaded"} /><Metric label="Action ID" value={epoch?.action_id || "Not loaded"} /></section><section className="panel"><span className="eyebrow">Open Consensus Epoch</span><Field label="Source manifest JSON" value={state.manifest} onChange={state.setManifest} multiline placeholder="Paste source manifest JSON" /><button onClick={() => void state.submit("open_epoch", [state.org.trim(), Number(state.epochNo), state.manifest], `epoch:${state.org.trim()}:${state.epochNo}`)}>Open epoch</button></section><section className="panel"><span className="eyebrow">Reason</span><p>{epoch?.decision?.short_reason || "Not loaded"}</p></section></div>;
}

function GovernanceView({ state }: { state: AppState }) {
  const action = parseJson<Record<string, string | number>>(state.loaded.action);
  return <div className="two-col"><section className="panel"><span className="eyebrow">Action Governance</span><h2>{String(action?.status || "Not loaded")}</h2><div className="card-grid"><Metric label="Action ID" value={String(action?.id || "Not loaded")} /><Metric label="Created epoch" value={String(action?.created_epoch || "Not loaded")} /><Metric label="Challenge epochs" value={String(action?.challenge_epochs || "Not loaded")} /><Metric label="Policy version" value={String(action?.policy_version || "Not loaded")} /></div><div className="actions"><button onClick={() => void state.submit("finalize_challenge_window", [state.org.trim(), state.actionId], `finalize:${state.org.trim()}:${state.actionId}`)}>Finalize challenge window</button><button onClick={() => void state.submit("ratify_action", [state.org.trim(), state.actionId, true], `ratify:${state.org.trim()}:${state.actionId}`)}>Ratify action</button></div></section><section className="panel"><span className="eyebrow">Counter Evidence</span><Field label="Original locked source URL" value={state.counterSourceUrl} onChange={state.setCounterSourceUrl} placeholder="https://..." /><Field label="Counter-evidence URL" value={state.counterUrl} onChange={state.setCounterUrl} placeholder="https://..." /><Field label="Counter-evidence SHA-256" value={state.counterHash} onChange={state.setCounterHash} placeholder="64-character SHA-256 hash" /><div className="actions"><button onClick={() => void state.submit("submit_counter_evidence", [state.org.trim(), state.actionId, state.counterSourceUrl, state.counterUrl, state.counterHash], `challenge:${state.org.trim()}:${state.actionId}`)}>Submit challenge</button><button onClick={() => void state.submit("resolve_challenge", [state.org.trim(), state.actionId], `resolve:${state.org.trim()}:${state.actionId}`)}>Resolve challenge</button></div></section></div>;
}

function ConstitutionView({ state }: { state: AppState }) {
  return <div className="card-grid constitution"><div className="data-card"><strong>AI cannot invent authority</strong><p>Consensus may select only a capability already stored for the organization.</p></div><div className="data-card"><strong>Code controls value</strong><p>Spend bounds, reserve floor, beneficiary, and withdrawal rules are deterministic contract checks.</p></div><div className="data-card"><strong>Beneficiary is immutable</strong><p>Value-moving capabilities bind the recipient before activation; withdrawal requires that wallet.</p></div><div className="data-card"><strong>Evidence fails closed</strong><p>Missing, changed, weak, or contradictory hash-bound evidence should abstain instead of spending.</p></div><div className="data-card"><strong>Challenges are permissionless</strong><p>Counter-evidence is hash-bound and resolved through a fresh GenLayer review.</p></div><div className="data-card"><strong>Loaded contract</strong><p><a href={`${explorerBase}/address/${contractAddress}`} target="_blank" rel="noreferrer">{contractAddress || "Not configured"}</a></p></div><StateCard title="Loaded Organization" raw={state.loaded.org} /></div>;
}

function KeeperView() {
  return <div className="view-stack"><section className="panel hero-panel"><span className="eyebrow">Keeper</span><h2>Permissionless operations, no special wallet required</h2><p>Kontyn does not rely on a privileged keeper for normal lifecycle work. Any wallet can call permissionless actions such as opening due epochs, finalizing challenge windows, reserving ready actions, and recovering expired allocations when the contract permits them.</p></section><section className="panel"><span className="eyebrow">Available in this frontend</span><div className="status-list"><Badge tone="good">Open epoch lives in Epochs</Badge><Badge tone="good">Finalize challenge window lives in Governance</Badge><Badge tone="good">Reserve and recover live in Treasury</Badge><Badge tone="warn">No centralized keeper backend is bundled</Badge></div></section></div>;
}

function AuditView({ state }: { state: AppState }) {
  return <div className="view-stack"><section className="panel"><span className="eyebrow">Verified Contract</span><h2>{contractAddress || "Not configured"}</h2>{contractAddress && <a className="button-link" href={`${explorerBase}/address/${contractAddress}`} target="_blank" rel="noreferrer">Open explorer</a>}</section><section className="panel"><span className="eyebrow">Exact Reads</span><div className="actions"><button onClick={() => void state.read("get_org", [state.org.trim()])}>Organization</button><button onClick={() => void state.read("get_charter", [state.org.trim()])}>Charter</button><button onClick={() => void state.read("get_treasury_state", [state.org.trim()])}>Treasury</button><button onClick={() => void state.read("get_treasury_policy", [state.org.trim()])}>Policy</button><button onClick={() => void state.read("get_epoch", [state.org.trim(), Number(state.epochNo)])}>Epoch</button><button onClick={() => void state.read("get_action", [state.org.trim(), state.actionId])}>Action</button><button onClick={() => void state.read("get_capability", [state.org.trim(), state.capabilityId])}>Capability</button></div>{state.result && <pre className="result">{state.result}</pre>}</section><div className="grid-2"><StateCard title="Organization" raw={state.loaded.org} /><StateCard title="Epoch" raw={state.loaded.epoch} /><StateCard title="Action" raw={state.loaded.action} /><StateCard title="Treasury" raw={state.loaded.treasury} /></div></div>;
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
  if (state.active === "Keeper") return <KeeperView />;
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

  async function connect(type: "injected" | "browser") { try { setWallet(type === "injected" ? await connectInjected() : browserWallet()); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not connect wallet."); } }
  async function submit(method: string, args: unknown[], key: string, value = 0n): Promise<boolean> { const address = contractAddress; if (!address) { setNotice("Configuration required: set NEXT_PUBLIC_KONTYN_CONTRACT_ADDRESS to the verified contract address."); return false; } if (args.some((item) => typeof item === "string" && item.trim() === "")) { setNotice("Complete every required field; Kontyn never substitutes a stale ID or placeholder value."); return false; } if (!wallet) { setNotice("Choose a wallet before submitting."); return false; } return studioQueue.enqueue(key, "user", async () => { try { setTx({ hash: "", stage: "Signature requested" }); const client = writeClient(wallet); if (wallet.mode === "injected") await client.connect("studionet"); const hash = await client.writeContract({ address, functionName: method, args: args as never[], value }); studioQueue.rememberTx(hash); setTx({ hash, stage: "Submitted - proposing" }); const receipt = await readClient.waitForTransactionReceipt({ hash, status: TransactionStatus.FINALIZED, interval: 20000, retries: 30 }); const finality = receipt as { resultName?: string; result_name?: string; statusName?: string }; const details = await readClient.getTransaction({ hash }) as { resultName?: string; result_name?: string; txExecutionResultName?: string; tx_execution_result_name?: string }; const consensus = details.resultName ?? details.result_name ?? finality.resultName ?? finality.result_name; const execution = details.txExecutionResultName ?? details.tx_execution_result_name; if (consensus !== "MAJORITY_AGREE" || (execution && execution !== ExecutionResult.FINISHED_WITH_RETURN)) throw new Error(`Finalized without successful execution: consensus=${consensus ?? "unknown"}, execution=${execution ?? "unknown"}`); studioQueue.forgetTx(hash); setTx({ hash, stage: String(finality.statusName) }); return true; } catch (error) { setTx({ hash: "", stage: "Failed", error: error instanceof Error ? error.message : "Unknown error" }); return false; } }); }
  async function createOrg() { try { const parsed = JSON.parse(charter); const hash = await sha256(parsed); if (await submit("create_org", [orgName, hash, JSON.stringify(parsed)], "create")) setNotice("Organization creation finalized. Read and enter the returned organization ID before continuing."); } catch { setNotice("Charter must be valid JSON. Add real SHA-256 source, metadata, and license hashes before opening an epoch."); } }
  async function read(method: string, args: unknown[]) { if (!contractAddress) { setNotice("Configuration required: no contract address is set."); return ""; } try { const value = String(await readClient.readContract({ address: contractAddress, functionName: method, args: args as never[] })); setResult(value); return value; } catch (error) { const value = error instanceof Error ? error.message : "Read failed."; setResult(value); return ""; } }
  async function loadState() {
    if (!contractAddress || !org.trim()) { setNotice("Enter an organization ID and make sure the contract address is configured."); return; }
    const address = contractAddress;
    setLoading(true);
    const next: Loaded = {};
    const safe = async (method: string, args: unknown[]) => { try { return String(await readClient.readContract({ address, functionName: method, args: args as never[] })); } catch { return ""; } };
    next.org = await safe("get_org", [org.trim()]);
    next.charter = await safe("get_charter", [org.trim()]);
    next.treasury = await safe("get_treasury_state", [org.trim()]);
    next.policy = await safe("get_treasury_policy", [org.trim()]);
    if (epochNo.trim()) next.epoch = await safe("get_epoch", [org.trim(), Number(epochNo)]);
    if (actionId.trim()) next.action = await safe("get_action", [org.trim(), actionId]);
    if (capabilityId.trim()) next.capability = await safe("get_capability", [org.trim(), capabilityId]);
    setLoaded(next); setLoading(false); setNotice("Loaded on-chain state.");
  }

  const state: AppState = { active, setActive, wallet, connect, disconnect: () => setWallet(null), org, setOrg, actionId, setActionId, epochNo, setEpochNo, capabilityId, setCapabilityId, orgName, setOrgName, charter, setCharter, capability, setCapability, policy, setPolicy, manifest, setManifest, counterSourceUrl, setCounterSourceUrl, counterUrl, setCounterUrl, counterHash, setCounterHash, fundWei, setFundWei, result, setResult, notice, setNotice, tx, loaded, loading, createOrg, submit, read, loadState };

  return <main className="shell"><aside><Link className="brand" href="/">KONTYN<small>MISSION ORRERY</small></Link><nav>{nav.map((item) => <button key={item} className={active === item ? "active" : ""} onClick={() => setActive(item)}>{item}</button>)}</nav><p className="rate">STUDIO SAFEGUARD<br /><b>18 RPM - user first</b></p></aside><section className="content"><header><div><span className="eyebrow">STUDIONET - EXPERIMENTAL</span><h1>{active}</h1></div><div className="wallet">{wallet ? <><span className="dot" /> {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)} <button onClick={state.disconnect}>Disconnect</button></> : <><button onClick={() => void connect("injected")}>Use wallet</button><button className="quiet" onClick={() => void connect("browser")}>Browser wallet</button></>}</div></header>{wallet?.warning && <div className="warning"><b>Browser wallet:</b> this key lives only in this browser. <button onClick={() => void navigator.clipboard.writeText(exportBrowserWallet() ?? "")}>Copy backup</button><button onClick={() => { const value = prompt("Paste browser-wallet private key"); if (value) try { setWallet(importBrowserWallet(value)); } catch (error) { setNotice(error instanceof Error ? error.message : "Import failed."); } }}>Import</button></div>}<SelectorStrip state={state} /><SectionView state={state} />{tx && <section className="tx" aria-live="polite"><div><span className="eyebrow">Transaction</span><strong>{tx.stage}</strong>{tx.error && <p>{tx.error}</p>}</div>{tx.hash && <a href={`${explorerBase}/tx/${tx.hash}`} target="_blank" rel="noreferrer">Explorer</a>}<ol><li>Signature</li><li>Submitted</li><li>Proposing</li><li>Committing</li><li>Revealing</li><li>Accepted</li><li>Finalized</li></ol></section>}{notice && <p className="notice" role="status">{notice}</p>}</section></main>;
}
