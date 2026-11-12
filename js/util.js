// Utilidades de interfaz compartidas

// Escapa texto antes de insertarlo como HTML (evita inyección de código
// con datos escritos por usuarios, como alias o notas).
export function escapar(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

// 'YYYY-MM-DD' de hoy en la zona horaria local
export function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// '2026-03-14' → '14 mar 2026'
export function formatearFecha(iso) {
  const [a, m, d] = String(iso).split('-').map(Number);
  if (!a || !m || !d) return iso;
  return new Date(a, m - 1, d).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Marca de tiempo → 'hace 5 min'
export function haceCuanto(ms) {
  if (typeof ms !== 'number') return '';
  const seg = Math.max(0, Math.round((Date.now() - ms) / 1000));
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  if (seg < 60) return 'justo ahora';
  if (seg < 3600) return rtf.format(-Math.round(seg / 60), 'minute');
  if (seg < 86400) return rtf.format(-Math.round(seg / 3600), 'hour');
  return rtf.format(-Math.round(seg / 86400), 'day');
}

export function rangoTexto(r, unidad = 'm') {
  if (!r) return '';
  return r.min === r.max ? `${r.min} ${unidad}` : `${r.min}–${r.max} ${unidad}`;
}

export function refrescarIconos() {
  if (window.lucide) window.lucide.createIcons();
}

let toastTimer = null;
export function avisar(texto) {
  const el = document.getElementById('authToast');
  if (!el) return;
  el.textContent = texto;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 3500);
}
