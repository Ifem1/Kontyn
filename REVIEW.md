# Kontyn Steward Review Response

## Purpose

This document maps the steward’s review points to the implementation currently published in `contracts/kontyn.py`. It is intentionally an engineering response, not product marketing: each item identifies the concern, the change made, the relevant entry points, the resulting guarantee, and the evidence available.

## 1. Epoch timing and keeper authority

### Original concern

Epoch numbers could previously be advanced by any caller as quickly as transactions were accepted. If challenge windows or allocation expiry were derived from epoch numbers, a caller or keeper could compress those protections by opening epochs rapidly.

### What changed

Kontyn now stores an organization cadence and derives due times from deterministic GenVM transaction time. Organization creation records `epoch_duration_seconds`; activation snapshots an `epoch_anchor_timestamp` and computes `next_epoch_timestamp`. Each successful epoch opening advances the schedule from the anchor rather than from the caller’s claimed time.

### Relevant contract functions

- `create_org`
- `update_draft_charter`
- `activate_org`
- `open_epoch`
- `get_timing_state`
- `_now`

### Security guarantee after the change

`open_epoch` remains permissionless, but it rejects a call before `next_epoch_timestamp` with `EPOCH_NOT_DUE`. Sequential numbering and replay checks remain enforced. A keeper is therefore a liveness convenience only: it can submit a transaction when due, but it cannot make an early epoch valid. Browser clocks, Vercel cron, environment variables, and caller-supplied timestamps are not security inputs.

## 2. Challenge-window deadlines

### Original concern

The challenge period was tied to a later epoch number. Rapid epoch advancement could therefore terminate the period early.

### What changed

Every value-moving action records `challenge_deadline` at the moment it enters `CHALLENGE_WINDOW`. The deadline is computed from deterministic transaction time plus the immutable capability’s `challenge_duration_seconds`. Counter-evidence is accepted only while `now < challenge_deadline`; finalization is accepted only when `now >= challenge_deadline` and no unresolved challenge exists.

### Relevant contract functions

- `open_epoch`
- `ratify_action`
- `submit_counter_evidence`
- `finalize_challenge_window`
- `resolve_challenge`

### Security guarantee after the change

Opening additional epochs cannot shorten a challenge. The exact equality boundary is explicit: evidence is closed and finalization becomes eligible at the stored deadline. Challenged actions cannot be finalized while a challenge is pending. Challenge resolution itself also cannot move an action forward before the deadline.

## 3. Counter-evidence semantics

### Original concern

Counter-evidence needed to be hash-bound and independently adjudicated. Invalid or inaccessible challenger material must not silently create a payout or cause an unjustified cancellation.

### What changed

The contract validates the primary source binding, HTTPS counter URL, and SHA-256 counter hash before storing a challenge. During adjudication, the leader and validators independently fetch the locked primary sources and counter source. A primary-source mismatch fails closed toward cancellation; an invalid or unreachable counter source preserves the original action rather than cancelling it. The validator independently derives `UPHOLD_ACTION` or `CANCEL_ACTION` from the frozen action context and compares the settlement outcome.

### Relevant contract functions

- `submit_counter_evidence`
- `resolve_challenge`
- `_assess_challenge`

### Security guarantee after the change

The challenger cannot invent a beneficiary, amount, capability, or authority. A counter hash mismatch or inaccessible counter document does not become a cancellation signal. The current design permits one active challenge record per action; it is resolved permissionlessly and remains hash-bound to the frozen action and source manifest.

## 4. Allocation lifetime and withdrawal safety

### Original concern

Allocation expiry could begin when an action was created rather than when funds were actually reserved. Withdrawal also needed a strict post-expiry boundary with no transaction-order race.

### What changed

An action records `allocated_at` and `allocation_expires_at` only when `execute_ready_action` successfully reserves funds. Withdrawal requires the immutable capability beneficiary and `now < allocation_expires_at`. At or after expiry, withdrawal fails with `ALLOCATION_EXPIRED`; `recover_expired_allocation` is permissionless and succeeds only when `now >= allocation_expires_at`.

### Relevant contract functions

- `execute_ready_action`
- `withdraw_allocation`
- `recover_expired_allocation`
- `get_action`

### Security guarantee after the change

Challenge and ratification delays do not consume allocation lifetime. Before expiry, only the immutable beneficiary can withdraw and recovery is rejected. At or after expiry, beneficiary withdrawal is rejected and recovery is eligible. The boundary is enforced by contract time, not UI countdowns.

