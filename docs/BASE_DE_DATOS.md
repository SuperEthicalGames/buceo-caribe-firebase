# Base de datos — Firebase Realtime Database

Diseño de datos de **Buceo en el Mar Caribe** (`web-caribe-default-rtdb`). La base guarda dos tipos de información:

- **Contenido editorial** (catálogo): especies, destinos, naufragios, sitios, ecosistemas, normas de seguridad, glosario… Es público para leer y solo lo editan administradores.
- **Datos de usuarios**: perfil, bitácora de inmersiones, destinos favoritos y avistamientos de la comunidad.

## Principios de diseño

| Principio | Cómo se aplica |
|---|---|
| **Árbol plano, no anidado** | Cada colección cuelga de un nodo propio (`catalog/species`, `diveLogs/{uid}`…). Leer un nodo descarga todo lo que tiene debajo; anidar obligaría a descargar datos que no se necesitan. |
| **Un nodo por frontera de seguridad** | Lo público (`catalog`, `sightings`) y lo privado (`users`, `diveLogs`, `favorites`) están separados, así las reglas son simples y no se filtran datos por error. |
| **Claves estables y legibles** | El catálogo usa *slugs* (`hilma-hooker`, `bonaire`) que coinciden con la página. Los datos de usuarios usan *push IDs* de Firebase, que además ordenan por fecha de creación. |
| **Relaciones como mapas `{ id: true }`** | RTDB no maneja bien los arrays: un mapa permite añadir o quitar un elemento sin reescribir la lista y validarlo con reglas. |
| **Índices inversos derivados** | Las relaciones N:M tienen índice en `/indexes`, generado automáticamente por el script de *seed* (nunca a mano). Las relaciones 1:N se consultan con `orderByChild` + `.indexOn`. |
| **Desnormalización controlada** | Un avistamiento copia `speciesName` y `destinationName` para pintar el feed sin lecturas extra. Las reglas verifican que la copia coincide con el catálogo. |
| **Unidades en el nombre del campo** | `maxDepthM`, `bottomTimeMin`, `waterTempC`, `visibilityM`: sin ambigüedad entre metros/pies o °C/°F. |
| **Fechas** | Fechas de calendario como texto `YYYY-MM-DD` (ordenable). Marcas de tiempo como milisegundos del servidor (`serverTimestamp()`), validadas con `now`. |
| **Privacidad por diseño** | El correo del usuario **no** se guarda en la base: vive solo en Firebase Authentication. En público se muestra un alias elegido por el usuario. |

## Estructura

```text
/
├── meta                                  público · solo admin escribe
│   ├── schemaVersion: 1
│   ├── generatedAt: "2026-11-12T…"
│   ├── locale: "es"
│   └── counts: { species: 15, wrecks: 11, … }
│
├── catalog                               público · solo admin escribe
│   ├── regions/{regionId}
│   ├── countries/{countryCode}           ISO 3166-1 alfa-2 (co, mx, bq, ky, hn, do)
│   ├── destinations/{destinationId}
│   ├── diveSites/{siteId}                → destinationId
│   ├── wrecks/{wreckId}                  → destinationId, siteId, minCertificationId
│   ├── species/{speciesId}
│   ├── ecosystems/{ecosystemId}          → keySpeciesIds
│   ├── diveModes/{modeId}                → minCertificationId
│   ├── certifications/{certId}           → prerequisiteId
│   ├── threats/{threatId}                → speciesId (opcional)
│   ├── practices/{practiceId}
│   ├── safetyRules/{ruleId}
│   ├── hyperbaricChambers/{chamberId}    → destinationId, countryCode
│   ├── glossary/{termId}
│   └── sources/{sourceId}
│
├── indexes                               público · solo admin escribe (derivados)
│   ├── destinationsBySpecies/{speciesId}/{destinationId}: true
│   ├── destinationsBySiteType/{type}/{destinationId}: true
│   ├── destinationsByEcosystem/{ecosystemId}/{destinationId}: true
│   └── speciesByEcosystem/{ecosystemId}/{speciesId}: true
│
├── admins/{uid}: true                    solo se gestiona desde la consola
│
├── users/{uid}                           privado (solo su dueño)
│   ├── alias, createdAt, lastLoginAt
│
├── favorites/{uid}/{destinationId}: <timestamp>     privado
│
├── diveLogs/{uid}/{logId}                privado · crear y borrar (inmutable)
│   ├── date, destinationId, siteName?, maxDepthM, bottomTimeMin,
│   ├── waterTempC?, visibilityM?, gas?, rating?, speciesIds?, notes?, createdAt
│
└── sightings/{sightingId}                público · crea el usuario · borra su autor
    ├── uid, alias, speciesId, speciesName, destinationId, destinationName,
    └── date, depthM?, count?, notes?, createdAt
```

### Ejemplos de registros

