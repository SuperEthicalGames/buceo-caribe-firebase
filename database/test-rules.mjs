// =====================================================================
// Pruebas de las reglas de seguridad contra los EMULADORES locales
// ---------------------------------------------------------------------
// 1. firebase emulators:start --only auth,database
// 2. node database/test-rules.mjs
//
// Crea usuarios de prueba en el emulador de Auth (nunca en producción),
// carga el catálogo con permisos de administrador del emulador y comprueba
// qué operaciones se permiten y cuáles se rechazan.
// =====================================================================
import { readFileSync } from 'node:fs';

const NS = 'web-caribe-default-rtdb';
const DB = 'http://127.0.0.1:9000';
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const TS = { '.sv': 'timestamp' };

const seed = JSON.parse(readFileSync(new URL('./seed.json', import.meta.url), 'utf8'));

async function rtdb(method, path, { token, body, query = '' } = {}) {
  const params = new URLSearchParams(query);
  params.set('ns', NS);
  const headers = { 'Content-Type': 'application/json' };
  if (token === 'owner') headers.Authorization = 'Bearer owner';
  else if (token) params.set('auth', token);
  const res = await fetch(`${DB}/${path}.json?${params}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) };
}

async function crearUsuario(email) {
  const res = await fetch(`${AUTH}/accounts:signUp?key=demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'prueba123', returnSecureToken: true })
  });
  const json = await res.json();
  if (!json.idToken) throw new Error('No se pudo crear el usuario de prueba: ' + JSON.stringify(json));
  return { uid: json.localId, token: json.idToken };
}

let pasadas = 0;
let falladas = 0;
async function espera(descripcion, permitido, promesa) {
  const r = await promesa;
  if (r.ok === permitido) {
    pasadas++;
    console.log(`  ✔ ${descripcion}`);
  } else {
    falladas++;
    console.log(`  ✖ ${descripcion} → HTTP ${r.status} ${JSON.stringify(r.data)}`);
  }
  return r;
}

// ---------- Preparación ----------
await rtdb('DELETE', '', { token: 'owner' });
await rtdb('PATCH', '', { token: 'owner', body: seed });
const sufijo = Date.now();
const ana = await crearUsuario(`ana.${sufijo}@prueba.test`);
const beto = await crearUsuario(`beto.${sufijo}@prueba.test`);

const bitacoraValida = {
  date: '2026-03-14', destinationId: 'bonaire', siteName: 'Salt Pier',
  maxDepthM: 18, bottomTimeMin: 45, waterTempC: 27, visibilityM: 25, gas: 'aire', rating: 5,
  speciesIds: { 'pez-angel-reina': true }, notes: 'Muy buena visibilidad', createdAt: TS
};
const avistamientoValido = {
  uid: ana.uid, alias: 'Ana', speciesId: 'tortuga-carey', speciesName: 'Tortuga carey',
  destinationId: 'roatan', destinationName: 'Roatán', date: '2026-03-15', depthM: 12, count: 1, createdAt: TS
};

console.log('\nLectura pública');
await espera('anónimo lee /catalog', true, rtdb('GET', 'catalog/species/tortuga-carey'));
await espera('anónimo lee /meta', true, rtdb('GET', 'meta'));
await espera('anónimo lee /indexes', true, rtdb('GET', 'indexes/destinationsBySpecies'));
await espera('anónimo lee /sightings', true, rtdb('GET', 'sightings'));
await espera('anónimo NO lee la raíz', false, rtdb('GET', ''));
await espera('anónimo NO lee /users', false, rtdb('GET', `users/${ana.uid}`));
await espera('anónimo NO lee /diveLogs', false, rtdb('GET', `diveLogs/${ana.uid}`));
await espera('anónimo NO lee /admins', false, rtdb('GET', 'admins'));

console.log('\nConsultas indexadas');
const sitios = await espera('sitios de Cozumel por destinationId', true,
  rtdb('GET', 'catalog/diveSites', { query: { orderBy: '"destinationId"', equalTo: '"cozumel"' } }));
if (Object.keys(sitios.data || {}).length !== 4) { falladas++; console.log('  ✖ se esperaban 4 sitios en Cozumel'); }
await espera('naufragios por destinationId', true,
  rtdb('GET', 'catalog/wrecks', { query: { orderBy: '"destinationId"', equalTo: '"dom-rep"' } }));

console.log('\nCatálogo (solo administradores)');
await espera('anónimo NO escribe en /catalog', false, rtdb('PUT', 'catalog/species/x', { body: { name: 'x' } }));
await espera('usuario NO escribe en /catalog', false, rtdb('PUT', 'catalog/species/x', { token: ana.token, body: { name: 'x' } }));
await espera('usuario NO se nombra administrador', false, rtdb('PUT', `admins/${ana.uid}`, { token: ana.token, body: true }));
await rtdb('PUT', `admins/${beto.uid}`, { token: 'owner', body: true });
await espera('administrador SÍ escribe en /catalog', true,
  rtdb('PATCH', 'catalog/glossary/prueba', { token: beto.token, body: { term: 'Prueba', definition: 'Temporal' } }));
await espera('administrador borra el registro de prueba', true, rtdb('DELETE', 'catalog/glossary/prueba', { token: beto.token }));
await espera('administrador consulta su propio rol', true, rtdb('GET', `admins/${beto.uid}`, { token: beto.token }));

console.log('\nPerfil de usuario');
await espera('crea su perfil', true,
  rtdb('PUT', `users/${ana.uid}`, { token: ana.token, body: { alias: 'Ana', createdAt: TS, lastLoginAt: TS } }));
