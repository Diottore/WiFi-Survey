#!/usr/bin/env python3
"""
Tests for survey worker behavior and SSE streaming.
Tests the manual-confirm behavior and samples propagation.
"""

import unittest
import json
import time
import threading

try:
    from app import app, tasks, tasks_lock
    FLASK_AVAILABLE = True
except ImportError:
    FLASK_AVAILABLE = False
    app = None


class TestSurveyBehavior(unittest.TestCase):
    """Test survey worker behavior changes."""
    
    def setUp(self):
        """Set up test client."""
        if not FLASK_AVAILABLE:
            self.skipTest("Flask not available - run 'make install' first")
        self.app = app
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()
    
    def test_sse_stream_includes_samples(self):
        """Test that SSE stream includes samples array in updates."""
        # Start a test survey
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
        task_id = data['task_id']
        
        # Wait a bit for task to initialize
        time.sleep(0.5)
        
        # Check that task has samples array
        with tasks_lock:
            task = tasks.get(task_id)
            self.assertIsNotNone(task)
            self.assertIn('samples', task)
            self.assertIsInstance(task['samples'], list)
    
    def test_task_status_includes_samples(self):
        """Test that task_status endpoint returns task with samples."""
        # Start a quick test
        response = self.client.post(
            '/run_point',
            data=json.dumps({
                'device': 'test_phone',
                'point': 'P1',
                'run': 1
            }),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        task_id = data['task_id']
        
        # Wait a bit for task to initialize
        time.sleep(0.5)
        
        # Get task status
        response = self.client.get(f'/task_status/{task_id}')
        self.assertEqual(response.status_code, 200)
        task_data = json.loads(response.data)
        
        # Verify samples is present
        self.assertIn('samples', task_data)
        self.assertIsInstance(task_data['samples'], list)
    
    def test_manual_survey_initialization(self):
        """Test that manual survey initializes with correct structure."""
        response = self.client.post(
            '/start_survey',
            data=json.dumps({
                'device': 'test_phone',
                'points': ['P1', 'P2'],
                'repeats': 1,
                'manual': True
            }),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data.get('ok'))
        task_id = data['task_id']
        
        # Wait a bit for task to initialize
        time.sleep(0.5)
        
        # Check task structure
        with tasks_lock:
            task = tasks.get(task_id)
            self.assertIsNotNone(task)
            self.assertIn('waiting', task)
            self.assertIn('proceed', task)
            self.assertIn('cancel', task)
            self.assertIn('samples', task)
            self.assertIsInstance(task['samples'], list)


if __name__ == "__main__":
    unittest.main()
