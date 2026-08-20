"""Live GenLayer regression: runs only with explicitly supplied disposable StudioNet keys."""
import os
import subprocess
import pytest

REQUIRED = ("KONTYN_TEST_FOUNDER_KEY", "KONTYN_TEST_BENEFICIARY_KEY", "KONTYN_TEST_CHALLENGER_KEY")

@pytest.mark.integration
def test_full_studionet_cycle_records_an_epoch():
    if any(not os.environ.get(name) for name in REQUIRED):
        pytest.skip("Disposable StudioNet test keys are required for this live test.")
    result = subprocess.run(["npm.cmd", "run", "cycle:studionet"], text=True, capture_output=True, timeout=1800)
    assert result.returncode == 0, result.stdout + "\n" + result.stderr
    assert '"submitted": true' in result.stdout
    assert '"value": ""' not in result.stdout
