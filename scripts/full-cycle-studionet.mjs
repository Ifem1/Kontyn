/** Full public Studionet lifecycle with caller-supplied disposable test keys.
 * Keys are read only from the process environment and are never logged or written.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { assertKontynTxSuccessful } from "./tx-success.mjs";

const founderKey = process.env.KONTYN_TEST_FOUNDER_KEY ?? generatePrivateKey();
const beneficiaryKey = process.env.KONTYN_TEST_BENEFICIARY_KEY ?? generatePrivateKey();
const challengerKey = process.env.KONTYN_TEST_CHALLENGER_KEY ?? generatePrivateKey();
const founder = createAccount(founderKey); const beneficiary = createAccount(beneficiaryKey); const challenger = createAccount(challengerKey);
const founderClient = createClient({ chain: studionet, account: founder });
const beneficiaryClient = createClient({ chain: studionet, account: beneficiary });
const challengerClient = createClient({ chain: studionet, account: challenger });
// Studio enforces both per-minute and hourly RPC limits.  Three receipt reads per
// minute keeps this verification flow well below either cap, even under finality delay.
const wait = async (client, hash) => {
  const receipt = await client.waitForTransactionReceipt({ hash, status: TransactionStatus.FINALIZED, interval: 20000, retries: 30, fullTransaction: true });
  const details = await client.getTransaction({ hash });
  return { ...receipt, ...details, statusName: details.statusName ?? receipt.statusName, status_name: details.status_name ?? receipt.status_name };
};
const assertSuccessful = assertKontynTxSuccessful;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const write = async (client, address, functionName, args, value = 0n) => {
  const hash = await client.writeContract({ address, functionName, args, value });
  console.error(JSON.stringify({ stage: functionName, hash, contract_address: address }));
  assertSuccessful(await wait(client, hash), hash);
  return hash;
};
const expectFailedWrite = async (client, address, functionName, args, code) => {
  const hash = await client.writeContract({ address, functionName, args, value: 0n });
  console.error(JSON.stringify({ stage: `${functionName}:expected-failure`, hash, contract_address: address }));
  const receipt = await wait(client, hash);
  try {
    assertSuccessful(receipt, hash);
  } catch {
    return { hash, expected: code, result: receipt.resultName ?? receipt.result_name ?? null, execution: receipt.txExecutionResultName ?? receipt.tx_execution_result_name ?? null };
  }
  throw new Error(`${functionName} unexpectedly succeeded; expected ${code}`);
};
const waitUntil = async (label, unixSeconds) => {
  while (Math.floor(Date.now() / 1000) < unixSeconds) {
    const remaining = unixSeconds - Math.floor(Date.now() / 1000);
    console.error(JSON.stringify({ stage: "wait", label, remaining_seconds: remaining }));
    await sleep(Math.min(remaining, 30) * 1000);
  }
};

const existingAddress = process.env.KONTYN_TEST_CONTRACT_ADDRESS;
let address = existingAddress;
let deployHash = "";
if (!address) {
  deployHash = await founderClient.deployContract({ code: new Uint8Array(readFileSync("contracts/kontyn.py")), args: [], value: 0n });
  const deployReceipt = await wait(founderClient, deployHash); address = deployReceipt.data?.contract_address; console.error(JSON.stringify({ stage: "deploy", hash: deployHash, contract_address: address })); assertSuccessful(deployReceipt, deployHash);
  console.error(JSON.stringify({ stage: "deploy", hash: deployHash, contract_address: address }));
}
if (!address) throw new Error("Deployment did not return an address.");
const immutableHash = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Cannot lock ${url}: HTTP ${response.status}`);
  return createHash("sha256").update(new Uint8Array(await response.arrayBuffer())).digest("hex");
};
const canonicalJson = (value) => JSON.stringify(value && typeof value === "object" && !Array.isArray(value)
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, JSON.parse(canonicalJson(value[key]))]))
  : Array.isArray(value) ? value.map((entry) => JSON.parse(canonicalJson(entry))) : value);
const sourceUrl = process.env.KONTYN_EVIDENCE_URL ?? "https://raw.githubusercontent.com/Ifem1/Kontyn/main/evidence/studionet-positive-lifecycle.txt";
const sourceHash = await immutableHash(sourceUrl);
const binding = { source_url: sourceUrl, metadata_url: sourceUrl, license_url: sourceUrl, source_hash: sourceHash, metadata_hash: sourceHash, license_hash: sourceHash, version_hash: sourceHash };
const charter = JSON.stringify({ mission: "Exercise bounded treasury lifecycle", epoch_duration_seconds: 300, source_bindings: [binding] });
const charterHash = createHash("sha256").update(canonicalJson(JSON.parse(charter))).digest("hex");
const policy = JSON.stringify({ reserve_floor_wei: "0", max_spend_epoch_wei: "10" });
const capability = JSON.stringify({ id: "test-grant", action_type: "PAY_GRANT_RECIPIENT", risk_tier: "TIER_1", max_amount_wei: "10", beneficiary: beneficiary.address, challenge_duration_seconds: 600, allocation_expiry_seconds: 300 });
const tx = {};
tx.create = await write(founderClient, address, "create_org", ["Kontyn full-cycle test", charterHash, charter]);
tx.policy = await write(founderClient, address, "configure_treasury_policy", ["1", policy]);
tx.capability = await write(founderClient, address, "add_capability", ["1", capability]);
tx.fund = await write(founderClient, address, "fund_org", ["1"], 10n);
tx.activate = await write(founderClient, address, "activate_org", ["1"]);
// Recovery branch: returned funds must be unreserved; this transfers all test value back to founder.
tx.recover = await write(founderClient, address, "withdraw_unallocated_treasury", ["1", founder.address, "10"]);
// Re-fund so the epoch has a real budget when consensus runs.
tx.refund = await write(founderClient, address, "fund_org", ["1"], 10n);
const manifest = JSON.stringify({ sources: [binding.source_url, binding.metadata_url, binding.license_url] });
tx.early_epoch = await expectFailedWrite(challengerClient, address, "open_epoch", ["1", 1, manifest], "EPOCH_NOT_DUE");
const timingBeforeEpoch = JSON.parse(await founderClient.readContract({ address, functionName: "get_timing_state", args: ["1"] }));
await waitUntil("epoch-1-due", Number(timingBeforeEpoch.next_epoch_timestamp));
let epoch = { submitted: false };
try {
  const hash = await write(challengerClient, address, "open_epoch", ["1", 1, manifest]);
  epoch = { submitted: true, hash, value: await founderClient.readContract({ address, functionName: "get_epoch", args: ["1", 1] }) };
} catch (error) { epoch = { submitted: false, error: error instanceof Error ? error.message : String(error) }; }
if (!epoch.submitted || !epoch.value) throw new Error(`Epoch was not accepted: ${epoch.error ?? "empty stored epoch"}`);
const firstEpoch = JSON.parse(epoch.value);
if (!firstEpoch.action_id) throw new Error(`Positive fixture did not create an action: ${epoch.value}`);
const actionBeforeFinalize = JSON.parse(await founderClient.readContract({ address, functionName: "get_action", args: ["1", firstEpoch.action_id] }));
tx.early_finalize = await expectFailedWrite(challengerClient, address, "finalize_challenge_window", ["1", firstEpoch.action_id], "CHALLENGE_WINDOW_OPEN");
await waitUntil("challenge-deadline", Number(actionBeforeFinalize.challenge_deadline));
tx.finalize = await write(challengerClient, address, "finalize_challenge_window", ["1", firstEpoch.action_id]);
tx.reserve = await write(challengerClient, address, "execute_ready_action", ["1", firstEpoch.action_id]);
tx.withdraw = await write(beneficiaryClient, address, "withdraw_allocation", ["1", firstEpoch.action_id]);
const beneficiaryTreasuryRead = await beneficiaryClient.readContract({ address, functionName: "get_treasury_state", args: ["1"] });
const action = await beneficiaryClient.readContract({ address, functionName: "get_action", args: ["1", firstEpoch.action_id] });
if (JSON.parse(action).status !== "WITHDRAWN") throw new Error(`Allocation was not withdrawn: ${action}`);
console.log(JSON.stringify({ contract_address: address, deploy_hash: deployHash, founder: founder.address, beneficiary: beneficiary.address, challenger: challenger.address, tx, treasury: beneficiaryTreasuryRead, epoch, action }, null, 2));
