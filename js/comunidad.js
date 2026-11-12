// =====================================================================
// Sección "Comunidad"
//   · Avistamientos en vivo (sightings): lectura pública, publicar con sesión.
//   · Bitácora personal (diveLogs/{uid}): privada, solo la ve su dueño.
//   · Destinos favoritos (favorites/{uid}): botón en cada ficha de destino.
// =====================================================================
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';
import { auth } from './firebase.js';
import * as datos from './data.js';
import { abrirModalAcceso } from './auth.js';
import { escapar, hoyISO, formatearFecha, haceCuanto, avisar, refrescarIconos } from './util.js';

const $ = (id) => document.getElementById(id);

const GASES = { aire: 'Aire', nitrox32: 'Nitrox 32 %', nitrox36: 'Nitrox 36 %', trimix: 'Trimix' };

let usuario = null;
let perfil = {};
let especies = new Map();
let destinos = new Map();
let sitios = [];
let avistamientos = [];
let inmersiones = [];
let favoritos = new Set();
let suscripcionesUsuario = [];

// ---------- Utilidades de formulario ----------
const numero = (v) => (String(v).trim() === '' ? undefined : Number(v));

function mensaje(id, texto, tipo = 'error') {
  const el = $(id);
  el.textContent = texto;
  el.className = 'auth-message ' + (texto ? (tipo === 'success' ? 'is-success' : 'is-error') : '');
}

function ocupado(botonId, activo) {
  const b = $(botonId);
  b.disabled = activo;
  b.classList.toggle('is-loading', activo);
}

function validarComun({ date, destinationId }) {
  if (!destinationId) return 'Selecciona un destino.';
  if (!date) return 'Indica la fecha.';
  if (date > hoyISO()) return 'La fecha no puede ser futura.';
  if (date < '1950-01-01') return 'Revisa la fecha.';
  return null;
}

