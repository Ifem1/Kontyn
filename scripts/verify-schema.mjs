import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
const address = process.env.NEXT_PUBLIC_KONTYN_CONTRACT_ADDRESS;
if (!address) throw new Error("NEXT_PUBLIC_KONTYN_CONTRACT_ADDRESS is required.");
const schema = await createClient({ chain: studionet, account: createAccount() }).getContractSchema(address);
const required = ["create_org", "add_capability", "activate_org", "open_epoch", "get_org", "get_epoch", "get_action"];
const text = JSON.stringify(schema);
for (const name of required) if (!text.includes(name)) throw new Error(`Deployed schema is missing ${name}`);
console.log("Kontyn schema matches required frontend calls.");
