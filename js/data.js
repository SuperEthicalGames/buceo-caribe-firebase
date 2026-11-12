// =====================================================================
// Capa de acceso a datos (Realtime Database)
// ---------------------------------------------------------------------
// Toda lectura/escritura de la página pasa por aquí. Así las rutas y la
// forma de los datos viven en un solo lugar (ver docs/BASE_DE_DATOS.md)
// y la interfaz no conoce detalles de Firebase.
// =====================================================================
import {
  ref, get, onValue, push, set, update, remove, serverTimestamp,
  query, orderByChild, limitToLast
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-database.js';
import { db } from './firebase.js';

export const RUTAS = {
  catalogo: (coleccion) => `catalog/${coleccion}`,
  perfil: (uid) => `users/${uid}`,
  favoritos: (uid) => `favorites/${uid}`,
  bitacora: (uid) => `diveLogs/${uid}`,
  avistamientos: 'sightings'
};

// ---------- Utilidades ----------

// Convierte un snapshot { id: {...} } en una lista [{ id, ... }] respetando el orden de la consulta
function aLista(snapshot) {
  const lista = [];
  snapshot.forEach((hijo) => {
    lista.push({ id: hijo.key, ...hijo.val() });
  });
  return lista;
}

// Realtime Database rechaza undefined: se eliminan los campos vacíos u opcionales sin valor
function limpiar(objeto) {
  return Object.fromEntries(
    Object.entries(objeto).filter(([, v]) => v !== undefined && v !== null && v !== '' && !Number.isNaN(v))
  );
}

const porOrdenYNombre = (a, b) =>
  (a.order ?? 999) - (b.order ?? 999) || String(a.name ?? a.term).localeCompare(String(b.name ?? b.term), 'es');

export function describirError(err) {
  const codigo = String(err?.code || err?.message || '').toUpperCase();
  if (codigo.includes('PERMISSION_DENIED')) return 'No tienes permiso para esta operación o los datos no son válidos.';
  if (codigo.includes('NETWORK') || codigo.includes('DISCONNECTED')) return 'No hay conexión con la base de datos.';
  return 'No se pudo completar la operación. Inténtalo de nuevo.';
}

// ---------- Catálogo (lectura pública, cacheada por sesión) ----------
const cacheCatalogo = new Map();

export function leerCatalogo(coleccion) {
  if (!cacheCatalogo.has(coleccion)) {
    const promesa = get(ref(db, RUTAS.catalogo(coleccion)))
      .then((snap) => aLista(snap).filter((item) => item.status !== 'draft').sort(porOrdenYNombre))
      .catch((err) => {
        cacheCatalogo.delete(coleccion); // permite reintentar
        throw err;
      });
    cacheCatalogo.set(coleccion, promesa);
  }
  return cacheCatalogo.get(coleccion);
}

export async function leerCatalogoComoMapa(coleccion) {
  return new Map((await leerCatalogo(coleccion)).map((item) => [item.id, item]));
}

// ---------- Perfil del usuario ----------
export async function registrarAcceso(uid) {
  const perfilRef = ref(db, RUTAS.perfil(uid));
  const snap = await get(perfilRef);
  const cambios = { lastLoginAt: serverTimestamp() };
  if (!snap.child('createdAt').exists()) cambios.createdAt = serverTimestamp();
  await update(perfilRef, cambios);
  return snap.val() || {};
}

export function guardarAlias(uid, alias) {
  return update(ref(db, RUTAS.perfil(uid)), { alias });
}

// ---------- Favoritos ----------
export function escucharFavoritos(uid, alCambiar, alFallar) {
  return onValue(
    ref(db, RUTAS.favoritos(uid)),
    (snap) => alCambiar(new Set(Object.keys(snap.val() || {}))),
    alFallar
  );
}

export function cambiarFavorito(uid, destinoId, activo) {
  const favRef = ref(db, `${RUTAS.favoritos(uid)}/${destinoId}`);
  return activo ? set(favRef, serverTimestamp()) : remove(favRef);
}

// ---------- Bitácora privada ----------
export function escucharBitacora(uid, alCambiar, alFallar) {
  const consulta = query(ref(db, RUTAS.bitacora(uid)), orderByChild('date'));
  return onValue(consulta, (snap) => alCambiar(aLista(snap).reverse()), alFallar);
}

export function registrarInmersion(uid, inmersion) {
  return push(ref(db, RUTAS.bitacora(uid)), limpiar({ ...inmersion, createdAt: serverTimestamp() }));
}

export function eliminarInmersion(uid, inmersionId) {
  return remove(ref(db, `${RUTAS.bitacora(uid)}/${inmersionId}`));
}

// ---------- Avistamientos de la comunidad ----------
export function escucharAvistamientos(alCambiar, alFallar, limite = 12) {
  const consulta = query(ref(db, RUTAS.avistamientos), orderByChild('createdAt'), limitToLast(limite));
  return onValue(consulta, (snap) => alCambiar(aLista(snap).reverse()), alFallar);
}

export async function publicarAvistamiento(uid, avistamiento) {
  const [especies, destinos] = await Promise.all([
    leerCatalogoComoMapa('species'),
    leerCatalogoComoMapa('destinations')
  ]);
  // Desnormalización controlada: se copian los nombres para pintar el feed
  // sin lecturas extra. Las reglas verifican que coincidan con el catálogo.
  return push(ref(db, RUTAS.avistamientos), limpiar({
    ...avistamiento,
    uid,
    speciesName: especies.get(avistamiento.speciesId)?.name,
    destinationName: destinos.get(avistamiento.destinationId)?.name,
    createdAt: serverTimestamp()
  }));
}

export function eliminarAvistamiento(avistamientoId) {
  return remove(ref(db, `${RUTAS.avistamientos}/${avistamientoId}`));
}