## 5. Transaction-success semantics

### Original concern

A finalized transaction with majority agreement is not necessarily a successful GenVM execution. Missing execution results, GenVM errors, disagreement, and undetermined outcomes must never be reported as successful.

### What changed

Kontyn centralizes receipt evaluation in `scripts/tx-success.mjs` and `lib/genlayer/tx-success.ts`. Success requires all three conditions: `FINALIZED`, `MAJORITY_AGREE`, and explicit `FINISHED_WITH_RETURN`. There is no nested receipt fallback. Missing execution is failure.

### Relevant files

- `scripts/tx-success.mjs`
- `lib/genlayer/tx-success.ts`
- `scripts/full-cycle-studionet.mjs`
- `scripts/exercise-studionet.mjs`
- `scripts/continue-studionet-cycle.mjs`
- `scripts/keeper.mjs`
- `app/components/kontyn/KontynShell.tsx`

### Security guarantee after the change

The frontend, keeper, and proof scripts cannot call a transaction successful based only on finality or consensus majority. Adversarial tests cover successful return, missing execution, execution error, majority disagreement, undetermined state, and non-finalized state.

## 6. Founder / constitutional authority

### Original concern

Kontyn’s autonomy claims must disclose the remaining founder powers instead of implying governance with zero human authority.

### What changed

README and the product UI explicitly describe Kontyn as bounded autonomous operation under a founder-established constitution. The documented founder powers are: organization creation, draft charter updates, draft treasury policy, draft capability and beneficiary configuration, activation, Tier-2 ratification or rejection, pre-reservation cancellation, unreserved treasury withdrawal subject to the reserve floor, safe-mode entry and exit, and sunsetting.

### Security guarantee after the change

GenLayer consensus evaluates evidence and proposes bounded settlement choices, but it cannot invent capabilities, beneficiaries, budgets, calldata, or authority. Ordinary challenge resolution and liveness paths remain permissionless. Founder constitutional and recovery powers are explicit and access-controlled.

## 7. Independent validator derivation

### Original concern

Validators should independently derive settlement-relevant results rather than merely endorse the leader’s prose.

### What changed

The epoch validator independently reasons from the frozen mission, charter, source bindings, fetched evidence, capability registry, beneficiary, policy, treasury availability, risk tier, and action context. It derives and compares `decision`, `capability_id`, `spend_amount_wei`, and `risk_tier`. Challenge validators independently derive the binary settlement outcome. Explanatory prose is not required to match exactly.

### Security guarantee after the change

Consensus disagreement on a settlement-relevant field prevents acceptance. Evidence remains independently fetched and SHA-256 checked. Prompt-injection resistance, unsupported-capability rejection, spend bounds, and safe abstention remain fail-closed.

## 8. Deterministic financial bounds retained

The final contract retains the immutable beneficiary binding, capability amount caps, per-epoch spend limits, reserve floor, exact reservation accounting, no-reserve behavior for rejected/cancelled/undetermined actions, hash-bound counter-evidence, charter-locked evidence manifests, immutable source hashes, and explicit Tier-2 ratification.

## 9. Verification performed

Static and semantic GenVM lint validation passed in a fresh Python 3.12 environment. The JavaScript build, TypeScript checking, ESLint, schema verification, and receipt adversarial tests passed. The direct suite collected 31 tests, but the official runner attempted to download the unavailable upstream `genvm-universal` `v0.3.0-rc7` artifact and failed before any contract assertion. This is recorded as a tooling limitation, not represented as passing contract evidence.

## 10. Final deployment parity

- Final source commit: `faa3bc3`
- Current StudioNet contract: `0xC79E9eE7f38D0D211c7EBF181614bDe7B8b155bC`
- Deployment transaction: `0xfd9d18bebab0b81031d9dfd8065a9e589757b5aaaacf79fa51403c0970a3a59`
- Schema verification: passed against the current address
- Production frontend: [kontyn.vercel.app](https://kontyn.vercel.app)

The README labels the historical lifecycle hashes as evidence from an earlier revision. A fresh full lifecycle was not rerun against the current final address, so those historical hashes are not presented as final-deployment proof.

## Conclusion

The implementation now has deterministic on-chain timing, explicit challenge and allocation boundaries, strict receipt-success semantics, independently derived validator outcomes, retained financial controls, and a disclosed founder trust model. The remaining limitation is the unavailable upstream direct-test runner artifact; semantic validation and the application-level verification gates pass.
