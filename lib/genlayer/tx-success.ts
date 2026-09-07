import { ExecutionResult, TransactionStatus, transactionResultNumberToName } from "genlayer-js/types";

type ReceiptLike = {
  statusName?: string;
  status_name?: string;
  resultName?: string;
  result_name?: string;
  txExecutionResultName?: string;
  tx_execution_result_name?: string;
  result?: string | number;
};

const field = (receipt: ReceiptLike, camel: keyof ReceiptLike, snake: keyof ReceiptLike) => receipt[camel] ?? receipt[snake];

export function isKontynTxSuccessful(receipt: ReceiptLike): boolean {
  const resultName = field(receipt, "resultName", "result_name") ?? (transactionResultNumberToName as Record<string, string>)[String(receipt.result)];
  return field(receipt, "statusName", "status_name") === TransactionStatus.FINALIZED &&
    resultName === "MAJORITY_AGREE" &&
    field(receipt, "txExecutionResultName", "tx_execution_result_name") === ExecutionResult.FINISHED_WITH_RETURN;
}

export function assertKontynTxSuccessful(receipt: ReceiptLike, hash = "transaction"): void {
  if (isKontynTxSuccessful(receipt)) return;
  throw new Error(`Transaction ${hash} did not execute successfully: status=${field(receipt, "statusName", "status_name") ?? "unknown"}, consensus=${field(receipt, "resultName", "result_name") ?? "unknown"}, execution=${field(receipt, "txExecutionResultName", "tx_execution_result_name") ?? "missing"}`);
}
