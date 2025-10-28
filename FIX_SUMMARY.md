# Fix Summary: Upload and Download Tests Not Running

## Problem
Upload and download tests were not executing in both quick and survey modes.

## Root Cause
The server connectivity pre-check in `worker_run_point()` (lines 159-172 in app.py) was causing an early return when the server ping failed. This prevented all subsequent tests (ping thread, download, upload) from executing.

## Solution
Modified the connectivity check to log a warning instead of aborting:
- Removed the early `return` statement on line 172
- Changed error status to warning message
- Changed `logger.error` to `logger.warning`
- Changed "Error" messages to "Advertencia" (Warning) messages
- Tests now proceed and fail gracefully if server is unreachable

## Code Changes

### app.py (lines 159-174)
**Before:**
```python
if ping_check.returncode != 0:
    with tasks_lock:
        tasks[task_id]["status"] = "error"
        tasks[task_id]["logs"].append(f"Error: No se puede alcanzar el servidor {SERVER_IP}")
        tasks[task_id]["seq"] = tasks[task_id].get("seq", 0) + 1
    logger.error(f"Server {SERVER_IP} is not reachable")
    return  # <-- This was preventing tests from running!
```

**After:**
```python
if ping_check.returncode != 0:
    with tasks_lock:
        tasks[task_id]["logs"].append(f"Advertencia: No se puede alcanzar el servidor {SERVER_IP}, continuando con pruebas...")
        tasks[task_id]["seq"] = tasks[task_id].get("seq", 0) + 1
    logger.warning(f"Server {SERVER_IP} is not reachable, continuing with tests")
# No early return - tests continue!
```

## Verification

### New Tests Added (test_upload_download_fix.py)
1. `test_quick_mode_runs_all_tests` - Verifies quick mode runs ping, download, and upload
2. `test_survey_mode_runs_all_tests` - Verifies survey mode runs all tests for each point
3. `test_connectivity_check_does_not_abort` - Verifies warning is logged but tests continue

### Test Results
- ✅ All 58 unit tests pass (38 validation + 14 integration + 3 survey behavior + 3 new)
- ✅ Syntax checks pass
- ✅ Quick mode now runs: ping, download, and upload tests
- ✅ Survey mode now runs: ping, download, and upload tests for each point
- ✅ Tests fail gracefully when iperf3/server unavailable (expected behavior)

## Impact
- **Quick mode**: Upload and download tests now run even when server is initially unreachable
- **Survey mode**: Upload and download tests now run for each point in the survey
- **User experience**: Tests proceed as expected, failing gracefully if server is truly unreachable
- **Backward compatibility**: All existing tests still pass, no breaking changes

## Files Modified
1. `app.py` - Modified server connectivity check (4 lines changed, 2 removed)
2. `test_upload_download_fix.py` - Added (new file, 135 lines)

## Rationale
The purpose of a WiFi survey is to test connectivity. If the server is not reachable at the moment of the connectivity check, that doesn't mean the tests shouldn't run - it means we need to measure what the actual connectivity is. The ping, download, and upload tests will show the real connectivity status.
