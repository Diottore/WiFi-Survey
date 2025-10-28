#!/usr/bin/env python3
"""
Test to verify that upload and download tests run in both quick and survey modes.

This test verifies the fix for the issue where the server connectivity check
was causing an early return that prevented ping, download, and upload tests
from executing.
"""

import unittest
import json
import time

try:
    from app import app, tasks, tasks_lock, worker_run_point
    FLASK_AVAILABLE = True
except ImportError:
    FLASK_AVAILABLE = False
    app = None


class TestUploadDownloadFix(unittest.TestCase):
    """Test that upload and download tests run after connectivity check fix."""
    
    def setUp(self):
        """Set up test client."""
        if not FLASK_AVAILABLE:
            self.skipTest("Flask not available - run 'make install' first")
        self.app = app
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()
    
    def test_quick_mode_runs_all_tests(self):
        """Test that quick mode runs ping, download, and upload tests."""
        import uuid
        
        # Run a quick test directly
        task_id = str(uuid.uuid4())
        worker_run_point(task_id, "test_device", "P1", 1, duration=3, parallel=2)
        
        # Check that all tests started
        with tasks_lock:
            task = tasks.get(task_id)
            self.assertIsNotNone(task)
            
            logs = task.get('logs', [])
            
            # Verify ping test started
            has_ping = any('ping test' in log.lower() for log in logs)
            self.assertTrue(has_ping, "Ping test should have started")
            
            # Verify download test started
            has_download = any('download test' in log.lower() for log in logs)
            self.assertTrue(has_download, "Download test should have started")
            
            # Verify upload test started
            has_upload = any('upload test' in log.lower() for log in logs)
            self.assertTrue(has_upload, "Upload test should have started")
            
            # Verify task completed (not aborted by connectivity check)
            self.assertEqual(task.get('status'), 'finished')
    
    def test_survey_mode_runs_all_tests(self):
        """Test that survey mode runs ping, download, and upload tests for each point."""
        # Start a survey
        response = self.client.post(
            '/start_survey',
            data=json.dumps({
                'device': 'test_phone',
                'points': ['P1'],
                'repeats': 1,
                'manual': False
            }),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data.get('ok'))
        parent_task_id = data['task_id']
        
        # Wait for survey to start and create child task
        time.sleep(8)
        
        # Find child task and verify tests ran
        with tasks_lock:
            # Look for child tasks (created by survey_worker)
            child_task = None
            for task_id in tasks.keys():
                if task_id != parent_task_id:
                    child_task = tasks.get(task_id)
                    break
            
            self.assertIsNotNone(child_task, "Survey should create child task for point measurement")
            
            logs = child_task.get('logs', [])
            
            # Verify all three tests started in the child task
            has_ping = any('ping test' in log.lower() for log in logs)
            self.assertTrue(has_ping, "Ping test should have started in survey child task")
            
            has_download = any('download test' in log.lower() for log in logs)
            self.assertTrue(has_download, "Download test should have started in survey child task")
            
            has_upload = any('upload test' in log.lower() for log in logs)
            self.assertTrue(has_upload, "Upload test should have started in survey child task")
    
    def test_connectivity_check_does_not_abort(self):
        """Test that failed connectivity check logs warning but doesn't abort tests."""
        import uuid
        
        task_id = str(uuid.uuid4())
        worker_run_point(task_id, "test_device", "P1", 1, duration=3, parallel=2)
        
        with tasks_lock:
            task = tasks.get(task_id)
            self.assertIsNotNone(task)
            
            logs = task.get('logs', [])
            
            # Should have warning about server not reachable
            has_warning = any('advertencia' in log.lower() and 'servidor' in log.lower() for log in logs)
            self.assertTrue(has_warning, "Should log warning about server connectivity")
            
            # But task should still finish, not error out
            self.assertEqual(task.get('status'), 'finished')
            
            # And tests should have run
            has_download = any('download test' in log.lower() for log in logs)
            has_upload = any('upload test' in log.lower() for log in logs)
            self.assertTrue(has_download and has_upload, "Tests should run despite connectivity warning")


if __name__ == "__main__":
    unittest.main()
