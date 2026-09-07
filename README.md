# Kontyn

Kontyn is a mission-bound, founder-constituted autonomous operation on GenLayer. It combines a locked charter, bounded capability registry, treasury policy, deterministic timing, and recurring evidence review for operational continuity—not a promise of permanence or zero-human authority.

The consensus question is narrow: given an organization’s mission, charter-locked public evidence, approved capabilities, and budget envelope, which bounded action—if any—is justified this epoch? A normal contract cannot independently interpret changing public evidence. GenLayer validators can, and Kontyn applies deterministic authority constraints after consensus.

## Safety boundary

- Submitted evidence manifests must exactly equal the charter’s HTTPS source allowlist. The full canonical charter, plus each source, metadata document, and license document, are locked by SHA-256 content hashes; a changed or unavailable document causes a safe abstention rather than a spend.
- Leader and validators independently fetch the same sources. Both prompts classify fetched content as untrusted quoted evidence, never instructions.
- Weak, inaccessible, conflicting, malformed, or unsupported evidence must become `INCONCLUSIVE` / `ABSTAIN`.
- An LLM cannot create an address, recipient, target, calldata, capability, or budget. It can select only a pre-recorded capability, and reserve/spend/risk checks run deterministically afterward.
- Epoch cadence is enforced by deterministic GenVM transaction time. `open_epoch` is permissionless but reverts with `EPOCH_NOT_DUE` before the organization’s stored `next_epoch_timestamp`; opening extra epochs cannot shorten challenge or allocation windows.
- Tier 2 actions need founder ratification before they enter an ordinary challenge window. Every GEN-moving challenge window stores a deterministic `challenge_deadline`; finalization is allowed at `now >= challenge_deadline`, while counter-evidence is allowed only while `now < challenge_deadline`.
- A value-moving capability permanently binds its beneficiary before activation. Allocation lifetime starts only when `execute_ready_action` reserves funds: the contract stores `allocated_at` and `allocation_expires_at`. The beneficiary can withdraw only while `now < allocation_expires_at`; at or after expiry, withdrawal fails with `ALLOCATION_EXPIRED` and permissionless recovery can return the reserved funds to treasury. Rejected, cancelled, and undetermined actions reserve nothing.
- Every app/script transaction-success check requires `FINALIZED`, `MAJORITY_AGREE`, and `FINISHED_WITH_RETURN`. Missing execution results, GenVM errors, `MAJORITY_DISAGREE`, `UNDETERMINED`, and non-finalized transactions are failures.

## Founder / Constitutional Authority

Kontyn is bounded autonomous operation under a founder-established constitution. GenLayer consensus evaluates evidence and proposes only settlement-relevant choices inside frozen mission, evidence, capability, beneficiary and treasury context. The model cannot invent capabilities, beneficiaries, budgets, calldata or authority. Ordinary counter-evidence is resolved through GenLayer consensus, not founder whim.

The founder nevertheless retains these explicit constitutional/recovery powers in `contracts/kontyn.py`:

- create an organization and set its draft charter;
- update the draft charter before activation;
- configure draft treasury policy;
- add draft capabilities, including immutable value-capability beneficiaries and time durations;
- activate the organization once at least one capability exists;
- ratify or reject Tier-2 actions before they enter the normal challenge window;
- cancel `READY` or `RATIFICATION_REQUIRED` actions before reservation;
- withdraw unreserved treasury while preserving the reserve floor;
- enter safe mode;
- exit safe mode;
- sunset the organization.

Non-founders cannot exercise those paths. Anyone may call permissionless liveness/settlement paths when contract preconditions hold, including due epoch opening, challenge finalization, ready-action execution, counter-evidence submission, challenge resolution, and expired-allocation recovery.

## Commands

```powershell
npm.cmd run lint
npm.cmd run build
genvm-lint check contracts/kontyn.py --json
pytest tests/direct/ -v
npm.cmd run keeper
npm.cmd run exercise:studionet
```

The direct suite covers lifecycle guards, canonical charter commitments, immutable evidence bindings, founder authorization, immutable value-capability beneficiaries, deterministic epoch cadence, time-based challenge boundaries, reservation-time allocation expiry, no post-expiry withdrawal/recovery race, funding accounting, exact reservation, unfunded allocation rejection, rejected/cancelled recovery, and a mocked consensus proposal through action creation with its challenge and expiry windows. The live suite runs the same StudioNet full-cycle script when disposable test keys are explicitly supplied.

