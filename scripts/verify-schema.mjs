import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
const address = process.env.NEXT_PUBLIC_KONTYN_CONTRACT_ADDRESS;
if (!address) throw new Error("NEXT_PUBLIC_KONTYN_CONTRACT_ADDRESS is required.");
const schema = await createClient({ chain: studionet, account: createAccount() }).getContractSchema(address);
const required = ["create_org", "configure_treasury_policy", "add_capability", "fund_org", "activate_org", "open_epoch", "finalize_challenge_window", "submit_counter_evidence", "resolve_challenge", "execute_ready_action", "withdraw_allocation", "recover_expired_allocation", "cancel_ready_action", "get_org", "get_charter", "get_capability", "get_epoch", "get_action", "get_treasury_state"];
const text = JSON.stringify(schema);
for (const name of required) if (!text.includes(name)) throw new Error(`Deployed schema is missing ${name}`);
console.log("Kontyn schema matches required frontend calls.");
