import assert from "node:assert/strict";
import test from "node:test";
import { isKontynTxSuccessful } from "../scripts/tx-success.mjs";

const finalized = "FINALIZED";
const ok = "MAJORITY_AGREE";
const ret = "FINISHED_WITH_RETURN";

test("Kontyn transaction success predicate is strict", () => {
  assert.equal(isKontynTxSuccessful({ statusName: finalized, resultName: ok, txExecutionResultName: ret }), true);
  assert.equal(isKontynTxSuccessful({ statusName: finalized, result: 6, consensus_data: { leader_receipt: [{ mode: "leader", execution_result: "SUCCESS", result: { status: "return" }, genvm_result: {} }] } }), false);
  assert.equal(isKontynTxSuccessful({ statusName: finalized, resultName: ok }), false);
  assert.equal(isKontynTxSuccessful({ statusName: finalized, result: 6 }), false);
  assert.equal(isKontynTxSuccessful({ statusName: finalized, result: 6, consensus_data: { leader_receipt: [{ mode: "leader", execution_result: "ERROR", result: { status: "rollback" }, genvm_result: { raw_error: "boom" } }] } }), false);
  assert.equal(isKontynTxSuccessful({ statusName: finalized, resultName: ok, txExecutionResultName: "FINISHED_WITH_ERROR" }), false);
  assert.equal(isKontynTxSuccessful({ statusName: finalized, resultName: "MAJORITY_DISAGREE", txExecutionResultName: ret }), false);
  assert.equal(isKontynTxSuccessful({ statusName: finalized, resultName: "UNDETERMINED", txExecutionResultName: ret }), false);
  assert.equal(isKontynTxSuccessful({ statusName: "ACCEPTED", resultName: ok, txExecutionResultName: ret }), false);
});