// ---------- Catálogo para los formularios ----------
async function prepararFormularios() {
  [especies, destinos, sitios] = await Promise.all([
    datos.leerCatalogoComoMapa('species'),
    datos.leerCatalogoComoMapa('destinations'),
    datos.leerCatalogo('diveSites')
  ]);

  const opcionesDestino = '<option value="">Selecciona un destino…</option>' +
    [...destinos.values()].map((d) => `<option value="${escapar(d.id)}">${escapar(d.name)}</option>`).join('');
  $('sDestination').innerHTML = opcionesDestino;
  $('lDestination').innerHTML = opcionesDestino;

  const listaEspecies = [...especies.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  $('sSpecies').innerHTML = '<option value="">Selecciona una especie…</option>' +
    listaEspecies.map((s) => `<option value="${escapar(s.id)}">${escapar(s.name)} (${escapar(s.scientificName)})</option>`).join('');
  $('lSpecies').innerHTML = listaEspecies
    .map((s) => `<label class="check-chip"><input type="checkbox" value="${escapar(s.id)}"><span>${escapar(s.name)}</span></label>`)
    .join('');

  for (const id of ['sDate', 'lDate']) {
    $(id).max = hoyISO();
    $(id).value = hoyISO();
  }

  // Si la bitácora llegó antes que el catálogo, se repinta con los nombres
  if (usuario) {
    pintarBitacora();
    pintarFavoritos();
  }
}

// Sugerencias de sitios según el destino elegido en la bitácora
$('lDestination').addEventListener('change', () => {
  const destino = $('lDestination').value;
  $('lSiteOptions').innerHTML = sitios
    .filter((s) => s.destinationId === destino)
    .map((s) => `<option value="${escapar(s.name)}"></option>`)
    .join('');
});

// =====================================================================
// Avistamientos en vivo
// =====================================================================
function pintarAvistamientos() {
  const feed = $('sightingsFeed');
  $('sightingsCount').textContent = avistamientos.length
    ? `${avistamientos.length} recientes`
    : 'Sin registros';

  if (!avistamientos.length) {
    feed.innerHTML = '<li class="feed-empty">Aún no hay avistamientos. ¡Comparte el primero!</li>';
    return;
  }
  feed.innerHTML = avistamientos.map((a) => `
    <li class="feed-item">
      <div class="feed-main">
        <strong>${escapar(a.speciesName)}</strong>
        ${a.count > 1 ? `<span class="tag">×${escapar(a.count)}</span>` : ''}
        <span class="feed-place">en ${escapar(a.destinationName)}</span>
      </div>
      <div class="feed-meta">
        ${escapar(formatearFecha(a.date))}${a.depthM !== undefined ? ` · ${escapar(a.depthM)} m` : ''}
        · por ${escapar(a.alias)} · ${escapar(haceCuanto(a.createdAt))}
      </div>
      ${a.notes ? `<p class="feed-notes">${escapar(a.notes)}</p>` : ''}
      ${usuario && a.uid === usuario.uid
        ? `<button type="button" class="auth-link feed-delete" data-id="${escapar(a.id)}">Eliminar</button>`
        : ''}
    </li>`).join('');
}

datos.escucharAvistamientos(
  (lista) => {
    avistamientos = lista;
    $('sightingsStatus').textContent = '';
    pintarAvistamientos();
  },
  (err) => {
    console.error('[Avistamientos]', err);
    $('sightingsStatus').textContent = 'No se pudieron cargar los avistamientos.';
  }
);
setInterval(pintarAvistamientos, 60_000); // refresca los "hace X min"

$('sightingsFeed').addEventListener('click', async (e) => {
  const boton = e.target.closest('.feed-delete');
  if (!boton || !confirm('¿Eliminar este avistamiento?')) return;
  try {
    await datos.eliminarAvistamiento(boton.dataset.id);
    avisar('Avistamiento eliminado.');
  } catch (err) {
    avisar(datos.describirError(err));
  }
});

$('sightingForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!usuario) return abrirModalAcceso('login');

  const av = {
    alias: $('sAlias').value.trim(),
    speciesId: $('sSpecies').value,
    destinationId: $('sDestination').value,
    date: $('sDate').value,
    depthM: numero($('sDepth').value),
    count: numero($('sCount').value),
    notes: $('sNotes').value.trim()
  };

  const error =
    (av.alias.length < 2 || av.alias.length > 30 || /[<>]/.test(av.alias) ? 'El alias debe tener entre 2 y 30 caracteres, sin < ni >.' : null) ||
    (!av.speciesId ? 'Selecciona la especie que viste.' : null) ||
    validarComun(av) ||
    (av.depthM !== undefined && !(av.depthM >= 0 && av.depthM <= 130) ? 'La profundidad debe estar entre 0 y 130 m.' : null) ||
    (av.count !== undefined && !(Number.isInteger(av.count) && av.count >= 1 && av.count <= 500) ? 'La cantidad debe ser un número entero entre 1 y 500.' : null);
  if (error) return mensaje('sMessage', error);

  mensaje('sMessage', '');
  ocupado('sSubmit', true);
  try {
    await datos.publicarAvistamiento(usuario.uid, av);
    if (av.alias !== perfil.alias) {
      await datos.guardarAlias(usuario.uid, av.alias);
      perfil.alias = av.alias;
    }
    for (const id of ['sSpecies', 'sDepth', 'sNotes']) $(id).value = '';
    $('sCount').value = '1';
    avisar('¡Avistamiento publicado para toda la comunidad!');
  } catch (err) {
    console.error('[Avistamientos]', err);
    mensaje('sMessage', datos.describirError(err));
  } finally {
    ocupado('sSubmit', false);
  }
});

