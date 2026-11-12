// =====================================================================
// Inicialización de Firebase (un único punto para toda la página)
// Exporta: app, auth, db
// =====================================================================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js';
import { getAuth, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';
import { getDatabase, connectDatabaseEmulator } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-database.js';

// Configuración del proyecto "web-caribe". Estos valores son públicos por
// diseño: la seguridad la aportan Firebase Authentication y las reglas de
// database/database.rules.json.
const firebaseConfig = {
  apiKey: 'AIzaSyBeqxkihiCpuiUm88SOMlH19ldrUPncaaQ',
  authDomain: 'web-caribe.firebaseapp.com',
  databaseURL: 'https://web-caribe-default-rtdb.firebaseio.com',
  projectId: 'web-caribe',
  storageBucket: 'web-caribe.firebasestorage.app',
  messagingSenderId: '531276173278',
  appId: '1:531276173278:web:1ae23a7d3a5dae7783d74f',
  measurementId: 'G-9T0FVWTEEQ'
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
auth.languageCode = 'es'; // Correos de Firebase (p. ej. restablecer contraseña) en español

// Modo desarrollo: http://localhost:8093/?emuladores usa los emuladores
// locales (firebase emulators:start) en lugar del proyecto real.
export const usandoEmuladores =
  ['localhost', '127.0.0.1'].includes(location.hostname) &&
  new URLSearchParams(location.search).has('emuladores');

if (usandoEmuladores) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectDatabaseEmulator(db, '127.0.0.1', 9000);
  console.info('[Firebase] Usando emuladores locales (Auth :9099, Database :9000)');
} else {
  // Analytics se carga aparte: si un bloqueador lo impide, el resto sigue funcionando.
  import('https://www.gstatic.com/firebasejs/13.3.0/firebase-analytics.js')
    .then(async ({ getAnalytics, isSupported }) => {
      if (await isSupported()) getAnalytics(app);
    })
    .catch(() => console.info('Firebase Analytics no está disponible en este navegador.'));
}
