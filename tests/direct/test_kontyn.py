import json
import pytest

CHARTER = json.dumps({"mission": "Keep a public resource available", "source_bindings": [{"source_url":"https://example.com/mission-status", "metadata_url":"https://example.com/mission-status", "license_url":"https://example.com/license", "version_hash":"source-v1-hash"}]})
BENEFICIARY = "0x1111111111111111111111111111111111111111"
CAPABILITY = json.dumps({"id": "renew", "action_type": "RENEW_PUBLIC_RESOURCE", "risk_tier": "TIER_1", "max_amount_wei": "0"})
PAY_CAPABILITY = json.dumps({"id": "grant", "action_type": "PAY_GRANT_RECIPIENT", "risk_tier": "TIER_1", "max_amount_wei": "100", "beneficiary": BENEFICIARY})

def create(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/kontyn.py")
    direct_vm.sender = direct_alice
    return contract, contract.create_org("Public Resource", "hash-12345678", CHARTER)

def test_create_and_read_org(direct_vm, direct_deploy, direct_alice):
    contract, org_id = create(direct_vm, direct_deploy, direct_alice)
    assert org_id == "1"
    assert json.loads(contract.get_org(org_id))["state"] == "DRAFT"

def test_draft_requires_founder(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, org_id = create(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = direct_bob
    with pytest.raises(Exception, match="FOUNDER_ONLY"):
        contract.configure_treasury_policy(org_id, json.dumps({"reserve_floor_wei":"0","max_spend_epoch_wei":"0"}))

def test_capability_and_activation(direct_vm, direct_deploy, direct_alice):
    contract, org_id = create(direct_vm, direct_deploy, direct_alice)
    contract.add_capability(org_id, CAPABILITY)
    contract.activate_org(org_id)
    assert json.loads(contract.get_org(org_id))["state"] == "ACTIVE"

def test_activation_requires_capability(direct_vm, direct_deploy, direct_alice):
    contract, org_id = create(direct_vm, direct_deploy, direct_alice)
    with pytest.raises(Exception, match="CAPABILITY_REQUIRED"):
        contract.activate_org(org_id)

def test_locked_draft_paths_after_activation(direct_vm, direct_deploy, direct_alice):
    contract, org_id = create(direct_vm, direct_deploy, direct_alice)
    contract.add_capability(org_id, CAPABILITY)
    contract.activate_org(org_id)
    with pytest.raises(Exception, match="DRAFT_REQUIRED"):
        contract.add_capability(org_id, CAPABILITY)

def test_safe_mode_lifecycle(direct_vm, direct_deploy, direct_alice):
    contract, org_id = create(direct_vm, direct_deploy, direct_alice)
    contract.add_capability(org_id, CAPABILITY)
    contract.activate_org(org_id)
    contract.guardian_enter_safe_mode(org_id, "reason-hash")
    assert json.loads(contract.get_org(org_id))["state"] == "SAFE_MODE"
    contract.request_safe_mode_exit(org_id)
    assert json.loads(contract.get_org(org_id))["state"] == "ACTIVE"

def test_value_capability_requires_immutable_beneficiary(direct_vm, direct_deploy, direct_alice):
    contract, org_id = create(direct_vm, direct_deploy, direct_alice)
    invalid = json.dumps({"id":"bad", "action_type":"PAY_GRANT_RECIPIENT", "risk_tier":"TIER_1", "max_amount_wei":"1"})
    with pytest.raises(Exception, match="CAPABILITY_BENEFICIARY"):
        contract.add_capability(org_id, invalid)

def test_rejected_and_canceled_actions_never_reserve_value(direct_vm, direct_deploy, direct_alice):
    contract, org_id = create(direct_vm, direct_deploy, direct_alice)
    contract.add_capability(org_id, PAY_CAPABILITY)
    contract.actions[org_id + ":1"] = json.dumps({"id":"1", "capability_id":"grant", "amount_wei":"10", "beneficiary":BENEFICIARY, "status":"RATIFICATION_REQUIRED", "policy_version":1})
    contract.ratify_action(org_id, "1", False)
    assert json.loads(contract.get_action(org_id, "1"))["status"] == "REJECTED"
    assert json.loads(contract.get_treasury_state(org_id))["reserved_wei"] == "0"
    contract.actions[org_id + ":2"] = json.dumps({"id":"2", "capability_id":"grant", "amount_wei":"10", "beneficiary":BENEFICIARY, "status":"READY", "policy_version":1})
    contract.cancel_ready_action(org_id, "2")
    assert json.loads(contract.get_action(org_id, "2"))["status"] == "CANCELED"
    assert json.loads(contract.get_treasury_state(org_id))["reserved_wei"] == "0"

def test_unfunded_action_cannot_be_reserved(direct_vm, direct_deploy, direct_alice):
    contract, org_id = create(direct_vm, direct_deploy, direct_alice)
    contract.add_capability(org_id, PAY_CAPABILITY)
    contract.activate_org(org_id)
    contract.actions[org_id + ":1"] = json.dumps({"id":"1", "capability_id":"grant", "amount_wei":"10", "beneficiary":BENEFICIARY, "status":"READY", "policy_version":1})
    with pytest.raises(Exception, match="ALLOCATION_UNFUNDED"):
        contract.execute_ready_action(org_id, "1")

def test_funding_records_available_treasury(direct_vm, direct_deploy, direct_alice):
    contract, org_id = create(direct_vm, direct_deploy, direct_alice)
    direct_vm.value = 25
    contract.fund_org(org_id)
    state = json.loads(contract.get_treasury_state(org_id))
    assert state["total_wei"] == "25"
    assert state["available_wei"] == "25"

def test_ready_action_reserves_exact_amount(direct_vm, direct_deploy, direct_alice):
    contract, org_id = create(direct_vm, direct_deploy, direct_alice)
    contract.balances[org_id] = 25
    contract.add_capability(org_id, PAY_CAPABILITY)
    contract.activate_org(org_id)
    contract.actions[org_id + ":1"] = json.dumps({"id":"1", "capability_id":"grant", "amount_wei":"10", "beneficiary":BENEFICIARY, "status":"READY", "policy_version":1})
    contract.execute_ready_action(org_id, "1")
    state = json.loads(contract.get_treasury_state(org_id))
    assert state == {"available_wei": "15", "reserved_wei": "10", "total_wei": "25"}
    assert json.loads(contract.get_action(org_id, "1"))["status"] == "ALLOCATED"