// =====================================================================
// Bitácora privada
// =====================================================================
function pintarBitacora() {
  const total = inmersiones.length;
  const maxProf = total ? Math.max(...inmersiones.map((i) => i.maxDepthM)) : 0;
  const minutos = inmersiones.reduce((s, i) => s + i.bottomTimeMin, 0);
  const lugares = new Set(inmersiones.map((i) => i.destinationId)).size;
  const horas = `${Math.floor(minutos / 60)} h ${minutos % 60} min`;

  $('logStats').innerHTML = [
    ['Inmersiones', total],
    ['Profundidad máx.', `${maxProf} m`],
    ['Tiempo bajo el agua', horas],
    ['Destinos', lugares]
  ].map(([k, v]) => `<div class="stat-tile"><span class="stat-label">${k}</span><span class="stat-value">${escapar(v)}</span></div>`).join('');

  const lista = $('logList');
  if (!total) {
    lista.innerHTML = '<li class="feed-empty">Tu bitácora está vacía. Registra tu primera inmersión con el formulario.</li>';
    return;
  }
  lista.innerHTML = inmersiones.map((i) => {
    const destino = destinos.get(i.destinationId)?.name ?? i.destinationId;
    const vistas = Object.keys(i.speciesIds || {}).map((id) => especies.get(id)?.name ?? id);
    const etiquetas = [
      `${i.maxDepthM} m`, `${i.bottomTimeMin} min`, GASES[i.gas],
      i.waterTempC !== undefined ? `${i.waterTempC} °C` : '',
      i.visibilityM !== undefined ? `Visib. ${i.visibilityM} m` : ''
    ].filter(Boolean);
    return `
      <li class="log-item">
        <div class="log-body">
          <div class="log-title">
            <strong>${escapar(i.siteName || destino)}</strong>
            <span class="dossier-meta">${escapar(formatearFecha(i.date))} · ${escapar(destino)}</span>
          </div>
          <div class="tag-cluster">${etiquetas.map((t) => `<span class="tag">${escapar(t)}</span>`).join('')}</div>
          ${i.rating ? `<div class="log-rating" aria-label="Valoración: ${i.rating} de 5">${'★'.repeat(i.rating)}${'☆'.repeat(5 - i.rating)}</div>` : ''}
          ${vistas.length ? `<p class="log-species"><strong>Especies:</strong> ${vistas.map(escapar).join(', ')}</p>` : ''}
          ${i.notes ? `<p class="feed-notes">${escapar(i.notes)}</p>` : ''}
        </div>
        <button type="button" class="log-delete" data-id="${escapar(i.id)}" aria-label="Eliminar la inmersión del ${escapar(formatearFecha(i.date))}">
          <i data-lucide="trash-2" aria-hidden="true"></i>
        </button>
      </li>`;
  }).join('');
  refrescarIconos();
}

$('logList').addEventListener('click', async (e) => {
  const boton = e.target.closest('.log-delete');
  if (!boton || !usuario || !confirm('¿Eliminar esta inmersión de tu bitácora?')) return;
  try {
    await datos.eliminarInmersion(usuario.uid, boton.dataset.id);
    avisar('Inmersión eliminada.');
  } catch (err) {
    avisar(datos.describirError(err));
  }
});

$('logForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!usuario) return abrirModalAcceso('login');

  const especiesVistas = [...$('lSpecies').querySelectorAll('input:checked')].map((c) => c.value);
  const inmersion = {
    date: $('lDate').value,
    destinationId: $('lDestination').value,
    siteName: $('lSite').value.trim(),
    maxDepthM: numero($('lDepth').value),
    bottomTimeMin: numero($('lTime').value),
    waterTempC: numero($('lTemp').value),
    visibilityM: numero($('lVis').value),
    gas: $('lGas').value,
    rating: numero($('lRating').value),
    speciesIds: especiesVistas.length ? Object.fromEntries(especiesVistas.map((id) => [id, true])) : undefined,
    notes: $('lNotes').value.trim()
  };

  const error =
    validarComun(inmersion) ||
    (!(inmersion.maxDepthM > 0 && inmersion.maxDepthM <= 130) ? 'La profundidad máxima debe estar entre 1 y 130 m.' : null) ||
    (!(inmersion.bottomTimeMin > 0 && inmersion.bottomTimeMin <= 300) ? 'El tiempo de fondo debe estar entre 1 y 300 minutos.' : null) ||
    (inmersion.waterTempC !== undefined && !(inmersion.waterTempC >= 10 && inmersion.waterTempC <= 40) ? 'La temperatura debe estar entre 10 y 40 °C.' : null) ||
    (inmersion.visibilityM !== undefined && !(inmersion.visibilityM >= 0 && inmersion.visibilityM <= 80) ? 'La visibilidad debe estar entre 0 y 80 m.' : null) ||
    (inmersion.siteName.length > 80 ? 'El nombre del sitio admite hasta 80 caracteres.' : null);
  if (error) return mensaje('lMessage', error);

  mensaje('lMessage', '');
  ocupado('lSubmit', true);
  try {
    await datos.registrarInmersion(usuario.uid, inmersion);
    $('logForm').reset();
    $('lDate').value = hoyISO();
    avisar('Inmersión guardada en tu bitácora.');
  } catch (err) {
    console.error('[Bitácora]', err);
    mensaje('lMessage', datos.describirError(err));
  } finally {
    ocupado('lSubmit', false);
  }
});

