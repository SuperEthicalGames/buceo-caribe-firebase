// =====================================================================
// Módulo de acceso — Firebase Authentication (correo y contraseña)
// Exporta abrirModalAcceso() para que otras secciones pidan iniciar sesión.
// =====================================================================
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';
import { auth } from './firebase.js';
import { avisar } from './util.js';

// ---------- Referencias al DOM ----------
const $ = (id) => document.getElementById(id);
const navAuth = $('navAuth');
const openAuthBtn = $('openAuthBtn');
const navUser = $('navUser');
const overlay = $('authModalOverlay');
const form = $('authForm');
const emailInput = $('authEmail');
const passwordInput = $('authPassword');
const confirmInput = $('authConfirm');
const togglePassBtn = $('togglePassBtn');
const messageBox = $('authMessage');
const submitBtn = $('authSubmit');
const tabs = [$('tabLogin'), $('tabRegister')];

// ---------- Textos de cada modo de la ventana ----------
const MODOS = {
  login: {
    titulo: 'Inicia sesión',
    descripcion: 'Accede con tu correo electrónico y contraseña.',
    boton: 'Entrar',
    autocompletar: 'current-password'
  },
  register: {
    titulo: 'Crea tu cuenta',
    descripcion: 'Regístrate con tu correo electrónico y una contraseña de al menos 6 caracteres.',
    boton: 'Crear cuenta',
    autocompletar: 'new-password'
  },
  reset: {
    titulo: 'Recupera tu contraseña',
    descripcion: 'Escribe tu correo y te enviaremos un enlace para crear una contraseña nueva.',
    boton: 'Enviar enlace',
    autocompletar: 'current-password'
  }
};

// Errores de Firebase traducidos a mensajes claros en español
const ERRORES = {
  'auth/invalid-email': 'El correo electrónico no tiene un formato válido.',
  'auth/missing-email': 'Escribe tu correo electrónico.',
  'auth/missing-password': 'Escribe tu contraseña.',
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/invalid-login-credentials': 'Correo o contraseña incorrectos.',
  'auth/wrong-password': 'Correo o contraseña incorrectos.',
  'auth/user-not-found': 'Correo o contraseña incorrectos.',
  'auth/user-disabled': 'Esta cuenta está deshabilitada.',
  'auth/email-already-in-use': 'Ya existe una cuenta con este correo. Inicia sesión o recupera tu contraseña.',
  'auth/weak-password': 'La contraseña es muy débil: usa al menos 6 caracteres.',
  'auth/password-does-not-meet-requirements': 'La contraseña no cumple los requisitos de seguridad del proyecto.',
  'auth/too-many-requests': 'Demasiados intentos seguidos. Espera unos minutos e inténtalo de nuevo.',
  'auth/network-request-failed': 'No hay conexión con el servidor. Revisa tu conexión a internet.',
  'auth/operation-not-allowed': 'El acceso con correo y contraseña no está habilitado en la consola de Firebase.'
};
const traducirError = (err) =>
  ERRORES[err?.code] || 'No se pudo completar la operación. Inténtalo de nuevo.';

// ---------- Utilidades de interfaz ----------
let modoActual = 'login';
let ultimoFoco = null;

function mostrarMensaje(texto, tipo) {
  messageBox.textContent = texto;
  messageBox.className = 'auth-message ' + (tipo === 'success' ? 'is-success' : 'is-error');
}

function limpiarMensaje() {
  messageBox.textContent = '';
  messageBox.className = 'auth-message';
  [emailInput, passwordInput, confirmInput].forEach((el) => el.removeAttribute('aria-invalid'));
}

function marcarCampo(input, texto) {
  mostrarMensaje(texto, 'error');
  input.setAttribute('aria-invalid', 'true');
  input.focus();
}

function setCargando(cargando) {
  submitBtn.disabled = cargando;
  submitBtn.classList.toggle('is-loading', cargando);
  submitBtn.setAttribute('aria-busy', String(cargando));
}

function mostrarContrasena(mostrar) {
  const tipo = mostrar ? 'text' : 'password';
  passwordInput.type = tipo;
  confirmInput.type = tipo;
  togglePassBtn.setAttribute('aria-pressed', String(mostrar));
  togglePassBtn.setAttribute('aria-label', mostrar ? 'Ocultar contraseña' : 'Mostrar contraseña');
  togglePassBtn.querySelector('[data-icon="show"]').hidden = mostrar;
  togglePassBtn.querySelector('[data-icon="hide"]').hidden = !mostrar;
}

// Cambia entre "login", "register" y "reset"
function setModo(modo) {
  modoActual = modo;
  const cfg = MODOS[modo];
  $('authTitle').textContent = cfg.titulo;
  $('authLead').textContent = cfg.descripcion;
  $('authSubmitLabel').textContent = cfg.boton;
  passwordInput.setAttribute('autocomplete', cfg.autocompletar);

  $('authTabs').hidden = modo === 'reset';
  $('fieldPassword').hidden = modo === 'reset';
  $('authPasswordHint').hidden = modo !== 'register';
  $('fieldConfirm').hidden = modo !== 'register';
  $('rowForgot').hidden = modo !== 'login';
  $('backToLoginBtn').hidden = modo !== 'reset';

  tabs.forEach((tab) => {
    const activa = tab.dataset.mode === modo;
    tab.setAttribute('aria-selected', String(activa));
    tab.tabIndex = activa ? 0 : -1;
  });

  confirmInput.value = '';
  mostrarContrasena(false);
  limpiarMensaje();
}

