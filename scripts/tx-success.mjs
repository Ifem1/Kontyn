import { ExecutionResult, TransactionStatus, transactionResultNumberToName } from "genlayer-js/types";

export function receiptField(receipt, camel, snake) {
  return receipt?.[camel] ?? receipt?.[snake];
}

export function isKontynTxSuccessful(receipt) {
  const directExecution = receiptField(receipt, "txExecutionResultName", "tx_execution_result_name");
  const resultName = receiptField(receipt, "resultName", "result_name") ?? transactionResultNumberToName?.[String(receipt?.result)];
  return (
    receiptField(receipt, "statusName", "status_name") === TransactionStatus.FINALIZED &&
    resultName === "MAJORITY_AGREE" &&
    directExecution === ExecutionResult.FINISHED_WITH_RETURN
  );
}

export async function resolveAuthoritativeReceipt(client, hash, receipt = {}) {
  const details = await client.getTransaction({ hash });
  let raw = null;
  try { const response = await fetch(process.env.GENLAYER_RPC_URL ?? "https://studio.genlayer.com/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "gen_getTransactionReceipt", params: [hash] }) }); if (response.ok) raw = (await response.json()).result ?? null; } catch {}
  const execution = raw?.txExecutionResultName ?? raw?.txExecutionResult ?? details.txExecutionResultName ?? details.tx_execution_result_name;
  return { ...receipt, ...details, txExecutionResultName: typeof execution === "number" ? (execution === 1 ? ExecutionResult.FINISHED_WITH_RETURN : execution === 2 ? ExecutionResult.FINISHED_WITH_ERROR : String(execution)) : execution };
}

export function assertKontynTxSuccessful(receipt, hash = "transaction") {
  if (isKontynTxSuccessful(receipt)) return;
  throw new Error(
    `Transaction ${hash} did not execute successfully: status=${receiptField(receipt, "statusName", "status_name") ?? "unknown"}, consensus=${receiptField(receipt, "resultName", "result_name") ?? "unknown"}, execution=${receiptField(receipt, "txExecutionResultName", "tx_execution_result_name") ?? "missing"}`
  );
}