// =====================================================================
// Destinos favoritos (botón en cada ficha de destino)
// =====================================================================
function prepararBotonesFavoritos() {
  document.querySelectorAll('#destGrid .destination-card').forEach((card) => {
    const ficha = card.querySelector('[onclick*="openDestinationModal"]');
    const id = ficha?.getAttribute('onclick').match(/openDestinationModal\('([^']+)'\)/)?.[1];
    if (!id || card.querySelector('.fav-btn')) return;
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'fav-btn';
    boton.dataset.destino = id;
    boton.setAttribute('aria-pressed', 'false');
    boton.innerHTML = '<i data-lucide="star" aria-hidden="true"></i><span>Guardar en favoritos</span>';
    ficha.insertAdjacentElement('afterend', boton);
  });
  refrescarIconos();
}

function actualizarBotonesFavoritos() {
  document.querySelectorAll('.fav-btn').forEach((b) => {
    const activo = favoritos.has(b.dataset.destino);
    b.setAttribute('aria-pressed', String(activo));
    b.querySelector('span').textContent = activo ? 'En tus favoritos' : 'Guardar en favoritos';
  });
}

function pintarFavoritos() {
  const lista = [...favoritos].map((id) => destinos.get(id)).filter(Boolean);
  $('favoritesList').innerHTML = lista.length
    ? lista.map((d) => `<button type="button" class="filter-btn" data-destino="${escapar(d.id)}">★ ${escapar(d.name)}</button>`).join('')
    : '<span class="feed-empty">Marca destinos con la estrella en sus fichas para verlos aquí.</span>';
}

document.addEventListener('click', async (e) => {
  const boton = e.target.closest('.fav-btn');
  if (!boton) return;
  if (!usuario) {
    avisar('Inicia sesión para guardar destinos favoritos.');
    return abrirModalAcceso('login');
  }
  const id = boton.dataset.destino;
  try {
    await datos.cambiarFavorito(usuario.uid, id, !favoritos.has(id));
  } catch (err) {
    avisar(datos.describirError(err));
  }
});

$('favoritesList').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-destino]');
  if (chip && typeof window.openDestinationModal === 'function') window.openDestinationModal(chip.dataset.destino);
});

// =====================================================================
// Sesión: activa o desactiva las partes privadas
// =====================================================================
for (const id of ['sightingLoginBtn', 'logbookLoginBtn']) {
  $(id).addEventListener('click', () => abrirModalAcceso('login'));
}

onAuthStateChanged(auth, async (user) => {
  suscripcionesUsuario.forEach((cancelar) => cancelar());
  suscripcionesUsuario = [];
  usuario = user;
  perfil = {};
  favoritos = new Set();
  inmersiones = [];

  $('sightingCta').hidden = Boolean(user);
  $('sightingForm').hidden = !user;
  $('logbookCta').hidden = Boolean(user);
  $('logbookContent').hidden = !user;
  pintarAvistamientos();
  actualizarBotonesFavoritos();
  if (!user) return;

  const uid = user.uid;
  const siSigueActivo = (fn) => (...args) => { if (usuario?.uid === uid) fn(...args); };

  try {
    perfil = await datos.registrarAcceso(uid);
    if (perfil.alias) $('sAlias').value = perfil.alias;
  } catch (err) {
    console.error('[Perfil]', err);
  }

  suscripcionesUsuario.push(
    datos.escucharBitacora(uid,
      siSigueActivo((lista) => {
        inmersiones = lista;
        $('logStatus').textContent = '';
        pintarBitacora();
      }),
      siSigueActivo((err) => {
        console.error('[Bitácora]', err);
        $('logStatus').textContent = 'No se pudo cargar tu bitácora.';
      })
    ),
    datos.escucharFavoritos(uid,
      siSigueActivo((set) => {
        favoritos = set;
        actualizarBotonesFavoritos();
        pintarFavoritos();
      }),
      siSigueActivo((err) => console.error('[Favoritos]', err))
    )
  );
});

// ---------- Inicio ----------
prepararBotonesFavoritos();
prepararFormularios().catch((err) => {
  console.error('[Comunidad]', err);
  $('sightingsStatus').textContent = 'No se pudo cargar el catálogo para los formularios.';
});
