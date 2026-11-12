# Buceo en el Mar Caribe y Naufragios

Guía web educativa sobre el buceo en el Mar Caribe: ecosistemas, biodiversidad, destinos, seguridad y conservación. Incluye un módulo de **inicio de sesión con Firebase Authentication** (correo electrónico y contraseña).

## Módulo de acceso (Firebase)

- Botón **Iniciar sesión** en la cabecera; con sesión activa muestra el correo del usuario y el botón **Salir**.
- Ventana con tres modos: **Iniciar sesión**, **Crear cuenta** y **¿Olvidaste tu contraseña?** (envía un correo de recuperación en español).
- Validación de campos antes de llamar a Firebase y mensajes de error traducidos al español.
- Firebase JS SDK 13.3.0 cargado desde `gstatic.com` (sin dependencias ni compilación).

## Configuración en Firebase

1. En la consola de Firebase del proyecto `web-caribe`, ve a **Authentication → Sign-in method**.
2. Activa el proveedor **Correo electrónico/contraseña**.

## Ejecutar en local

Abre la página desde un servidor (con `file://` Firebase puede fallar):

```bash
python -m http.server 8093
```

Luego visita http://localhost:8093.
