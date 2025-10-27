#!/usr/bin/env python3
"""
Unit tests for the validation module.
Tests all validation functions and error cases.
"""

import unittest
from validation import Validator, ValidationError


class TestValidatorDeviceName(unittest.TestCase):
    """Test device name validation."""
    
    def test_valid_device_name(self):
        """Test with valid device names."""
        self.assertEqual(Validator.validate_device_name("phone"), "phone")
        self.assertEqual(Validator.validate_device_name("  phone  "), "phone")
        self.assertEqual(Validator.validate_device_name("My Phone 123"), "My Phone 123")
        self.assertEqual(Validator.validate_device_name("a" * 100), "a" * 100)
    
    def test_empty_device_name(self):
        """Test with empty device name."""
        with self.assertRaises(ValidationError) as ctx:
            Validator.validate_device_name("")
        self.assertIn("vacío", ctx.exception.message.lower())
        self.assertEqual(ctx.exception.field, "device")
    
    def test_none_device_name(self):
        """Test with None device name."""
        with self.assertRaises(ValidationError) as ctx:
            Validator.validate_device_name(None)
        self.assertIn("requerido", ctx.exception.message.lower())
    
    def test_too_long_device_name(self):
        """Test with device name exceeding max length."""
        long_name = "a" * 101
        with self.assertRaises(ValidationError) as ctx:
            Validator.validate_device_name(long_name)
        self.assertIn("largo", ctx.exception.message.lower())
        self.assertEqual(ctx.exception.field, "device")


class TestValidatorPointId(unittest.TestCase):
    """Test point ID validation."""
    
    def test_valid_point_id(self):
        """Test with valid point IDs."""
        self.assertEqual(Validator.validate_point_id("P1"), "P1")
        self.assertEqual(Validator.validate_point_id("  P1  "), "P1")
        self.assertEqual(Validator.validate_point_id("Point-123"), "Point-123")
        self.assertEqual(Validator.validate_point_id("a" * 50), "a" * 50)
    
    def test_empty_point_id(self):
        """Test with empty point ID."""
        with self.assertRaises(ValidationError) as ctx:
            Validator.validate_point_id("")
        self.assertIn("vacío", ctx.exception.message.lower())
        self.assertEqual(ctx.exception.field, "point")
    
    def test_none_point_id(self):
        """Test with None point ID."""
        with self.assertRaises(ValidationError) as ctx:
            Validator.validate_point_id(None)
        self.assertIn("requerido", ctx.exception.message.lower())
    
    def test_too_long_point_id(self):
        """Test with point ID exceeding max length."""
        long_point = "a" * 51
        with self.assertRaises(ValidationError) as ctx:
            Validator.validate_point_id(long_point)
        self.assertIn("largo", ctx.exception.message.lower())
        self.assertEqual(ctx.exception.field, "point")


class TestValidatorRunIndex(unittest.TestCase):
    """Test run index validation."""
    
    def test_valid_run_index(self):
        """Test with valid run indices."""
        self.assertEqual(Validator.validate_run_index(1), 1)
        self.assertEqual(Validator.validate_run_index(500), 500)
        self.assertEqual(Validator.validate_run_index(1000), 1000)
        self.assertEqual(Validator.validate_run_index("100"), 100)
    
    def test_run_index_too_low(self):
        """Test with run index below minimum."""
        with self.assertRaises(ValidationError) as ctx:
            Validator.validate_run_index(0)
        self.assertIn("entre", ctx.exception.message.lower())
        self.assertEqual(ctx.exception.field, "run")
    
    def test_run_index_too_high(self):
        """Test with run index above maximum."""
        with self.assertRaises(ValidationError) as ctx:
            Validator.validate_run_index(1001)
        self.assertIn("entre", ctx.exception.message.lower())
    
    def test_invalid_run_index_type(self):
        """Test with invalid run index type."""
        with self.assertRaises(ValidationError) as ctx:
            Validator.validate_run_index("abc")
        self.assertIn("entero", ctx.exception.message.lower())
        
        with self.assertRaises(ValidationError):
            Validator.validate_run_index(None)


