# Buceo en el Mar Caribe y Naufragios

Guía web educativa sobre el buceo en el Mar Caribe: ecosistemas, biodiversidad, destinos, naufragios, seguridad y conservación. Usa **Firebase Authentication** (correo y contraseña) y **Firebase Realtime Database**.

**Página publicada:** https://superethicalgames.github.io/buceo-caribe-firebase/

## Funcionalidades con Firebase

- **Inicio de sesión**: crear cuenta, entrar, recuperar contraseña y cerrar sesión.
- **Naufragios** (sección 05): fichas de 11 pecios cargadas desde la base de datos, con filtro por destino.
- **Avistamientos en vivo** (sección 09): cualquiera los lee; con sesión se publican y aparecen al instante para todos.
- **Bitácora de inmersiones**: registro privado de inmersiones con estadísticas (profundidad máxima, tiempo bajo el agua, destinos).
- **Destinos favoritos**: botón de estrella en cada ficha de destino.

## Estructura del proyecto

```text
index.html                    Página (estilos incluidos)
js/
  firebase.js                 Inicialización de Firebase (app, auth, db)
  auth.js                     Módulo de inicio de sesión
  data.js                     Capa de acceso a datos (todas las rutas de la base)
  naufragios.js               Sección de naufragios
  comunidad.js                Avistamientos, bitácora y favoritos
  util.js, main.js            Utilidades y punto de entrada
database/
  build-seed.mjs              Catálogo: fuente de verdad, validación e índices
  seed.json                   Catálogo generado (135 registros, 15 colecciones)
  database.rules.json         Reglas de seguridad y validación
  test-rules.mjs              53 pruebas de las reglas (emuladores)
docs/BASE_DE_DATOS.md         Diseño de la base de datos
firebase.json, .firebaserc    Configuración de la CLI y los emuladores
```

El diseño completo de la base de datos (estructura, relaciones, índices, seguridad y operación) está en **[docs/BASE_DE_DATOS.md](docs/BASE_DE_DATOS.md)**.

## Configuración en Firebase (proyecto `web-caribe`)

1. **Authentication → Sign-in method**: activa **Correo electrónico/contraseña**.
2. **Realtime Database → Reglas**: pega el contenido de `database/database.rules.json` y pulsa **Publicar** (o `firebase deploy --only database`).
3. **Catálogo**: `firebase database:update / database/seed.json --project web-caribe`.

## Ejecutar en local

Abre la página desde un servidor (con `file://` Firebase puede fallar):

```bash
python -m http.server 8093
```

- http://localhost:8093 usa el proyecto real de Firebase.
- http://localhost:8093/?emuladores usa los emuladores locales (`firebase emulators:start --only auth,database`).
