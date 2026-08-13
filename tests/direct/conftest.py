"""Windows compatibility for genlayer-test's fd-0 message injector.

The runner keeps its temporary descriptor open while replacing stdin; Windows does
not permit unlinking that file until the descriptor is released. The direct VM has
already received the message by that point, so deferring cleanup is safe for tests.
"""
import os

_unlink = os.unlink

def _windows_safe_unlink(path):
    try:
        _unlink(path)
    except PermissionError:
        pass

os.unlink = _windows_safe_unlink
