# Kontyn

Kontyn is a mission-bound autonomous organization on GenLayer. It combines a locked charter, bounded capability registry, treasury policy, and recurring evidence review for operational continuity—not a promise of permanence.

The consensus question is narrow: given an organization’s mission, charter-locked public evidence, approved capabilities, and budget envelope, which bounded action—if any—is justified this epoch? A normal contract cannot independently interpret changing public evidence. GenLayer validators can, and Kontyn applies deterministic authority constraints after consensus.

## Safety boundary

- Submitted evidence manifests must exactly equal the charter’s HTTPS source allowlist.
- Leader and validators independently fetch the same sources. Both prompts classify fetched content as untrusted quoted evidence, never instructions.
- Weak, inaccessible, conflicting, malformed, or unsupported evidence must become `INCONCLUSIVE` / `ABSTAIN`.
- An LLM cannot create an address, recipient, target, calldata, capability, or budget. It can select only a pre-recorded capability, and reserve/spend/risk checks run deterministically afterward.
- Tier 2 actions need ratification. A value-moving capability must permanently bind a beneficiary address before activation. Finalized actions reserve GEN; only that beneficiary can withdraw its allocation. The founder can recover only non-reserved GEN while the reserve floor remains intact. Rejected, cancelled, and undetermined actions reserve nothing.

## Commands

```powershell
npm.cmd run lint
npm.cmd run build
genvm-lint check contracts/kontyn.py --json
pytest tests/direct/ -v
npm.cmd run keeper
npm.cmd run exercise:studionet
```

The direct suite currently covers 11 lifecycle checks: organization state guards, founder authorization, immutable value-capability beneficiaries, funding accounting, exact reservation, unfunded allocation rejection, and rejected/cancelled recovery.

Copy `.env.example` to `.env.local`, deploy first, then set `NEXT_PUBLIC_KONTYN_CONTRACT_ADDRESS`. `scripts/verify-schema.mjs` checks the deployed schema against client call sites. The permissionless keeper is idempotent and opens due epochs only; it never supplies a verdict.

## Studionet verification

Current verified contract: [`0x065514D5748915e47c89547E9695C1F375091084`](https://explorer-studio.genlayer.com/address/0x065514D5748915e47c89547E9695C1F375091084).

The disposable-wallet lifecycle exercised charter creation, policy configuration, an immutable-beneficiary capability, 10 wei funding, activation, unallocated treasury recovery, re-funding, and a real permissionless epoch submission. The epoch returned no accepted decision, so it created no allocation and reserved no funds; the observable treasury state remained 10 available / 0 reserved. This is the correct safe outcome when consensus does not produce a usable result.

## Studio limit

Studio’s 30 RPM limit cannot be increased by an app. Kontyn keeps foreground traffic at 18 RPM, reserves six requests/minute for receipt recovery, de-duplicates identical requests, persists submitted transaction hashes across refreshes, prioritizes user writes over keepers, coalesces reads, and retries `429` / busy / transient failures with exponential backoff plus jitter. It shows queued or configuration-required states instead of fabricating outcomes. This protects each browser session; a shared relay would be required to coordinate a global quota across all users, and Kontyn intentionally does not use one because it would become an additional centralized transaction dependency.

## Honest current limits

No Studionet deployment or integration run is recorded because no deploy account/address was supplied. Studio can return `UNDETERMINED`; no state changes in that branch and the user must retry. The newly added external-transfer branches require a real Studionet lifecycle exercise before users should fund a deployed instance.
