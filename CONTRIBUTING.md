# Contribuyendo a WiFi Survey

¡Gracias por tu interés en contribuir a WiFi Survey! Este documento proporciona pautas para contribuir al proyecto.

## Cómo Contribuir

### Reportar Bugs

Si encuentras un bug, por favor crea un issue incluyendo:
- Descripción clara del problema
- Pasos para reproducir el error
- Comportamiento esperado vs. comportamiento actual
- Información del entorno (versión de Python, sistema operativo, dispositivo Android)
- Logs o mensajes de error relevantes

### Sugerir Mejoras

Las sugerencias de mejoras son bienvenidas. Por favor:
- Explica claramente la mejora propuesta
- Proporciona casos de uso
- Considera la compatibilidad con el código existente

### Pull Requests

1. **Fork el repositorio** y crea tu branch desde `main`
2. **Escribe código claro y legible** siguiendo las convenciones del proyecto
3. **Prueba tu código** antes de enviar el PR
4. **Actualiza la documentación** si es necesario
5. **Describe tus cambios** en el PR de manera clara

### Estándares de Código

#### Python
- Sigue PEP 8 para el estilo de código
- Usa docstrings para funciones y clases
- Mantén las líneas de código bajo 120 caracteres
- Usa nombres descriptivos para variables y funciones

#### Shell Scripts
- Usa comentarios para explicar lógica compleja
- Valida entradas y maneja errores apropiadamente
- Sigue convenciones POSIX cuando sea posible

#### JavaScript
- Usa ES6+ cuando sea posible
- Mantén el código consistente con el estilo existente
- Comenta funciones complejas

### Configuración del Entorno de Desarrollo

1. Clona el repositorio:
```bash
git clone https://github.com/Diottore/WiFi-Survey.git
cd WiFi-Survey
```

2. Crea un entorno virtual de Python:
```bash
python3 -m venv .venv
source .venv/bin/activate  # En Windows: .venv\Scripts\activate
```

3. Instala las dependencias:
```bash
pip install -r requirements.txt
```

4. Copia y personaliza la configuración:
```bash
cp config.ini config.local.ini
# Edita config.local.ini con tu configuración
```

### Testing

Antes de enviar un PR:
- Verifica que no haya errores de sintaxis en Python: `python3 -m py_compile app.py`
- Prueba la aplicación Flask localmente
- Verifica que los scripts de shell funcionen correctamente

### Commit Messages

Usa mensajes de commit descriptivos:
- Primera línea: resumen breve (50 caracteres o menos)
- Línea en blanco
- Descripción detallada si es necesario

Ejemplos:
```
Agregar validación de entrada en formulario de survey

Añade validación para prevenir valores negativos en duration
y parallel streams. También mejora mensajes de error.
```

### Licencia

Al contribuir, aceptas que tus contribuciones se licenciarán bajo la misma licencia que el proyecto original.

## Preguntas

Si tienes preguntas sobre cómo contribuir, por favor abre un issue con la etiqueta "question".

¡Gracias por contribuir! 🎉
