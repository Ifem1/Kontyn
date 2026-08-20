import Link from "next/link";
import { contractAddress, explorerBase } from "../../../lib/genlayer/config";

const flow = ["Mission", "Evidence", "GenLayer Consensus", "Bounded Capability", "Challenge", "Settlement"];

export function HomeLanding() {
  return <main className="home-page">
    <nav className="home-nav"><Link className="brand" href="/">KONTYN<small>MISSION ORRERY</small></Link><div><Link className="button-link quiet-link" href="/orgs/new">Explore Kontyn</Link>{contractAddress && <a className="button-link" href={`${explorerBase}/address/${contractAddress}`} target="_blank" rel="noreferrer">StudioNet explorer</a>}</div></nav>
    <section className="home-hero">
      <span className="eyebrow">Mission-bound autonomous organizations</span>
      <h1>Kontyn turns public evidence into bounded on-chain operations.</h1>
      <p>Define a mission, bind its evidence by hash, let GenLayer validators judge meaning, then allow deterministic contract rules to enforce exactly which capability can move value.</p>
      <div className="actions"><Link className="button-link" href="/orgs/new">Explore Kontyn</Link>{contractAddress && <a className="button-link quiet-link" href={`${explorerBase}/address/${contractAddress}`} target="_blank" rel="noreferrer">Open verified deployment</a>}</div>
    </section>
    <section className="flow-strip">{flow.map((item, index) => <div className="flow-step" key={item}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item}</strong></div>)}</section>
    <section className="two-col">
      <div className="panel hero-panel"><span className="eyebrow">Bounded AI Authority</span><h2>AI selects, code enforces.</h2><p>GenLayer consensus can evaluate live, messy, unstructured evidence. Kontyn restricts that judgment to choosing among capabilities the organization already approved. The model cannot invent a recipient, amount, budget, calldata, or new authority.</p></div>
      <div className="panel"><span className="eyebrow">Deterministic Settlement</span><h2>Every value effect is checked.</h2><p>The contract enforces charter hashes, source manifests, treasury limits, immutable beneficiaries, challenge windows, allocation reservation, withdrawal, and recovery paths. Weak or unavailable evidence fails closed instead of spending.</p></div>
    </section>
    <section className="panel verified-deploy">
      <span className="eyebrow">Verified StudioNet Deployment</span>
      <h2>{contractAddress || "Contract address not configured"}</h2>
      <p>This homepage uses the same public configuration as the app. No wallet is required to understand the protocol or inspect the verified StudioNet contract.</p>
      {contractAddress && <a className="button-link" href={`${explorerBase}/address/${contractAddress}`} target="_blank" rel="noreferrer">View on StudioNet explorer</a>}
    </section>
  </main>;
}
