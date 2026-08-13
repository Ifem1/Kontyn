/** Disposable-account Studionet smoke test. Never prints or persists its private key. */
import { readFileSync } from "node:fs";
import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const account = createAccount(generatePrivateKey());
const client = createClient({ chain: studionet, account });
const code = new Uint8Array(readFileSync("contracts/kontyn.py"));
const deployed = await client.deployContract({ code, args: [], value: 0n });
const receipt = await client.waitForTransactionReceipt({ hash: deployed, status: TransactionStatus.FINALIZED, interval: 5000, retries: 90 });
const address = receipt.data?.contract_address;
if (!address) throw new Error(`Deployment produced no contract address: ${JSON.stringify(receipt)}`);
const charter = JSON.stringify({ mission: "Studionet smoke test", source_bindings: [{ source_url: "https://example.com/", metadata_url: "https://example.com/", license_url: "https://example.com/", version_hash: "example-v1" }] });
const createHash = await client.writeContract({ address, functionName: "create_org", args: ["Kontyn smoke", "smoke-charter-v1", charter], value: 0n });
await client.waitForTransactionReceipt({ hash: createHash, status: TransactionStatus.FINALIZED, interval: 5000, retries: 90 });
const org = await client.readContract({ address, functionName: "get_org", args: ["1"] });
if (!org) throw new Error("Smoke read returned no organization.");
console.log(JSON.stringify({ account: account.address, deployment_tx: deployed, contract_address: address, create_org_tx: createHash, org }, null, 2));
