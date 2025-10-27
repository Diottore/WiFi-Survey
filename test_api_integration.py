#!/usr/bin/env python3
"""
Integration tests for API endpoints with validation.
Tests the Flask routes with various input scenarios.
"""

import unittest
import json

try:
    from app import app
    FLASK_AVAILABLE = True
except ImportError:
    FLASK_AVAILABLE = False
    app = None


# Base test class with common setup
class BaseAPITest(unittest.TestCase):
    """Base test class with common setUp method."""
    
    def setUp(self):
        """Set up test client."""
        if not FLASK_AVAILABLE:
            self.skipTest("Flask not available - run 'make install' first")
        self.app = app
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()


class TestRunPointEndpoint(BaseAPITest):
    """Test /run_point endpoint validation."""
    
    def test_run_point_valid_request(self):
        """Test with valid run_point request."""
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
        self.assertTrue(data.get('ok'))
        self.assertIn('task_id', data)
    
    def test_run_point_empty_device(self):
        """Test with empty device name."""
        response = self.client.post(
            '/run_point',
            data=json.dumps({
                'device': '',
                'point': 'P1',
                'run': 1
            }),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertFalse(data.get('ok'))
        self.assertIn('error', data)
        self.assertEqual(data.get('field'), 'device')
    
    def test_run_point_empty_point(self):
        """Test with empty point ID."""
        response = self.client.post(
            '/run_point',
            data=json.dumps({
                'device': 'phone',
                'point': '',
                'run': 1
            }),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertFalse(data.get('ok'))
        self.assertIn('error', data)
        self.assertEqual(data.get('field'), 'point')
    
    def test_run_point_invalid_run_index(self):
        """Test with invalid run index."""
        response = self.client.post(
            '/run_point',
            data=json.dumps({
                'device': 'phone',
                'point': 'P1',
                'run': 0
            }),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertFalse(data.get('ok'))
        self.assertIn('error', data)
        self.assertEqual(data.get('field'), 'run')
    
    def test_run_point_invalid_duration(self):
        """Test with invalid duration."""
        response = self.client.post(
            '/run_point',
            data=json.dumps({
                'device': 'phone',
                'point': 'P1',
                'run': 1,
                'duration': 400
            }),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertFalse(data.get('ok'))
        self.assertIn('error', data)
        self.assertEqual(data.get('field'), 'duration')
    
    def test_run_point_invalid_parallel(self):
        """Test with invalid parallel streams."""
        response = self.client.post(
            '/run_point',
            data=json.dumps({
                'device': 'phone',
                'point': 'P1',
                'run': 1,
                'parallel': 20
            }),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertFalse(data.get('ok'))
        self.assertIn('error', data)
        self.assertEqual(data.get('field'), 'parallel')


class TestStartSurveyEndpoint(BaseAPITest):
    """Test /start_survey endpoint validation."""
    
    def test_start_survey_valid_request(self):
        """Test with valid start_survey request."""
        response = self.client.post(
            '/start_survey',
            data=json.dumps({
                'device': 'test_phone',
                'points': ['P1', 'P2', 'P3'],
                'repeats': 1
            }),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data.get('ok'))
        self.assertIn('task_id', data)
    
    def test_start_survey_valid_string_points(self):
        """Test with points as string."""
        response = self.client.post(
            '/start_survey',
            data=json.dumps({
                'device': 'test_phone',
                'points': 'P1 P2 P3',
                'repeats': 1
            }),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data.get('ok'))
    
    def test_start_survey_empty_device(self):
        """Test with empty device name."""
        response = self.client.post(
            '/start_survey',
            data=json.dumps({
                'device': '',
                'points': ['P1'],
                'repeats': 1
            }),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertFalse(data.get('ok'))
        self.assertIn('error', data)
        self.assertEqual(data.get('field'), 'device')
    
    def test_start_survey_empty_points(self):
        """Test with empty points list."""
        response = self.client.post(
            '/start_survey',
            data=json.dumps({
                'device': 'phone',
                'points': [],
                'repeats': 1
            }),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertFalse(data.get('ok'))
        self.assertIn('error', data)
        self.assertEqual(data.get('field'), 'points')
    
    def test_start_survey_invalid_repeats(self):
        """Test with invalid repeats."""
        response = self.client.post(
            '/start_survey',
            data=json.dumps({
                'device': 'phone',
                'points': ['P1'],
                'repeats': 0
            }),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertFalse(data.get('ok'))
        self.assertIn('error', data)
        self.assertEqual(data.get('field'), 'repeats')
    
    def test_start_survey_invalid_point_in_list(self):
        """Test with invalid point in list."""
        response = self.client.post(
            '/start_survey',
            data=json.dumps({
                'device': 'phone',
                'points': ['P1', '', 'P3'],
                'repeats': 1
            }),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertFalse(data.get('ok'))
        self.assertIn('error', data)
        self.assertEqual(data.get('field'), 'points')


class TestHealthEndpoint(BaseAPITest):
    """Test /_health endpoint."""
    
    def test_health_check(self):
        """Test health check endpoint."""
        response = self.client.get('/_health')
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIn('status', data)
        self.assertIn('checks', data)
        self.assertIn('timestamp', data)


class TestConfigEndpoint(BaseAPITest):
    """Test /_survey_config endpoint."""
    
    def test_survey_config(self):
        """Test survey config endpoint."""
        response = self.client.get('/_survey_config')
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIn('IPERF_DURATION', data)
        self.assertIn('IPERF_PARALLEL', data)
        self.assertIn('SERVER_IP', data)


if __name__ == "__main__":
    unittest.main()
