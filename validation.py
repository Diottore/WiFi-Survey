#!/usr/bin/env python3
"""
Centralized validation module for WiFi Survey application.
Provides consistent validation rules and descriptive error messages.
"""

from typing import Dict, List, Tuple, Any, Optional


class ValidationError(Exception):
    """Custom exception for validation errors with field information."""
    
    def __init__(self, message: str, field: Optional[str] = None, details: Optional[Dict[str, Any]] = None):
        self.message = message
        self.field = field
        self.details = details or {}
        super().__init__(self.message)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert validation error to dictionary format for API responses."""
        result = {
            "ok": False,
            "error": self.message
        }
        if self.field:
            result["field"] = self.field
        if self.details:
            result["details"] = self.details
        return result


class Validator:
    """Centralized validator with common validation rules."""
    
    # Validation constants
    DEVICE_NAME_MAX_LENGTH = 100
    POINT_ID_MAX_LENGTH = 50
    RUN_INDEX_MIN = 1
    RUN_INDEX_MAX = 1000
    DURATION_MIN = 1
    DURATION_MAX = 300
    PARALLEL_MIN = 1
    PARALLEL_MAX = 16
    REPEATS_MIN = 1
    REPEATS_MAX = 100
    POINTS_MAX_COUNT = 1000
    
    @staticmethod
    def validate_device_name(device: Any, field_name: str = "device") -> str:
        """
        Validate device name.
        
        Args:
            device: Device name to validate
            field_name: Name of the field for error reporting
            
        Returns:
            Validated device name (string)
            
        Raises:
            ValidationError: If validation fails
        """
        if device is None:
            raise ValidationError(
                f"El nombre del dispositivo es requerido",
                field=field_name,
                details={"required": True}
            )
        
        device_str = str(device).strip()
        
        if not device_str:
            raise ValidationError(
                f"El nombre del dispositivo no puede estar vacío",
                field=field_name,
                details={"min_length": 1}
            )
        
        if len(device_str) > Validator.DEVICE_NAME_MAX_LENGTH:
            raise ValidationError(
                f"El nombre del dispositivo es muy largo (máximo {Validator.DEVICE_NAME_MAX_LENGTH} caracteres)",
                field=field_name,
                details={"max_length": Validator.DEVICE_NAME_MAX_LENGTH, "actual_length": len(device_str)}
            )
        
        return device_str
    
    @staticmethod
    def validate_point_id(point: Any, field_name: str = "point") -> str:
        """
        Validate point ID.
        
        Args:
            point: Point ID to validate
            field_name: Name of the field for error reporting
            
        Returns:
            Validated point ID (string)
            
        Raises:
            ValidationError: If validation fails
        """
        if point is None:
            raise ValidationError(
                f"El ID del punto es requerido",
                field=field_name,
                details={"required": True}
            )
        
        point_str = str(point).strip()
        
        if not point_str:
            raise ValidationError(
                f"El ID del punto no puede estar vacío",
                field=field_name,
                details={"min_length": 1}
            )
        
        if len(point_str) > Validator.POINT_ID_MAX_LENGTH:
            raise ValidationError(
                f"El ID del punto es muy largo (máximo {Validator.POINT_ID_MAX_LENGTH} caracteres)",
                field=field_name,
                details={"max_length": Validator.POINT_ID_MAX_LENGTH, "actual_length": len(point_str)}
            )
        
        return point_str
    
    @staticmethod
    def validate_run_index(run: Any, field_name: str = "run") -> int:
        """
        Validate run index.
        
        Args:
            run: Run index to validate
            field_name: Name of the field for error reporting
            
        Returns:
            Validated run index (integer)
            
        Raises:
            ValidationError: If validation fails
        """
        try:
            run_int = int(run)
        except (ValueError, TypeError):
            raise ValidationError(
                f"El índice de repetición debe ser un número entero",
                field=field_name,
                details={"type": "integer"}
            )
        
        if run_int < Validator.RUN_INDEX_MIN or run_int > Validator.RUN_INDEX_MAX:
            raise ValidationError(
                f"El índice de repetición debe estar entre {Validator.RUN_INDEX_MIN} y {Validator.RUN_INDEX_MAX}",
                field=field_name,
                details={"min": Validator.RUN_INDEX_MIN, "max": Validator.RUN_INDEX_MAX, "actual": run_int}
            )
        
        return run_int
    
    @staticmethod
    def validate_duration(duration: Any, field_name: str = "duration") -> int:
        """
        Validate test duration.
        
        Args:
            duration: Duration to validate
            field_name: Name of the field for error reporting
            
        Returns:
            Validated duration (integer)
            
        Raises:
            ValidationError: If validation fails
        """
        try:
            duration_int = int(duration)
        except (ValueError, TypeError):
            raise ValidationError(
                f"La duración debe ser un número entero",
                field=field_name,
                details={"type": "integer"}
            )
        
        if duration_int < Validator.DURATION_MIN or duration_int > Validator.DURATION_MAX:
            raise ValidationError(
                f"La duración debe estar entre {Validator.DURATION_MIN} y {Validator.DURATION_MAX} segundos",
                field=field_name,
                details={"min": Validator.DURATION_MIN, "max": Validator.DURATION_MAX, "actual": duration_int}
            )
        
        return duration_int
    
    @staticmethod
    def validate_parallel_streams(parallel: Any, field_name: str = "parallel") -> int:
        """
        Validate parallel streams count.
        
        Args:
            parallel: Parallel streams to validate
            field_name: Name of the field for error reporting
            
        Returns:
            Validated parallel streams (integer)
            
        Raises:
            ValidationError: If validation fails
        """
        try:
            parallel_int = int(parallel)
        except (ValueError, TypeError):
            raise ValidationError(
                f"El número de streams paralelos debe ser un número entero",
                field=field_name,
                details={"type": "integer"}
            )
        
        if parallel_int < Validator.PARALLEL_MIN or parallel_int > Validator.PARALLEL_MAX:
            raise ValidationError(
                f"El número de streams paralelos debe estar entre {Validator.PARALLEL_MIN} y {Validator.PARALLEL_MAX}",
                field=field_name,
                details={"min": Validator.PARALLEL_MIN, "max": Validator.PARALLEL_MAX, "actual": parallel_int}
            )
        
        return parallel_int
    
    @staticmethod
    def validate_repeats(repeats: Any, field_name: str = "repeats") -> int:
        """
        Validate repeats count.
        
        Args:
            repeats: Repeats to validate
            field_name: Name of the field for error reporting
            
        Returns:
            Validated repeats (integer)
            
        Raises:
            ValidationError: If validation fails
        """
        try:
            repeats_int = int(repeats)
        except (ValueError, TypeError):
            raise ValidationError(
                f"El número de repeticiones debe ser un número entero",
                field=field_name,
                details={"type": "integer"}
            )
        
        if repeats_int < Validator.REPEATS_MIN or repeats_int > Validator.REPEATS_MAX:
            raise ValidationError(
                f"El número de repeticiones debe estar entre {Validator.REPEATS_MIN} y {Validator.REPEATS_MAX}",
                field=field_name,
                details={"min": Validator.REPEATS_MIN, "max": Validator.REPEATS_MAX, "actual": repeats_int}
            )
        
        return repeats_int
    
    @staticmethod
    def validate_points_list(points: Any, field_name: str = "points") -> List[str]:
        """
        Validate list of points.
        
        Args:
            points: Points to validate (can be list or string)
            field_name: Name of the field for error reporting
            
        Returns:
            Validated list of points
            
        Raises:
            ValidationError: If validation fails
        """
        # Convert string to list if needed
        if isinstance(points, str):
            points = points.split() if points.strip() else []
        
        if not isinstance(points, list):
            raise ValidationError(
                f"Los puntos deben ser una lista o cadena de texto separada por espacios",
                field=field_name,
                details={"type": "list or string"}
            )
        
        if not points:
            raise ValidationError(
                f"Debe proporcionar al menos un punto para la encuesta",
                field=field_name,
                details={"min_count": 1}
            )
        
        if len(points) > Validator.POINTS_MAX_COUNT:
            raise ValidationError(
                f"Demasiados puntos (máximo {Validator.POINTS_MAX_COUNT})",
                field=field_name,
                details={"max_count": Validator.POINTS_MAX_COUNT, "actual_count": len(points)}
            )
        
        # Validate each point
        validated_points = []
        for i, point in enumerate(points):
            try:
                validated_point = Validator.validate_point_id(point, field_name=f"{field_name}[{i}]")
                validated_points.append(validated_point)
            except ValidationError as e:
                # Re-raise with more context
                raise ValidationError(
                    f"Punto inválido en posición {i + 1}: {e.message}",
                    field=field_name,
                    details={"index": i, "point": str(point), "original_error": e.message}
                )
        
        return validated_points
    
    @staticmethod
    def validate_run_point_payload(payload: Dict[str, Any], defaults: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Validate complete run_point payload.
        
        Args:
            payload: Request payload to validate
            defaults: Default values for optional fields
            
        Returns:
            Dictionary with validated values
            
        Raises:
            ValidationError: If validation fails
        """
        defaults = defaults or {}
        
        validated = {}
        validated["device"] = Validator.validate_device_name(payload.get("device", defaults.get("device", "phone")))
        validated["point"] = Validator.validate_point_id(payload.get("point", defaults.get("point", "P1")))
        validated["run"] = Validator.validate_run_index(payload.get("run", defaults.get("run", 1)))
        validated["duration"] = Validator.validate_duration(payload.get("duration", defaults.get("duration", 20)))
        validated["parallel"] = Validator.validate_parallel_streams(payload.get("parallel", defaults.get("parallel", 4)))
        
        return validated
    
    @staticmethod
    def validate_start_survey_payload(payload: Dict[str, Any], defaults: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Validate complete start_survey payload.
        
        Args:
            payload: Request payload to validate
            defaults: Default values for optional fields
            
        Returns:
            Dictionary with validated values
            
        Raises:
            ValidationError: If validation fails
        """
        defaults = defaults or {}
        
        validated = {}
        validated["device"] = Validator.validate_device_name(payload.get("device", defaults.get("device", "phone")))
        validated["points"] = Validator.validate_points_list(payload.get("points", []))
        validated["repeats"] = Validator.validate_repeats(payload.get("repeats", defaults.get("repeats", 1)))
        validated["manual"] = bool(payload.get("manual", False))
        
        return validated