class TestValidatorDuration(unittest.TestCase):
    """Test duration validation."""
    
    def test_valid_duration(self):
        """Test with valid durations."""
        self.assertEqual(Validator.validate_duration(1), 1)
        self.assertEqual(Validator.validate_duration(20), 20)
        self.assertEqual(Validator.validate_duration(300), 300)
        self.assertEqual(Validator.validate_duration("150"), 150)
    
    def test_duration_too_low(self):
        """Test with duration below minimum."""
        with self.assertRaises(ValidationError) as ctx:
            Validator.validate_duration(0)
        self.assertIn("entre", ctx.exception.message.lower())
        self.assertEqual(ctx.exception.field, "duration")
    
    def test_duration_too_high(self):
        """Test with duration above maximum."""
        with self.assertRaises(ValidationError) as ctx:
            Validator.validate_duration(301)
        self.assertIn("entre", ctx.exception.message.lower())
    
    def test_invalid_duration_type(self):
        """Test with invalid duration type."""
        with self.assertRaises(ValidationError) as ctx:
            Validator.validate_duration("invalid")
        self.assertIn("entero", ctx.exception.message.lower())


class TestValidatorParallelStreams(unittest.TestCase):
    """Test parallel streams validation."""
    
    def test_valid_parallel_streams(self):
        """Test with valid parallel streams."""
        self.assertEqual(Validator.validate_parallel_streams(1), 1)
        self.assertEqual(Validator.validate_parallel_streams(4), 4)
        self.assertEqual(Validator.validate_parallel_streams(16), 16)
        self.assertEqual(Validator.validate_parallel_streams("8"), 8)
    
    def test_parallel_streams_too_low(self):
        """Test with parallel streams below minimum."""
        with self.assertRaises(ValidationError) as ctx:
            Validator.validate_parallel_streams(0)
        self.assertIn("entre", ctx.exception.message.lower())
        self.assertEqual(ctx.exception.field, "parallel")
    
    def test_parallel_streams_too_high(self):
        """Test with parallel streams above maximum."""
        with self.assertRaises(ValidationError) as ctx:
            Validator.validate_parallel_streams(17)
        self.assertIn("entre", ctx.exception.message.lower())
    
    def test_invalid_parallel_streams_type(self):
        """Test with invalid parallel streams type."""
        with self.assertRaises(ValidationError) as ctx:
            Validator.validate_parallel_streams("invalid")
        self.assertIn("entero", ctx.exception.message.lower())


class TestValidatorRepeats(unittest.TestCase):
    """Test repeats validation."""
    
    def test_valid_repeats(self):
        """Test with valid repeats."""
        self.assertEqual(Validator.validate_repeats(1), 1)
        self.assertEqual(Validator.validate_repeats(50), 50)
        self.assertEqual(Validator.validate_repeats(100), 100)
        self.assertEqual(Validator.validate_repeats("25"), 25)
    
    def test_repeats_too_low(self):
        """Test with repeats below minimum."""
        with self.assertRaises(ValidationError) as ctx:
            Validator.validate_repeats(0)
        self.assertIn("entre", ctx.exception.message.lower())
        self.assertEqual(ctx.exception.field, "repeats")
    
    def test_repeats_too_high(self):
        """Test with repeats above maximum."""
        with self.assertRaises(ValidationError) as ctx:
            Validator.validate_repeats(101)
        self.assertIn("entre", ctx.exception.message.lower())
    
    def test_invalid_repeats_type(self):
        """Test with invalid repeats type."""
        with self.assertRaises(ValidationError) as ctx:
            Validator.validate_repeats("invalid")
        self.assertIn("entero", ctx.exception.message.lower())


class TestValidatorPointsList(unittest.TestCase):
    """Test points list validation."""
    
    def test_valid_points_list(self):
        """Test with valid points lists."""
        result = Validator.validate_points_list(["P1", "P2", "P3"])
        self.assertEqual(result, ["P1", "P2", "P3"])
        
        result = Validator.validate_points_list("P1 P2 P3")
        self.assertEqual(result, ["P1", "P2", "P3"])
        
        result = Validator.validate_points_list(["  P1  ", "  P2  "])
        self.assertEqual(result, ["P1", "P2"])
    
    def test_empty_points_list(self):
        """Test with empty points list."""
        with self.assertRaises(ValidationError) as ctx:
            Validator.validate_points_list([])
        self.assertIn("menos un punto", ctx.exception.message.lower())
        self.assertEqual(ctx.exception.field, "points")
        
        with self.assertRaises(ValidationError):
            Validator.validate_points_list("")
    
    def test_too_many_points(self):
        """Test with too many points."""
        too_many = [f"P{i}" for i in range(1001)]
        with self.assertRaises(ValidationError) as ctx:
            Validator.validate_points_list(too_many)
        self.assertIn("demasiados", ctx.exception.message.lower())
    
    def test_invalid_point_in_list(self):
        """Test with invalid point in list."""
        with self.assertRaises(ValidationError) as ctx:
            Validator.validate_points_list(["P1", "", "P3"])
        self.assertIn("inválido", ctx.exception.message.lower())
        
        with self.assertRaises(ValidationError) as ctx:
            Validator.validate_points_list(["P1", "a" * 51])
        self.assertIn("inválido", ctx.exception.message.lower())
    
    def test_invalid_points_type(self):
        """Test with invalid points type."""
        with self.assertRaises(ValidationError) as ctx:
            Validator.validate_points_list(123)
        self.assertIn("lista", ctx.exception.message.lower())