Copy `.env.example` to `.env.local`, deploy first, then set `NEXT_PUBLIC_KONTYN_CONTRACT_ADDRESS`. `scripts/verify-schema.mjs` checks the deployed schema against client call sites, including timing reads. The permissionless keeper is idempotent and only submits when its local read says the epoch is due; the contract remains the security boundary and rejects early epochs.

## Studionet verification

Current StudioNet contract: [`0xC79E9eE7f38D0D211c7EBF181614bDe7B8b155bC`](https://explorer-studio.genlayer.com/address/0xC79E9eE7f38D0D211c7EBF181614bDe7B8b155bC). Earlier addresses are superseded.

Final verified commit: `faa3bc3`. Deployment transaction: [`0xfd9d18bebab0b81031d9dfd8065a9e589757b5aaaacf79fa51403c0970a3a59`](https://explorer-studio.genlayer.com/tx/0xfd9d18bebab0b81031d9dfd8065a9e589757b5aaaacf79fa51403c0970a3a59).

The finalized disposable-wallet run deployed the final revision, created the organization and policy, added an immutable-beneficiary capability, funded 10 wei, proved unallocated treasury recovery, re-funded 10 wei, ran the positive consensus epoch, advanced the challenge window, finalized it, reserved the allocation, and withdrew to the immutable beneficiary.

Positive lifecycle proof:

- Setup: deploy `0xf3192d…d025c2`, create organization `0xece1ab…ad2c9`, policy `0x77c665…253ff`, capability `0x95a52b…c4b98`, fund `0x6db33d…33031`, activate `0x285ba6…bc759`.
- Early epoch rejection: `0x9e0f814105a4be99dfe8a869ee0dd4899f922c7eb8b17c5b304fcefb5c00906d` (expected revert).
- Epoch 1 consensus: [`0x03cd09ac855bce2700a995e36e9aa24a50b550aec823bc73d33db9ed97dd1f83`](https://explorer-studio.genlayer.com/tx/0x03cd09ac855bce2700a995e36e9aa24a50b550aec823bc73d33db9ed97dd1f83).
- Early finalization rejection: `0x35132c07172cd82f982d752a730483f8090b795c234ffec2b3463db183195e25` (expected revert).
- Finalize challenge window: [`0x30933dbeff5509f4401141eca952fd6e09e2435ab4cb9e7424c418e800c7f43c`](https://explorer-studio.genlayer.com/tx/0x30933dbeff5509f4401141eca952fd6e09e2435ab4cb9e7424c418e800c7f43c).
- Reserve allocation: [`0x963c85e289d492cb4d53cb67ba364fc611cd91a45f02e5d6c03bc7e8ed4805ce`](https://explorer-studio.genlayer.com/tx/0x963c85e289d492cb4d53cb67ba364fc611cd91a45f02e5d6c03bc7e8ed4805ce).
- Withdraw allocation: [`0x43f44c2370422989f55e476f496dec2fefb2c70b1c543a28ed647acce334ddb7`](https://explorer-studio.genlayer.com/tx/0x43f44c2370422989f55e476f496dec2fefb2c70b1c543a28ed647acce334ddb7).

Final verified action status was `WITHDRAWN`; final treasury was `0` total, `0` reserved, and `0` available. Epoch cadence was 300 seconds, challenge duration 600 seconds, and allocation expiry 300 seconds. `npm run verify:schema` passed against this contract address.

## Studio limit

Studio’s 30 RPM limit cannot be increased by an app. Kontyn keeps foreground traffic at 18 RPM, reserves six requests/minute for receipt recovery, de-duplicates identical requests, persists submitted transaction hashes across refreshes, prioritizes user writes over keepers, coalesces reads, and retries `429` / busy / transient failures with exponential backoff plus jitter. It shows queued or configuration-required states instead of fabricating outcomes. This protects each browser session; a shared relay would be required to coordinate a global quota across all users, and Kontyn intentionally does not use one because it would become an additional centralized transaction dependency.

## Honest current limits

Studio can return `UNDETERMINED`; no state changes in that branch and the caller must retry. The source hashes intentionally make mutable web pages fail closed, so organizations should use stable, versioned documents or update their charter while it is still in `DRAFT`. The live proof above uses a hash-bound factual fixture for the positive payout path; before any material real treasury is funded, run the same lifecycle with the real organization evidence and keep the source, metadata, license, and version hashes immutable.
