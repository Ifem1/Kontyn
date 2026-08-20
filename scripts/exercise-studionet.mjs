/** Disposable-account Studionet smoke test. Never prints or persists its private key. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";

const account = createAccount(generatePrivateKey());
const client = createClient({ chain: studionet, account });
const code = new Uint8Array(readFileSync("contracts/kontyn.py"));
const assertSuccessful = (receipt, hash) => {
  const consensus = receipt.resultName ?? receipt.result_name;
  const execution = receipt.txExecutionResultName ?? receipt.tx_execution_result_name;
  if (consensus !== "MAJORITY_AGREE" || (execution && execution !== ExecutionResult.FINISHED_WITH_RETURN)) {
    throw new Error(`Transaction ${hash} did not execute successfully: consensus=${consensus ?? "unknown"}, execution=${execution ?? "unknown"}`);
  }
};
const deployed = await client.deployContract({ code, args: [], value: 0n });
const receipt = await client.waitForTransactionReceipt({ hash: deployed, status: TransactionStatus.FINALIZED, interval: 5000, retries: 90, fullTransaction: true });
assertSuccessful(receipt, deployed);
const address = receipt.data?.contract_address;
if (!address) throw new Error(`Deployment produced no contract address: ${JSON.stringify(receipt)}`);
const sourceUrl = "https://example.com/";
const sourceBody = new Uint8Array(await (await fetch(sourceUrl)).arrayBuffer());
const sourceHash = createHash("sha256").update(sourceBody).digest("hex");
const charter = JSON.stringify({ mission: "Studionet smoke test", source_bindings: [{ source_url: sourceUrl, metadata_url: sourceUrl, license_url: sourceUrl, source_hash: sourceHash, metadata_hash: sourceHash, license_hash: sourceHash, version_hash: sourceHash }] });
const canonical = (value) => JSON.stringify(value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, JSON.parse(canonical(value[key]))])) : Array.isArray(value) ? value.map((item) => JSON.parse(canonical(item))) : value);
const charterHash = createHash("sha256").update(canonical(JSON.parse(charter))).digest("hex");
const createOrgHash = await client.writeContract({ address, functionName: "create_org", args: ["Kontyn smoke", charterHash, charter], value: 0n });
assertSuccessful(await client.waitForTransactionReceipt({ hash: createOrgHash, status: TransactionStatus.FINALIZED, interval: 5000, retries: 90, fullTransaction: true }), createOrgHash);
const org = await client.readContract({ address, functionName: "get_org", args: ["1"] });
if (!org) throw new Error("Smoke read returned no organization.");
console.log(JSON.stringify({ account: account.address, deployment_tx: deployed, contract_address: address, create_org_tx: createOrgHash, org }, null, 2));
