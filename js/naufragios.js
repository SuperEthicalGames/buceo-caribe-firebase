// =====================================================================
// Sección "Naufragios": se pinta a partir de catalog/wrecks, uniendo
// cada naufragio con su destino y la certificación mínima recomendada.
// =====================================================================
import { leerCatalogo, leerCatalogoComoMapa } from './data.js';
import { escapar, rangoTexto } from './util.js';

const grid = document.getElementById('wrecksGrid');
const filtros = document.getElementById('wreckFilters');
const estado = document.getElementById('wrecksStatus');

const CAUSAS = {
  'arrecife-artificial': 'Hundido como arrecife artificial',
  accidente: 'Naufragio accidental',
  tormenta: 'Naufragio por tormenta',
  desconocida: 'Causa no documentada'
};

let naufragios = [];
let destinos = new Map();
let certificaciones = new Map();
let filtroActual = 'all';

function tarjeta(w) {
  const destino = destinos.get(w.destinationId);
  const datos = [
    ['Profundidad', rangoTexto(w.depthRangeM)],
    ['Eslora', w.lengthM ? `${w.lengthM} m` : ''],
    ['Nivel mínimo', certificaciones.get(w.minCertificationId)?.name ?? '']
  ].filter(([, v]) => v);

  return `
    <article class="wreck-card ${w.cause === 'tormenta' ? 'is-historic' : ''}">
      <div class="wreck-head">
        <span class="dossier-meta">${escapar(destino?.name ?? w.destinationId)}</span>
        <span class="wreck-year">${w.sunkYear ? escapar(w.sunkYear) : 'Año s/d'}</span>
      </div>
      <h3 class="wreck-name">${escapar(w.name)}</h3>
      <p class="wreck-type">${escapar(w.vesselType)} · ${escapar(CAUSAS[w.cause] ?? w.cause)}</p>
      <p class="wreck-summary">${escapar(w.summary)}</p>
      ${datos.length ? `<dl class="wreck-facts">${datos.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapar(v)}</dd></div>`).join('')}</dl>` : ''}
    </article>`;
}

function pintar() {
  const visibles = filtroActual === 'all' ? naufragios : naufragios.filter((w) => w.destinationId === filtroActual);
  grid.innerHTML = visibles.map(tarjeta).join('');
  filtros.querySelectorAll('.filter-btn').forEach((b) => {
    const activo = b.dataset.destino === filtroActual;
    b.classList.toggle('active', activo);
    b.setAttribute('aria-pressed', String(activo));
  });
}

function pintarFiltros() {
  const conNaufragios = [...new Set(naufragios.map((w) => w.destinationId))]
    .map((id) => destinos.get(id))
    .filter(Boolean)
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

  filtros.innerHTML = [
    `<button type="button" class="filter-btn" data-destino="all">Todos (${naufragios.length})</button>`,
    ...conNaufragios.map((d) => {
      const total = naufragios.filter((w) => w.destinationId === d.id).length;
      return `<button type="button" class="filter-btn" data-destino="${escapar(d.id)}">${escapar(d.name)} (${total})</button>`;
    })
  ].join('');
}

filtros.addEventListener('click', (e) => {
  const boton = e.target.closest('.filter-btn');
  if (!boton) return;
  filtroActual = boton.dataset.destino;
  pintar();
});

async function cargar() {
  estado.textContent = 'Cargando naufragios desde la base de datos…';
  estado.classList.remove('is-error');
  try {
    [naufragios, destinos, certificaciones] = await Promise.all([
      leerCatalogo('wrecks'),
      leerCatalogoComoMapa('destinations'),
      leerCatalogoComoMapa('certifications')
    ]);
    if (!naufragios.length) {
      grid.innerHTML = '';
      estado.textContent = 'Todavía no hay naufragios cargados en la base de datos.';
      return;
    }
    pintarFiltros();
    pintar();
    const totalDestinos = new Set(naufragios.map((w) => w.destinationId)).size;
    estado.textContent = `${naufragios.length} naufragios en ${totalDestinos} destinos · Datos de Firebase Realtime Database (catalog/wrecks).`;
  } catch (err) {
    console.error('[Naufragios]', err);
    grid.innerHTML = '';
    estado.classList.add('is-error');
    estado.innerHTML = 'No se pudo cargar el catálogo de naufragios. <button type="button" class="auth-link" id="wrecksRetry">Reintentar</button>';
    document.getElementById('wrecksRetry').addEventListener('click', cargar);
  }
}

cargar();
