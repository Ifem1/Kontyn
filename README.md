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

Current StudioNet contract: [`0x7E7A09DF5C75cDd94fBFe6527fCE3F15AB50A2d6`](https://explorer-studio.genlayer.com/address/0x7E7A09DF5C75cDd94fBFe6527fCE3F15AB50A2d6).

Final verified commit: `cfb931a`. Deployment transaction: [`0xe364…e1ca`](https://explorer-studio.genlayer.com/tx/0xe36453b55ada763be0fb9f5369163ae12d4002f3e1b8c16291b5c391603be1ca).

The finalized disposable-wallet run deployed the final revision, created the organization and policy, added an immutable-beneficiary capability, funded 10 wei, proved unallocated treasury recovery, re-funded 10 wei, ran the positive consensus epoch, advanced the challenge window, finalized it, reserved the allocation, and withdrew to the immutable beneficiary.

Positive lifecycle proof:

- Epoch 1 consensus: [`0x8d67…a9af`](https://explorer-studio.genlayer.com/tx/0x8d678e8de5542e42eaa56f5d95897cdded0913269c8b511ea188f293b1e5a9af) accepted `PROPOSE_CAPABILITY` for capability `test-grant`, amount `10`.
- Epoch 2 challenge-window advance: [`0x189c…1301`](https://explorer-studio.genlayer.com/tx/0x189ce9a49de0c3c24880bf24369356ce1fde0377bf8d43b4d4696ac36f791301).
- Finalize challenge window: [`0x8c53…6687`](https://explorer-studio.genlayer.com/tx/0x8c53221a48f1adfe7356cecbe42d675df6f5a9c0beddd1aac0a3f64a78436687).
- Reserve allocation: [`0x9179…d782`](https://explorer-studio.genlayer.com/tx/0x9179fc92c318bcef761d715d71537067584533932314ce04c7dcd5bb4cb9d782).
- Withdraw allocation: [`0x6c6c…d94a`](https://explorer-studio.genlayer.com/tx/0x6c6c7944fa682b511503252eb0bc9a9d6b663879f5d067b8173473eab1bad94a).

Final verified action status was `WITHDRAWN`; final treasury was `0` total, `0` reserved, and `0` available. `npm run verify:schema` passed against this contract address.

## Studio limit

Studio’s 30 RPM limit cannot be increased by an app. Kontyn keeps foreground traffic at 18 RPM, reserves six requests/minute for receipt recovery, de-duplicates identical requests, persists submitted transaction hashes across refreshes, prioritizes user writes over keepers, coalesces reads, and retries `429` / busy / transient failures with exponential backoff plus jitter. It shows queued or configuration-required states instead of fabricating outcomes. This protects each browser session; a shared relay would be required to coordinate a global quota across all users, and Kontyn intentionally does not use one because it would become an additional centralized transaction dependency.

## Honest current limits

Studio can return `UNDETERMINED`; no state changes in that branch and the caller must retry. The source hashes intentionally make mutable web pages fail closed, so organizations should use stable, versioned documents or update their charter while it is still in `DRAFT`. The live proof above uses a hash-bound factual fixture for the positive payout path; before any material real treasury is funded, run the same lifecycle with the real organization evidence and keep the source, metadata, license, and version hashes immutable.
