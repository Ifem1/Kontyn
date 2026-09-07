/** Permissionless Kontyn epoch trigger. It never evaluates evidence or carries a key in source. */
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { assertKontynTxSuccessful } from "./tx-success.mjs";
const address = process.env.KONTYN_CONTRACT_ADDRESS;
const key = process.env.KONTYN_KEEPER_PRIVATE_KEY;
const orgId = process.env.KONTYN_ORG_ID;
const sources = (process.env.KONTYN_SOURCES ?? "").split(",").filter(Boolean);
if (!address || !orgId || !sources.length) throw new Error("Set KONTYN_CONTRACT_ADDRESS, KONTYN_ORG_ID, and KONTYN_SOURCES.");
if (!key) throw new Error("Set KONTYN_KEEPER_PRIVATE_KEY through a secret manager; never commit it.");
const client = createClient({ chain: studionet, account: createAccount(key) });
const timing = JSON.parse(await client.readContract({ address, functionName: "get_timing_state", args: [orgId] }));
const epoch = Number(timing.last_epoch) + 1;
const now = Math.floor(Date.now() / 1000);
if (now < Number(timing.next_epoch_timestamp)) {
  console.log(JSON.stringify({ status: "not_due", orgId, next_epoch: epoch, next_epoch_timestamp: timing.next_epoch_timestamp, display_only_now: now }));
  process.exit(0);
}
if (process.env.DRY_RUN === "true") { console.log(JSON.stringify({ dryRun: true, method: "open_epoch", orgId, epoch, sources, next_epoch_timestamp: timing.next_epoch_timestamp })); process.exit(0); }
const existing = await client.readContract({ address, functionName: "get_epoch", args: [orgId, epoch] });
if (existing) { console.log("Epoch already exists; idempotent exit."); process.exit(0); }
const hash = await client.writeContract({ address, functionName: "open_epoch", args: [orgId, epoch, JSON.stringify({ sources })], value: 0n });
const finality = await client.waitForTransactionReceipt({ hash, status: TransactionStatus.FINALIZED, interval: 20000, retries: 30, fullTransaction: true });
const details = await client.getTransaction({ hash });
const receipt = { ...finality, ...details, statusName: details.statusName ?? finality.statusName, status_name: details.status_name ?? finality.status_name };
assertKontynTxSuccessful(receipt, hash);
console.log(JSON.stringify({ hash, status: "finalized", epoch }));
