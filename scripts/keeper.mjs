/** Permissionless Kontyn epoch trigger. It never evaluates evidence or carries a key in source. */
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
const address = process.env.KONTYN_CONTRACT_ADDRESS;
const key = process.env.KONTYN_KEEPER_PRIVATE_KEY;
const orgId = process.env.KONTYN_ORG_ID;
const epoch = Number(process.env.KONTYN_EPOCH_NO ?? "0");
const sources = (process.env.KONTYN_SOURCES ?? "").split(",").filter(Boolean);
if (!address || !orgId || !epoch || !sources.length) throw new Error("Set KONTYN_CONTRACT_ADDRESS, KONTYN_ORG_ID, KONTYN_EPOCH_NO and KONTYN_SOURCES.");
if (process.env.DRY_RUN === "true") { console.log(JSON.stringify({ dryRun: true, method: "open_epoch", orgId, epoch, sources })); process.exit(0); }
if (!key) throw new Error("Set KONTYN_KEEPER_PRIVATE_KEY through a secret manager; never commit it.");
const client = createClient({ chain: studionet, account: createAccount(key) });
const existing = await client.readContract({ address, functionName: "get_epoch", args: [orgId, epoch] });
if (existing) { console.log("Epoch already exists; idempotent exit."); process.exit(0); }
const hash = await client.writeContract({ address, functionName: "open_epoch", args: [orgId, epoch, JSON.stringify({ sources })], value: 0n });
console.log(JSON.stringify({ hash, status: "submitted" }));
