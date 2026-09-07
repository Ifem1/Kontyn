import { ExecutionResult, TransactionStatus, transactionResultNumberToName } from "genlayer-js/types";

export function receiptField(receipt, camel, snake) {
  return receipt?.[camel] ?? receipt?.[snake];
}

export function isKontynTxSuccessful(receipt) {
  const directExecution = receiptField(receipt, "txExecutionResultName", "tx_execution_result_name");
  const leaderReceipts = receipt?.consensus_data?.leader_receipt;
  const studioReceipts = Array.isArray(leaderReceipts) ? leaderReceipts : leaderReceipts ? [leaderReceipts] : [];
  const leaderReceipt = studioReceipts.find((item) => item?.mode === "leader") ?? studioReceipts[0];
  const studioExecution = leaderReceipt?.execution_result === "SUCCESS" && leaderReceipt?.result?.status === "return" && !leaderReceipt?.genvm_result?.raw_error && !leaderReceipt?.genvm_result?.error_code
    ? ExecutionResult.FINISHED_WITH_RETURN
    : undefined;
  const resultName = receiptField(receipt, "resultName", "result_name") ?? transactionResultNumberToName?.[String(receipt?.result)];
  return (
    receiptField(receipt, "statusName", "status_name") === TransactionStatus.FINALIZED &&
    resultName === "MAJORITY_AGREE" &&
    (directExecution ?? studioExecution) === ExecutionResult.FINISHED_WITH_RETURN
  );
}

export function assertKontynTxSuccessful(receipt, hash = "transaction") {
  if (isKontynTxSuccessful(receipt)) return;
  throw new Error(
    `Transaction ${hash} did not execute successfully: status=${receiptField(receipt, "statusName", "status_name") ?? "unknown"}, consensus=${receiptField(receipt, "resultName", "result_name") ?? "unknown"}, execution=${receiptField(receipt, "txExecutionResultName", "tx_execution_result_name") ?? "missing"}`
  );
}
