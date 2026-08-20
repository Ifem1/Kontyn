# Kontyn

Kontyn is a mission-bound autonomous organization on GenLayer. It combines a locked charter, bounded capability registry, treasury policy, and recurring evidence review for operational continuity—not a promise of permanence.

The consensus question is narrow: given an organization’s mission, charter-locked public evidence, approved capabilities, and budget envelope, which bounded action—if any—is justified this epoch? A normal contract cannot independently interpret changing public evidence. GenLayer validators can, and Kontyn applies deterministic authority constraints after consensus.

## Safety boundary

- Submitted evidence manifests must exactly equal the charter’s HTTPS source allowlist. The full canonical charter, plus each source, metadata document, and license document, are locked by SHA-256 content hashes; a changed or unavailable document causes a safe abstention rather than a spend.
- Leader and validators independently fetch the same sources. Both prompts classify fetched content as untrusted quoted evidence, never instructions.
- Weak, inaccessible, conflicting, malformed, or unsupported evidence must become `INCONCLUSIVE` / `ABSTAIN`.
- An LLM cannot create an address, recipient, target, calldata, capability, or budget. It can select only a pre-recorded capability, and reserve/spend/risk checks run deterministically afterward.
- Tier 2 actions need ratification. Every GEN-moving action then enters a permissionless challenge window. Counter-evidence is hash-bound and is resolved by a fresh GenLayer consensus review, never a founder decision. A value-moving capability permanently binds its beneficiary before activation. Finalized actions reserve GEN; only that beneficiary can withdraw, while an unclaimed allocation returns to unreserved treasury after its declared epoch expiry. The founder can recover only non-reserved GEN while the reserve floor remains intact. Rejected, cancelled, and undetermined actions reserve nothing.

## Commands

```powershell
npm.cmd run lint
npm.cmd run build
genvm-lint check contracts/kontyn.py --json
pytest tests/direct/ -v
npm.cmd run keeper
npm.cmd run exercise:studionet
```

The direct suite covers lifecycle guards, canonical charter commitments, immutable evidence bindings, founder authorization, immutable value-capability beneficiaries, funding accounting, exact reservation, expiry recovery, unfunded allocation rejection, rejected/cancelled recovery, and a mocked consensus proposal through action creation with its challenge and expiry windows. The live suite runs the same StudioNet full-cycle script when disposable test keys are explicitly supplied.

Copy `.env.example` to `.env.local`, deploy first, then set `NEXT_PUBLIC_KONTYN_CONTRACT_ADDRESS`. `scripts/verify-schema.mjs` checks the deployed schema against client call sites. The permissionless keeper is idempotent and opens due epochs only; it never supplies a verdict.

## Studionet verification

Current StudioNet contract: [`0x9F5602653B6ADf0D361d9D9A76108C6ea1ad76fF`](https://explorer-studio.genlayer.com/address/0x9F5602653B6ADf0D361d9D9A76108C6ea1ad76fF).

The finalized disposable-wallet run deployed this exact revision, created the organization and policy, added the immutable-beneficiary capability, funded 10 wei, recovered the unallocated value, re-funded 10 wei, and submitted an epoch. The epoch transaction [`0x35cb…f8ed`](https://explorer-studio.genlayer.com/tx/0x35cb1299525dcb67814881410817cbcd6f21ab8e63d4a33233ac47854e2af8ed) stored an accepted `INCONCLUSIVE` / `ABSTAIN` decision with zero spend; treasury remained 10 available / 0 reserved. This is the correct fail-closed result for the hash-bound IANA placeholder evidence used by the test.

## Studio limit

Studio’s 30 RPM limit cannot be increased by an app. Kontyn keeps foreground traffic at 18 RPM, reserves six requests/minute for receipt recovery, de-duplicates identical requests, persists submitted transaction hashes across refreshes, prioritizes user writes over keepers, coalesces reads, and retries `429` / busy / transient failures with exponential backoff plus jitter. It shows queued or configuration-required states instead of fabricating outcomes. This protects each browser session; a shared relay would be required to coordinate a global quota across all users, and Kontyn intentionally does not use one because it would become an additional centralized transaction dependency.

## Honest current limits

Studio can return `UNDETERMINED`; no state changes in that branch and the caller must retry. The source hashes intentionally make mutable web pages fail closed, so organizations should use stable, versioned documents or update their charter while it is still in `DRAFT`. The live proof above intentionally uses placeholder evidence and therefore cannot create a payment. Withdrawal, allocation-expiry recovery, counter-evidence input validation, and successful action construction are covered in the direct suite; before any material real treasury is funded, run a separate live scenario using genuine, hash-bound source evidence that justifies a bounded capability and exercise its challenge and withdrawal path.
