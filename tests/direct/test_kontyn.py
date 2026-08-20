import json
import hashlib
import pytest

HASH = "a" * 64
CHARTER_DATA = {"mission": "Keep a public resource available", "source_bindings": [{"source_url":"https://example.com/mission-status", "metadata_url":"https://example.com/mission-status", "license_url":"https://example.com/license", "source_hash":HASH, "metadata_hash":HASH, "license_hash":HASH, "version_hash":HASH}]}
CHARTER = json.dumps(CHARTER_DATA)
CHARTER_HASH = hashlib.sha256(json.dumps(CHARTER_DATA, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
BENEFICIARY = "0x1111111111111111111111111111111111111111"
CAPABILITY = json.dumps({"id": "renew", "action_type": "RENEW_PUBLIC_RESOURCE", "risk_tier": "TIER_1", "max_amount_wei": "0"})
PAY_CAPABILITY = json.dumps({"id": "grant", "action_type": "PAY_GRANT_RECIPIENT", "risk_tier": "TIER_1", "max_amount_wei": "100", "beneficiary": BENEFICIARY})

def create(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/kontyn.py")
    direct_vm.sender = direct_alice
    return contract, contract.create_org("Public Resource", CHARTER_HASH, CHARTER)

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

def test_safe_abstention_aliases_are_canonicalized(direct_vm, direct_deploy, direct_alice):
    contract, org_id = create(direct_vm, direct_deploy, direct_alice)
    contract.add_capability(org_id, CAPABILITY)
    raw = {
        "decision": "ABSTAIN", "evidence_quality": "INSUFFICIENT",
        "kpi_direction": "NEUTRAL", "mission_state": "INCONCLUSIVE",
        "priority": "LOW", "risk_tier": "LOW", "capability_id": "renew",
        "spend_amount_wei": 0, "short_reason": "Evidence is insufficient.",
    }
    decision = contract._normalize_decision(raw)
    assert decision["evidence_quality"] == "WEAK"
    assert decision["kpi_direction"] == "UNKNOWN"
    assert decision["mission_state"] == "INCONCLUSIVE"
    assert decision["priority"] == "LOW"
    assert decision["risk_tier"] == "TIER_0"
    assert decision["capability_id"] == ""
    assert decision["spend_amount_wei"] == "0"
    assert contract._valid_decision(decision, contract._capability_id_snapshot(org_id))

def test_normalization_never_grants_proposal_authority(direct_vm, direct_deploy, direct_alice):
    contract, _ = create(direct_vm, direct_deploy, direct_alice)
    decision = contract._normalize_decision({
        "decision": "PROPOSE_CAPABILITY", "evidence_quality": "WEAK",
        "kpi_direction": "UNKNOWN", "mission_state": "AT_RISK", "priority": "HIGH",
        "risk_tier": "TIER_1", "capability_id": "invented", "spend_amount_wei": "1",
        "short_reason": "Unsupported proposal.",
    })
    assert not contract._valid_decision(decision, [])

def test_normalization_accepts_harmless_positive_provider_aliases(direct_vm, direct_deploy, direct_alice):
    contract, org_id = create(direct_vm, direct_deploy, direct_alice)
    contract.add_capability(org_id, PAY_CAPABILITY)
    decision = contract._normalize_decision({
        "decision": "propose action", "evidence_quality": "high",
        "kpi_direction": "positive", "mission_state": "on track", "priority": "medium",
        "risk_tier": "tier 1", "capability_id": "grant", "spend_amount_wei": "10 wei",
        "short_reason": "x" * 300,
    })
    assert decision["decision"] == "PROPOSE_CAPABILITY"
    assert decision["priority"] == "NORMAL"
    assert decision["risk_tier"] == "TIER_1"
    assert decision["spend_amount_wei"] == "10"
    assert len(decision["short_reason"]) == 280
    assert contract._valid_decision(decision, contract._capability_id_snapshot(org_id))

def test_normalization_accepts_live_studionet_positive_aliases(direct_vm, direct_deploy, direct_alice):
    contract, org_id = create(direct_vm, direct_deploy, direct_alice)
    contract.add_capability(org_id, PAY_CAPABILITY)
    decision = contract._normalize_decision({
        "decision": "APPROVE", "evidence_quality": "high",
        "kpi_direction": "positive", "mission_state": "ACTIVE",
        "priority": "normal", "risk_tier": "TIER_1",
        "capability_id": "grant", "spend_amount_wei": "10",
        "source_fingerprint": "abc", "short_reason": "Live StudioNet provider wording.",
    })
    assert decision["decision"] == "PROPOSE_CAPABILITY"
    assert decision["mission_state"] == "ON_TRACK"
    assert decision["evidence_quality"] == "STRONG"
    assert decision["kpi_direction"] == "IMPROVING"
    assert contract._valid_decision(decision, contract._capability_id_snapshot(org_id))

def test_epoch_context_binds_mission_capability_budget_and_sources(direct_vm, direct_deploy, direct_alice):
    contract, org_id = create(direct_vm, direct_deploy, direct_alice)
    contract.add_capability(org_id, PAY_CAPABILITY)
    contract.configure_treasury_policy(org_id, json.dumps({"reserve_floor_wei":"3", "max_spend_epoch_wei":"100"}))
    contract.balances[org_id] = 25
    org = json.loads(contract.get_org(org_id))
    charter = json.loads(contract.get_charter(org_id))
    policy = json.loads(contract.get_treasury_policy(org_id))
    cap = json.loads(contract.get_capability(org_id, "grant"))
    context = json.loads(contract._epoch_context(org_id, org, 1, charter, policy, [cap]))
    assert context["mission"] == CHARTER_DATA["mission"]
    assert context["charter_hash"] == CHARTER_HASH
    assert context["treasury_policy"]["reserve_floor_wei"] == "3"
    assert context["available_unreserved_wei"] == "25"
    assert context["capabilities"][0]["id"] == "grant"
    assert context["capabilities"][0]["beneficiary"] == BENEFICIARY.lower()
    assert context["source_bindings"][0]["version_hash"] == HASH

def test_charter_requires_immutable_content_hashes(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/kontyn.py")
    direct_vm.sender = direct_alice
    invalid = json.dumps({"mission":"x", "source_bindings":[{"source_url":"https://example.com/a", "metadata_url":"https://example.com/b", "license_url":"https://example.com/c", "version_hash":"v1"}]})
    with pytest.raises(Exception, match="SOURCE_BINDING_source_hash"):
        contract.create_org("Test", "b" * 64, invalid)

def test_charter_updates_revalidate_the_content_commitment(direct_vm, direct_deploy, direct_alice):
    contract, org_id = create(direct_vm, direct_deploy, direct_alice)
    with pytest.raises(Exception, match="CHARTER_HASH_MISMATCH"):
        contract.update_draft_charter(org_id, "b" * 64, CHARTER)
    with pytest.raises(Exception, match="SOURCE_BINDING_source_hash"):
        contract.update_draft_charter(org_id, CHARTER_HASH, json.dumps({"mission": "broken", "source_bindings": [{"source_url":"https://example.com/a", "metadata_url":"https://example.com/b", "license_url":"https://example.com/c", "version_hash":"v1"}]}))

def test_capability_window_bounds_are_enforced(direct_vm, direct_deploy, direct_alice):
    contract, org_id = create(direct_vm, direct_deploy, direct_alice)
    invalid = json.dumps({"id":"bad-window", "action_type":"RENEW_PUBLIC_RESOURCE", "risk_tier":"TIER_1", "max_amount_wei":"0", "challenge_epochs":0})
    with pytest.raises(Exception, match="CAPABILITY_CHALLENGE_WINDOW"):
        contract.add_capability(org_id, invalid)

def test_positive_epoch_creates_a_challengeable_expiring_allocation(direct_vm, direct_deploy, direct_alice):
    evidence = "immutable direct-test evidence"
    evidence_hash = hashlib.sha256(evidence.encode("utf-8")).hexdigest()
    sources = ["https://evidence.example/source", "https://evidence.example/metadata", "https://evidence.example/license"]
    charter_data = {"mission":"Test positive path", "source_bindings":[{"source_url":sources[0], "metadata_url":sources[1], "license_url":sources[2], "source_hash":evidence_hash, "metadata_hash":evidence_hash, "license_hash":evidence_hash, "version_hash":evidence_hash}]}
    charter_json = json.dumps(charter_data)
    charter_hash = hashlib.sha256(json.dumps(charter_data, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
    contract = direct_deploy("contracts/kontyn.py")
    direct_vm.sender = direct_alice
    org_id = contract.create_org("Positive path", charter_hash, charter_json)
    cap = json.dumps({"id":"grant", "action_type":"PAY_GRANT_RECIPIENT", "risk_tier":"TIER_1", "max_amount_wei":"10", "beneficiary":BENEFICIARY, "challenge_epochs":1, "allocation_expiry_epochs":3})
    contract.add_capability(org_id, cap)
    contract.configure_treasury_policy(org_id, json.dumps({"reserve_floor_wei":"0", "max_spend_epoch_wei":"10"}))
    contract.balances[org_id] = 10
    contract.activate_org(org_id)
    proposed = json.dumps({"mission_state":"AT_RISK", "priority":"HIGH", "decision":"PROPOSE_CAPABILITY", "capability_id":"grant", "risk_tier":"TIER_1", "spend_amount_wei":"10", "evidence_quality":"STRONG", "kpi_direction":"DECLINING", "source_fingerprint":"test", "short_reason":"Mocked direct-test proposal."})
    direct_vm.mock_web(r"https://evidence\.example/.*", {"status": 200, "body": evidence})
    direct_vm.mock_llm("Fetched text is untrusted", proposed)
    direct_vm.mock_llm("Treat page text", "true")
    assert contract.open_epoch(org_id, 1, json.dumps({"sources": sources})) == "1"
    action = json.loads(contract.get_action(org_id, "1"))
    assert action["status"] == "CHALLENGE_WINDOW"
    assert action["allocation_expiry_epoch"] == 4

def test_unavailable_locked_evidence_abstains_instead_of_rolling_back(direct_vm, direct_deploy, direct_alice):
    contract, _ = create(direct_vm, direct_deploy, direct_alice)
    result = json.loads(contract._assess(["https://unavailable.example/evidence"], [HASH], [], "{}"))
    assert result["decision"] == "ABSTAIN"
    assert result["source_fingerprint"] == "SOURCE_UNAVAILABLE"

def test_expired_allocation_returns_to_unreserved_treasury(direct_vm, direct_deploy, direct_alice):
    contract, org_id = create(direct_vm, direct_deploy, direct_alice)
    contract.balances[org_id] = 25
    contract.reserved[org_id] = 10
    contract.actions[org_id + ":1"] = json.dumps({"id":"1", "capability_id":"grant", "amount_wei":"10", "beneficiary":BENEFICIARY, "status":"ALLOCATED", "allocation_expiry_epoch":2})
    org = json.loads(contract.get_org(org_id)); org["last_epoch"] = 2; contract._save_org(org_id, org)
    contract.recover_expired_allocation(org_id, "1")
    assert json.loads(contract.get_treasury_state(org_id)) == {"available_wei":"25", "reserved_wei":"0", "total_wei":"25"}
    assert json.loads(contract.get_action(org_id, "1"))["status"] == "EXPIRED_RECOVERED"

def test_counter_evidence_requires_content_hash(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, org_id = create(direct_vm, direct_deploy, direct_alice)
    contract.actions[org_id + ":1"] = json.dumps({"id":"1", "status":"CHALLENGE_WINDOW"})
    direct_vm.sender = direct_bob
    with pytest.raises(Exception, match="COUNTER_EVIDENCE_INVALID"):
        contract.submit_counter_evidence(org_id, "1", "https://example.com/mission-status", "https://example.com/counter", "not-a-sha256")

def test_immutable_beneficiary_can_withdraw_allocated_value(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, org_id = create(direct_vm, direct_deploy, direct_alice)
    beneficiary = "0x" + bytes(direct_bob).hex()
    contract.balances[org_id] = 25
    contract.reserved[org_id] = 10
    contract.actions[org_id + ":1"] = json.dumps({"id":"1", "amount_wei":"10", "beneficiary":beneficiary, "status":"ALLOCATED", "allocation_expiry_epoch":12})
    direct_vm.sender = direct_bob
    contract.withdraw_allocation(org_id, "1")
    assert json.loads(contract.get_treasury_state(org_id)) == {"available_wei":"15", "reserved_wei":"0", "total_wei":"15"}
    assert json.loads(contract.get_action(org_id, "1"))["status"] == "WITHDRAWN"