class TestValidatorRunPointPayload(unittest.TestCase):
    """Test complete run_point payload validation."""
    
    def test_valid_run_point_payload(self):
        """Test with valid run_point payload."""
        payload = {
            "device": "phone",
            "point": "P1",
            "run": 1,
            "duration": 20,
            "parallel": 4
        }
        result = Validator.validate_run_point_payload(payload)
        self.assertEqual(result["device"], "phone")
        self.assertEqual(result["point"], "P1")
        self.assertEqual(result["run"], 1)
        self.assertEqual(result["duration"], 20)
        self.assertEqual(result["parallel"], 4)
    
    def test_run_point_payload_with_defaults(self):
        """Test with partial payload using defaults."""
        payload = {"device": "phone", "point": "P1"}
        defaults = {"run": 1, "duration": 20, "parallel": 4}
        result = Validator.validate_run_point_payload(payload, defaults)
        self.assertEqual(result["device"], "phone")
        self.assertEqual(result["run"], 1)
        self.assertEqual(result["duration"], 20)
    
    def test_invalid_run_point_payload(self):
        """Test with invalid run_point payload."""
        payload = {"device": "", "point": "P1"}
        with self.assertRaises(ValidationError):
            Validator.validate_run_point_payload(payload)


class TestValidatorStartSurveyPayload(unittest.TestCase):
    """Test complete start_survey payload validation."""
    
    def test_valid_start_survey_payload(self):
        """Test with valid start_survey payload."""
        payload = {
            "device": "phone",
            "points": ["P1", "P2", "P3"],
            "repeats": 3,
            "manual": False
        }
        result = Validator.validate_start_survey_payload(payload)
        self.assertEqual(result["device"], "phone")
        self.assertEqual(result["points"], ["P1", "P2", "P3"])
        self.assertEqual(result["repeats"], 3)
        self.assertEqual(result["manual"], False)
    
    def test_start_survey_payload_with_string_points(self):
        """Test with points as string."""
        payload = {
            "device": "phone",
            "points": "P1 P2 P3",
            "repeats": 1
        }
        result = Validator.validate_start_survey_payload(payload)
        self.assertEqual(result["points"], ["P1", "P2", "P3"])
    
    def test_start_survey_payload_with_defaults(self):
        """Test with partial payload using defaults."""
        payload = {"device": "phone", "points": ["P1"]}
        defaults = {"repeats": 1}
        result = Validator.validate_start_survey_payload(payload, defaults)
        self.assertEqual(result["device"], "phone")
        self.assertEqual(result["repeats"], 1)
    
    def test_invalid_start_survey_payload(self):
        """Test with invalid start_survey payload."""
        payload = {"device": "phone", "points": []}
        with self.assertRaises(ValidationError):
            Validator.validate_start_survey_payload(payload)


class TestValidationError(unittest.TestCase):
    """Test ValidationError exception."""
    
    def test_validation_error_to_dict(self):
        """Test ValidationError to_dict method."""
        error = ValidationError("Test error", field="test_field", details={"key": "value"})
        result = error.to_dict()
        
        self.assertEqual(result["ok"], False)
        self.assertEqual(result["error"], "Test error")
        self.assertEqual(result["field"], "test_field")
        self.assertEqual(result["details"], {"key": "value"})
    
    def test_validation_error_without_field(self):
        """Test ValidationError without field."""
        error = ValidationError("Test error")
        result = error.to_dict()
        
        self.assertEqual(result["ok"], False)
        self.assertEqual(result["error"], "Test error")
        self.assertNotIn("field", result)


if __name__ == "__main__":
    unittest.main()
