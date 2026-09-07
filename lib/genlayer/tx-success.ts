import { ExecutionResult, TransactionStatus, transactionResultNumberToName } from "genlayer-js/types";

type ReceiptLike = {
  statusName?: string;
  status_name?: string;
  resultName?: string;
  result_name?: string;
  txExecutionResultName?: string;
  tx_execution_result_name?: string;
  result?: string | number;
  consensus_data?: { leader_receipt?: Array<{ mode?: string; execution_result?: string; result?: { status?: string }; genvm_result?: { raw_error?: unknown; error_code?: unknown } }> | { mode?: string; execution_result?: string; result?: { status?: string }; genvm_result?: { raw_error?: unknown; error_code?: unknown } } };
};

const field = (receipt: ReceiptLike, camel: keyof ReceiptLike, snake: keyof ReceiptLike) => receipt[camel] ?? receipt[snake];

export function isKontynTxSuccessful(receipt: ReceiptLike): boolean {
  const leaderReceipts = receipt.consensus_data?.leader_receipt;
  const studioReceipts = Array.isArray(leaderReceipts) ? leaderReceipts : leaderReceipts ? [leaderReceipts] : [];
  const leaderReceipt = studioReceipts.find((item) => item.mode === "leader") ?? studioReceipts[0];
  const studioExecution = leaderReceipt?.execution_result === "SUCCESS" && leaderReceipt?.result?.status === "return" && !leaderReceipt?.genvm_result?.raw_error && !leaderReceipt?.genvm_result?.error_code
    ? ExecutionResult.FINISHED_WITH_RETURN
    : undefined;
  const resultName = field(receipt, "resultName", "result_name") ?? (transactionResultNumberToName as Record<string, string>)[String(receipt.result)];
  return field(receipt, "statusName", "status_name") === TransactionStatus.FINALIZED &&
    resultName === "MAJORITY_AGREE" &&
    (field(receipt, "txExecutionResultName", "tx_execution_result_name") ?? studioExecution) === ExecutionResult.FINISHED_WITH_RETURN;
}

export function assertKontynTxSuccessful(receipt: ReceiptLike, hash = "transaction"): void {
  if (isKontynTxSuccessful(receipt)) return;
  throw new Error(`Transaction ${hash} did not execute successfully: status=${field(receipt, "statusName", "status_name") ?? "unknown"}, consensus=${field(receipt, "resultName", "result_name") ?? "unknown"}, execution=${field(receipt, "txExecutionResultName", "tx_execution_result_name") ?? "missing"}`);
}