export function abrirModalAcceso(modo = 'login') {
  ultimoFoco = document.activeElement;
  form.reset();
  setModo(modo);
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  setTimeout(() => emailInput.focus(), 50);
}

function cerrarModal() {
  if (!overlay.classList.contains('active')) return;
  overlay.classList.remove('active');
  document.body.style.overflow = '';
  setCargando(false);
  if (ultimoFoco && document.contains(ultimoFoco)) ultimoFoco.focus();
}

// ---------- Validación antes de llamar a Firebase ----------
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Devuelve [campo, mensaje] si hay un error, o null si todo está bien
function validar(email, password, confirmacion) {
  if (!email) return [emailInput, 'Escribe tu correo electrónico.'];
  if (!EMAIL_VALIDO.test(email)) return [emailInput, 'El correo electrónico no tiene un formato válido.'];
  if (modoActual === 'reset') return null;
  if (!password) return [passwordInput, 'Escribe tu contraseña.'];
  if (modoActual === 'register') {
    if (password.length < 6) return [passwordInput, 'La contraseña debe tener al menos 6 caracteres.'];
    if (password !== confirmacion) return [confirmInput, 'Las contraseñas no coinciden.'];
  }
  return null;
}

// ---------- Envío del formulario: login, registro o recuperación ----------
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  limpiarMensaje();

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const error = validar(email, password, confirmInput.value);
  if (error) {
    marcarCampo(...error);
    return;
  }

  setCargando(true);
  try {
    if (modoActual === 'login') {
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      cerrarModal();
      avisar(`Sesión iniciada: ${user.email}`);
    } else if (modoActual === 'register') {
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      cerrarModal();
      avisar(`Cuenta creada para ${user.email}. ¡Te damos la bienvenida a bordo!`);
    } else {
      await sendPasswordResetEmail(auth, email);
      mostrarMensaje('Si existe una cuenta con ese correo, recibirás un enlace para restablecer la contraseña. Revisa también la carpeta de spam.', 'success');
    }
  } catch (err) {
    console.error('[Firebase Auth]', err.code, err.message);
    mostrarMensaje(traducirError(err), 'error');
  } finally {
    setCargando(false);
  }
});

// ---------- Estado de la sesión en la cabecera ----------
onAuthStateChanged(auth, (user) => {
  navAuth.dataset.state = user ? 'in' : 'out';
  navAuth.querySelector('.nav-auth-skeleton').hidden = true;
  openAuthBtn.hidden = Boolean(user);
  navUser.hidden = !user;

  if (user) {
    $('navUserEmail').textContent = user.email;
    $('navUserEmail').title = user.email;
    $('navUserAvatar').textContent = (user.email || '?').charAt(0);
  }
});

$('signOutBtn').addEventListener('click', async () => {
  try {
    await signOut(auth);
    avisar('Sesión cerrada. ¡Buenas inmersiones!');
  } catch (err) {
    console.error('[Firebase Auth]', err.code, err.message);
    avisar('No se pudo cerrar la sesión. Inténtalo de nuevo.');
  }
});

// ---------- Interacción de la ventana ----------
openAuthBtn.addEventListener('click', () => abrirModalAcceso('login'));
$('authCloseBtn').addEventListener('click', cerrarModal);
$('forgotBtn').addEventListener('click', () => {
  setModo('reset');
  emailInput.focus();
});
$('backToLoginBtn').addEventListener('click', () => {
  setModo('login');
  emailInput.focus();
});
togglePassBtn.addEventListener('click', () => mostrarContrasena(passwordInput.type === 'password'));

[emailInput, passwordInput, confirmInput].forEach((input) =>
  input.addEventListener('input', () => input.removeAttribute('aria-invalid'))
);

// Pestañas: clic y flechas izquierda/derecha
tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => setModo(tab.dataset.mode));
  tab.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const siguiente = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    setModo(siguiente.dataset.mode);
    siguiente.focus();
  });
});

// Cerrar con clic fuera de la ventana o con Escape; mantener el foco dentro
overlay.addEventListener('click', (e) => {
  if (e.target === overlay) cerrarModal();
});
window.addEventListener('keydown', (e) => {
  if (!overlay.classList.contains('active')) return;
  if (e.key === 'Escape') {
    cerrarModal();
    return;
  }
  if (e.key !== 'Tab') return;
  const enfocables = [...overlay.querySelectorAll('button, input')]
    .filter((el) => !el.disabled && el.offsetParent !== null && el.tabIndex !== -1);
  const primero = enfocables[0];
  const ultimo = enfocables[enfocables.length - 1];
  if (e.shiftKey && document.activeElement === primero) {
    e.preventDefault();
    ultimo.focus();
  } else if (!e.shiftKey && document.activeElement === ultimo) {
    e.preventDefault();
    primero.focus();
  }
});