await espera('actualiza su último acceso', true,
  rtdb('PATCH', `users/${ana.uid}`, { token: ana.token, body: { lastLoginAt: TS } }));
await espera('NO cambia su fecha de creación', false,
  rtdb('PATCH', `users/${ana.uid}`, { token: ana.token, body: { createdAt: 1 } }));
await espera('NO añade campos desconocidos', false,
  rtdb('PATCH', `users/${ana.uid}`, { token: ana.token, body: { rol: 'admin' } }));
await espera('NO usa un alias con HTML', false,
  rtdb('PATCH', `users/${ana.uid}`, { token: ana.token, body: { alias: '<b>Ana</b>' } }));
await espera('otro usuario NO lee el perfil', false, rtdb('GET', `users/${ana.uid}`, { token: beto.token }));
await espera('otro usuario NO escribe el perfil', false,
  rtdb('PATCH', `users/${ana.uid}`, { token: beto.token, body: { alias: 'Beto' } }));

console.log('\nFavoritos');
await espera('marca un destino como favorito', true,
  rtdb('PUT', `favorites/${ana.uid}/bonaire`, { token: ana.token, body: TS }));
await espera('NO marca un destino inexistente', false,
  rtdb('PUT', `favorites/${ana.uid}/atlantida`, { token: ana.token, body: TS }));
await espera('otro usuario NO lee los favoritos', false, rtdb('GET', `favorites/${ana.uid}`, { token: beto.token }));
await espera('quita el favorito', true, rtdb('DELETE', `favorites/${ana.uid}/bonaire`, { token: ana.token }));

console.log('\nBitácora privada');
const log = await espera('registra una inmersión válida', true,
  rtdb('POST', `diveLogs/${ana.uid}`, { token: ana.token, body: bitacoraValida }));
const logId = log.data?.name;
await espera('lee su bitácora ordenada por fecha', true,
  rtdb('GET', `diveLogs/${ana.uid}`, { token: ana.token, query: { orderBy: '"date"' } }));
await espera('NO edita una inmersión (registros inmutables)', false,
  rtdb('PATCH', `diveLogs/${ana.uid}/${logId}`, { token: ana.token, body: { maxDepthM: 20 } }));
for (const [campo, valor, motivo] of [
  ['destinationId', 'atlantida', 'destino inexistente'],
  ['maxDepthM', 200, 'profundidad > 130 m'],
  ['date', '14/03/2026', 'fecha con formato incorrecto'],
  ['gas', 'helio', 'gas no permitido'],
  ['rating', 4.5, 'valoración no entera'],
  ['speciesIds', { unicornio: true }, 'especie inexistente'],
  ['createdAt', 1700000000000, 'fecha de creación falsa'],
  ['extra', 'x', 'campo desconocido']
]) {
  await espera(`NO registra con ${motivo}`, false,
    rtdb('POST', `diveLogs/${ana.uid}`, { token: ana.token, body: { ...bitacoraValida, [campo]: valor } }));
}
const sinProfundidad = { ...bitacoraValida };
delete sinProfundidad.maxDepthM;
await espera('NO registra sin campos obligatorios', false,
  rtdb('POST', `diveLogs/${ana.uid}`, { token: ana.token, body: sinProfundidad }));
await espera('otro usuario NO lee la bitácora', false, rtdb('GET', `diveLogs/${ana.uid}`, { token: beto.token }));
await espera('otro usuario NO escribe en la bitácora', false,
  rtdb('POST', `diveLogs/${ana.uid}`, { token: beto.token, body: bitacoraValida }));
await espera('otro usuario NO borra la inmersión', false,
  rtdb('DELETE', `diveLogs/${ana.uid}/${logId}`, { token: beto.token }));
await espera('elimina su inmersión', true, rtdb('DELETE', `diveLogs/${ana.uid}/${logId}`, { token: ana.token }));

console.log('\nAvistamientos públicos');
await espera('anónimo NO publica', false, rtdb('POST', 'sightings', { body: avistamientoValido }));
const av = await espera('usuario publica un avistamiento válido', true,
  rtdb('POST', 'sightings', { token: ana.token, body: avistamientoValido }));
const avId = av.data?.name;
await espera('anónimo consulta los últimos por fecha', true,
  rtdb('GET', 'sightings', { query: { orderBy: '"createdAt"', limitToLast: 10 } }));
await espera('NO publica en nombre de otro usuario', false,
  rtdb('POST', 'sightings', { token: beto.token, body: avistamientoValido }));
await espera('NO publica con un nombre de especie alterado', false,
  rtdb('POST', 'sightings', { token: ana.token, body: { ...avistamientoValido, speciesName: 'Kraken' } }));
await espera('NO publica con un nombre de destino alterado', false,
  rtdb('POST', 'sightings', { token: ana.token, body: { ...avistamientoValido, destinationName: 'Atlántida' } }));
await espera('NO publica más de 500 ejemplares', false,
  rtdb('POST', 'sightings', { token: ana.token, body: { ...avistamientoValido, count: 501 } }));
await espera('NO edita su avistamiento', false,
  rtdb('PATCH', `sightings/${avId}`, { token: ana.token, body: { count: 3 } }));
await espera('otro usuario NO lo borra', false, rtdb('DELETE', `sightings/${avId}`, { token: beto.token }));
await espera('el autor lo borra', true, rtdb('DELETE', `sightings/${avId}`, { token: ana.token }));

console.log(`\n${falladas === 0 ? '✔' : '✖'} ${pasadas} pruebas superadas, ${falladas} fallidas\n`);
process.exit(falladas === 0 ? 0 : 1);