```jsonc
// catalog/wrecks/st-george
{
  "name": "St. George",
  "destinationId": "dom-rep",
  "siteId": "pecio-st-george",
  "vesselType": "Carguero",
  "sunkYear": 1999,
  "cause": "arrecife-artificial",       // arrecife-artificial | accidente | tormenta | desconocida
  "lengthM": 73,
  "depthRangeM": { "min": 12, "max": 44 },
  "minCertificationId": "advanced-open-water",
  "order": 7,
  "status": "published",                 // published | draft
  "summary": "Carguero de 73 m hundido en 1999 frente a Bayahibe…"
}

// diveLogs/{uid}/-Nx8…
{
  "date": "2026-03-14",
  "destinationId": "bonaire",
  "siteName": "Salt Pier",
  "maxDepthM": 18.5,
  "bottomTimeMin": 45,
  "gas": "nitrox32",                      // aire | nitrox32 | nitrox36 | trimix
  "rating": 5,
  "speciesIds": { "pez-angel-reina": true },
  "createdAt": 1794500000000
}
```

### Campos comunes del catálogo

Todo registro del catálogo puede llevar: `name` (o `term` en el glosario), `summary`, `description`, `order` (orden de presentación), `status` (`published`/`draft`) y `sourceIds` (fuentes que lo respaldan). Los campos sin un dato verificable se **omiten** en lugar de inventarse (por ejemplo, el año de hundimiento de algunos pecios).

## Patrones de acceso

| Pantalla / necesidad | Consulta | Índice |
|---|---|---|
| Fichas de naufragios | `get(catalog/wrecks)` (cacheado por sesión) | — |
| Naufragios de un destino | `orderByChild('destinationId').equalTo(id)` | `.indexOn` en `catalog/wrecks` |
| Sitios de un destino | `orderByChild('destinationId').equalTo(id)` | `.indexOn` en `catalog/diveSites` |
| ¿Dónde ver una especie? | `get(indexes/destinationsBySpecies/{speciesId})` | índice derivado |
| Destinos con pecios / paredes / orilla | `get(indexes/destinationsBySiteType/{tipo})` | índice derivado |
| Feed de avistamientos en vivo | `orderByChild('createdAt').limitToLast(12)` + `onValue` | `.indexOn` en `sightings` |
| Bitácora del usuario | `orderByChild('date')` en `diveLogs/{uid}` + `onValue` | `.indexOn` en `diveLogs/{uid}` |
| Favoritos del usuario | `onValue(favorites/{uid})` | — |

## Modelo de seguridad

Las reglas están en [`database/database.rules.json`](../database/database.rules.json). Todo está **denegado por defecto** (`.read`/`.write: false` en la raíz) y se abre solo lo necesario:

- **Catálogo, índices y meta**: lectura pública; escritura solo si `admins/{uid} === true`.
- **Perfil, favoritos y bitácora**: solo `auth.uid === $uid` lee y escribe.
- **Bitácora inmutable**: una inmersión se crea o se borra, nunca se edita (evita manipular el historial).
- **Avistamientos**: lectura pública; para crear hay que tener sesión y `uid` debe ser el propio; solo el autor puede borrar; nadie puede editar.
- **Validación de esquema** en cada campo: tipos, rangos (profundidad 0-130 m, tiempo 1-300 min…), enumerados, formato de fecha, longitud de textos, integridad referencial contra el catálogo (`destinationId`, `speciesId` deben existir), `createdAt === now` y `$other: false` para rechazar campos desconocidos.

Las reglas se prueban con **53 casos** en [`database/test-rules.mjs`](../database/test-rules.mjs) contra los emuladores locales.

## Cómo añadir un nuevo tipo de contenido

1. Añade la colección en `database/build-seed.mjs` (por ejemplo `operators` o `articles`) con sus validaciones.
2. Si necesita búsquedas por un campo, añade su `.indexOn` en las reglas; si es N:M, deriva un índice en `/indexes`.
3. Regenera y carga el catálogo (ver abajo). La página lo lee con `leerCatalogo('nombre')` de `js/data.js`.

## Operación

```bash
# 1. Generar el catálogo validado (database/seed.json)
node database/build-seed.mjs

# 2. Probar las reglas en local (necesita Java para el emulador de Database)
firebase emulators:start --only auth,database
node database/test-rules.mjs

# 3. Probar la página contra los emuladores
#    http://localhost:8093/?emuladores

# 4. Publicar las reglas (cuenta con acceso al proyecto web-caribe)
firebase deploy --only database

# 5. Cargar o actualizar el catálogo (reemplaza /meta, /catalog e /indexes; no toca datos de usuarios)
firebase database:update / database/seed.json --project web-caribe
```

Para nombrar un administrador: en la consola de Firebase, crea `admins/<uid-del-usuario>` con el valor `true`.

## Límites conocidos y siguientes pasos

- **Límite de frecuencia**: un usuario con sesión podría publicar muchos avistamientos seguidos. Solución: guardar `lastSightingAt` en el perfil y exigir en las reglas un intervalo mínimo, o moderar con Cloud Functions.
- **Agregados** (cuántos buzos marcaron un destino como favorito, especies más vistas): deben calcularse en el servidor con Cloud Functions; un contador escrito desde el cliente sería manipulable.
- **Moderación**: los avistamientos son públicos; un rol de moderador podría borrar contenido inapropiado.
- **Copias de seguridad**: las copias automáticas diarias requieren el plan Blaze.
- **Idiomas**: el catálogo está en español (`meta.locale`). Para varios idiomas, añadir campos `name_en`, etc., o nodos `catalog_en`.
