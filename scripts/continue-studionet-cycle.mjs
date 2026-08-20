/** Continue one explicit StudioNet lifecycle step without storing any key. */
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";

const key = process.env.KONTYN_LIFECYCLE_TEST_KEY;
const step = process.env.KONTYN_LIFECYCLE_STEP;
const address = process.env.KONTYN_TEST_CONTRACT_ADDRESS;
if (!key || !step || !address) throw new Error("Set KONTYN_LIFECYCLE_TEST_KEY, KONTYN_LIFECYCLE_STEP, and KONTYN_TEST_CONTRACT_ADDRESS.");

const client = createClient({ chain: studionet, account: createAccount(key) });
const orgId = "1";
const actionId = "1";
const charter = JSON.parse(await client.readContract({ address, functionName: "get_charter", args: [orgId] }));
const manifest = JSON.stringify({ sources: charter.source_bindings.flatMap((binding) => [binding.source_url, binding.metadata_url, binding.license_url]) });
const calls = {
  open1: ["open_epoch", [orgId, 1, manifest]],
  open2: ["open_epoch", [orgId, 2, manifest]],
  finalize: ["finalize_challenge_window", [orgId, actionId]],
  reserve: ["execute_ready_action", [orgId, actionId]],
  withdraw: ["withdraw_allocation", [orgId, actionId]],
  recover_treasury: ["withdraw_unallocated_treasury", [orgId, process.env.KONTYN_RECOVERY_RECIPIENT ?? "", process.env.KONTYN_RECOVERY_AMOUNT ?? ""]],
};
const call = calls[step];
if (!call) throw new Error("Unknown lifecycle step.");
const assertSuccessful = (receipt, hash) => {
  const consensus = receipt.resultName ?? receipt.result_name;
  const execution = receipt.txExecutionResultName ?? receipt.tx_execution_result_name;
  if (consensus !== "MAJORITY_AGREE" || (execution && execution !== ExecutionResult.FINISHED_WITH_RETURN)) {
    throw new Error(`Transaction ${hash} did not execute successfully: consensus=${consensus ?? "unknown"}, execution=${execution ?? "unknown"}`);
  }
};
const hash = await client.writeContract({ address, functionName: call[0], args: call[1] });
const receipt = await client.waitForTransactionReceipt({ hash, status: TransactionStatus.FINALIZED, interval: 20000, retries: 30, fullTransaction: true });
assertSuccessful(receipt, hash);
console.log(JSON.stringify({ step, hash, status: receipt.statusName, result: receipt.resultName ?? receipt.result_name, execution: receipt.txExecutionResultName ?? receipt.tx_execution_result_name ?? null }));
