// =====================================================================
// Generador del catálogo de Realtime Database (seed)
// ---------------------------------------------------------------------
// Uso:   node database/build-seed.mjs
// Salida: database/seed.json  →  nodos /meta, /catalog y /indexes
//
// Este archivo es la ÚNICA fuente de verdad del contenido editorial.
// El script:
//   1. Valida la integridad referencial (cada id referenciado existe).
//   2. Valida enumerados, campos obligatorios y rangos numéricos.
//   3. Deriva los índices inversos (/indexes) a partir de las relaciones,
//      para que nunca queden desincronizados a mano.
// Si algo no cuadra, el script falla y NO genera el archivo.
// =====================================================================

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------
// Enumerados controlados (deben coincidir con database.rules.json y js/)
// ---------------------------------------------------------------------
const ENUM = {
  status: ['published', 'draft'],
  siteType: ['pared', 'arrecife', 'pecio', 'orilla', 'deriva', 'nocturno', 'bajo-arenoso'],
  speciesGroup: ['reptil', 'pez', 'elasmobranquio', 'invertebrado', 'coral', 'esponja'],
  speciesCategory: ['reptil-pelagico', 'peces-arrecife', 'invertebrados'],
  iucnStatus: ['CR', 'EN', 'VU', 'NT', 'LC', 'DD'],
  wreckCause: ['arrecife-artificial', 'accidente', 'tormenta', 'desconocida'],
  modeLevel: ['recreativo', 'avanzado', 'tecnico'],
  sourceType: ['gobierno', 'organizacion', 'certificadora', 'turismo']
};

// ---------------------------------------------------------------------
// 1. Regiones y países
// ---------------------------------------------------------------------
const regions = {
  'caribe-suroccidental': { name: 'Caribe suroccidental', order: 1, summary: 'Archipiélago de San Andrés, Providencia y Santa Catalina, núcleo de la Reserva de Biosfera Seaflower.' },
  'caribe-sur': { name: 'Caribe sur', order: 2, summary: 'Costa continental de Colombia y las islas ABC (Aruba, Bonaire y Curazao).' },
  'arrecife-mesoamericano': { name: 'Sistema Arrecifal Mesoamericano', order: 3, summary: 'Segunda barrera de coral más grande del mundo: de Yucatán (México) a las Islas de la Bahía (Honduras).' },
  'caribe-central': { name: 'Caribe central', order: 4, summary: 'Islas oceánicas con paredes que caen a grandes profundidades, como las Islas Caimán.' },
  'antillas-mayores': { name: 'Antillas Mayores', order: 5, summary: 'Cuba, La Española, Jamaica y Puerto Rico: gran concentración de pecios accesibles.' }
};

const countries = {
  co: { name: 'Colombia' },
  mx: { name: 'México' },
  bq: { name: 'Caribe Neerlandés' },
  ky: { name: 'Islas Caimán' },
  hn: { name: 'Honduras' },
  do: { name: 'República Dominicana' }
};

// ---------------------------------------------------------------------
// 2. Fuentes (referenciadas con sourceIds)
// ---------------------------------------------------------------------
const sources = {
  noaa: { name: 'NOAA (National Oceanic and Atmospheric Administration)', type: 'gobierno', url: 'https://www.noaa.gov' },
  'pnuma-cep': { name: 'PNUMA - Programa Ambiental del Caribe', type: 'organizacion', url: 'https://www.unep.org/cep/' },
  padi: { name: 'PADI Worldwide & PADI AWARE', type: 'certificadora', url: 'https://www.padi.com' },
  'colombia-travel': { name: 'Colombia Travel (MinCIT)', type: 'turismo', url: 'https://colombia.travel' },
  minambiente: { name: 'Ministerio de Ambiente de Colombia', type: 'gobierno', url: 'https://www.minambiente.gov.co' },
  'roatan-marine-park': { name: 'Iniciativa Blue Parks & Roatan Marine Park', type: 'organizacion', url: 'https://www.roatanmarinepark.org' }
};

// ---------------------------------------------------------------------
// 3. Certificaciones y modalidades
// ---------------------------------------------------------------------
const certifications = {
  'open-water': { name: 'Open Water Diver', order: 1, maxDepthM: 18, summary: 'Nivel inicial: inmersiones autónomas con un compañero hasta 18 m.' },
  'advanced-open-water': { name: 'Advanced Open Water Diver', order: 2, maxDepthM: 30, prerequisiteId: 'open-water', summary: 'Amplía el límite a 30 m e introduce navegación, buceo profundo y nocturno.' },
  deep: { name: 'Especialidad de buceo profundo', order: 3, maxDepthM: 40, prerequisiteId: 'advanced-open-water', summary: 'Planificación y gestión de gas hasta el límite recreativo de 40 m.' },
  nitrox: { name: 'Aire enriquecido (Nitrox)', order: 4, prerequisiteId: 'open-water', summary: 'Uso de mezclas con más oxígeno (normalmente 32 % o 36 %) para reducir la carga de nitrógeno.' },
  wreck: { name: 'Especialidad de pecios', order: 5, prerequisiteId: 'open-water', summary: 'Técnicas de navegación exterior y, con formación adicional, penetración en barcos hundidos.' },
  rescue: { name: 'Rescue Diver', order: 6, prerequisiteId: 'advanced-open-water', summary: 'Prevención y gestión de emergencias, autorrescate y rescate de compañeros.' },
  divemaster: { name: 'Divemaster', order: 7, prerequisiteId: 'rescue', summary: 'Primer nivel profesional: guía de buceadores certificados y asistencia a instructores.' },
  tec: { name: 'Buceo técnico', order: 8, prerequisiteId: 'deep', summary: 'Inmersiones más allá de 40 m o con descompresión obligatoria, con mezclas como Trimix.' }
};

const diveModes = {
  recreativo: { name: 'Buceo recreativo sin paradas', level: 'recreativo', order: 1, minCertificationId: 'open-water', summary: 'De 18 m (Open Water) a 30-40 m (Advanced), siempre dentro del límite de no descompresión.' },
  deriva: { name: 'Buceo de deriva', level: 'avanzado', order: 2, minCertificationId: 'advanced-open-water', summary: 'La corriente transporta al buceador a lo largo del arrecife; la embarcación lo sigue en superficie.' },
  orilla: { name: 'Buceo desde la orilla', level: 'recreativo', order: 3, minCertificationId: 'open-water', summary: 'Entrada directa desde la costa a arrecifes de franja cercanos, sin necesidad de barco.' },
  nocturno: { name: 'Buceo nocturno', level: 'avanzado', order: 4, minCertificationId: 'advanced-open-water', summary: 'Revela pólipos abiertos y depredadores cazando; exige foco primario, de respaldo y luz de posición.' },
  pecios: { name: 'Buceo en naufragios', level: 'avanzado', order: 5, minCertificationId: 'wreck', summary: 'Exploración de barcos hundidos; la penetración interior exige certificación, carrete y luces redundantes.' },
  apnea: { name: 'Apnea o freediving', level: 'recreativo', order: 6, summary: 'Descenso sin tanque, con una sola respiración; exige relajación y gestión del reflejo de inmersión.' },
  cavernas: { name: 'Cavernas y cuevas', level: 'tecnico', order: 7, minCertificationId: 'tec', summary: 'Caverna: con luz natural visible. Cueva: oscuridad total, línea guía continua y regla de tercios.' },
  tecnico: { name: 'Buceo técnico', level: 'tecnico', order: 8, minCertificationId: 'tec', summary: 'Más allá de 40 m o con paradas descompresivas, usando Trimix y botellas de descompresión.' }
};

// ---------------------------------------------------------------------
// 4. Especies
// ---------------------------------------------------------------------
const species = {
  'tortuga-carey': { name: 'Tortuga carey', scientificName: 'Eretmochelys imbricata', group: 'reptil', category: 'reptil-pelagico', role: 'Alimentadora de esponjas', iucnStatus: 'CR', summary: 'Se alimenta de esponjas que, sin control, asfixiarían las colonias de coral vivo.' },
  'tortuga-verde': { name: 'Tortuga verde', scientificName: 'Chelonia mydas', group: 'reptil', category: 'reptil-pelagico', role: 'Herbívora de praderas', iucnStatus: 'EN', summary: 'Pasta en las praderas de pastos marinos y ayuda a mantenerlas sanas.' },
  'raya-aguila-moteada': { name: 'Raya águila moteada', scientificName: 'Aetobatus narinari', group: 'elasmobranquio', category: 'reptil-pelagico', role: 'Pelágico acrobático', iucnStatus: 'EN', summary: 'Planea en grupos sobre paredes verticales y tritura moluscos enterrados en la arena.' },
  'tiburon-arrecife': { name: 'Tiburón de arrecife del Caribe', scientificName: 'Carcharhinus perezi', group: 'elasmobranquio', category: 'reptil-pelagico', role: 'Depredador ápice', iucnStatus: 'EN', summary: 'Regula las poblaciones de depredadores medianos; frecuente en las paredes de Providencia y Little Cayman.' },
  'pez-loro-guacamayo': { name: 'Pez loro guacamayo', scientificName: 'Scarus guacamaia', group: 'pez', category: 'peces-arrecife', role: 'Bioerosionador clave', iucnStatus: 'NT', summary: 'Raspa macroalgas que compiten con el coral y produce arena coralina blanca.' },
  'pez-angel-reina': { name: 'Pez ángel reina', scientificName: 'Holacanthus ciliaris', group: 'pez', category: 'peces-arrecife', role: 'Fauna arrecifal', iucnStatus: 'LC', summary: 'Corona azul eléctrica y cuerpo amarillo; se alimenta de esponjas y tunicados.' },
  'morena-verde': { name: 'Morena verde', scientificName: 'Gymnothorax funebris', group: 'pez', category: 'peces-arrecife', role: 'Cazador bentónico', iucnStatus: 'LC', summary: 'Su color verde proviene de una mucosa amarilla sobre piel gris azulada.' },
  'mero-guasa': { name: 'Mero guasa', scientificName: 'Epinephelus itajara', group: 'pez', category: 'peces-arrecife', role: 'Gran depredador', iucnStatus: 'VU', summary: 'El mayor mero del Atlántico; sus juveniles crecen en los manglares.' },
  'pez-sapo-esplendido': { name: 'Pez sapo espléndido', scientificName: 'Sanopus splendidus', group: 'pez', category: 'peces-arrecife', role: 'Endémico de Cozumel', endemic: true, summary: 'Solo vive en Cozumel, oculto en oquedades de arena bajo las rocas coralinas.' },
  'pez-leon': { name: 'Pez león', scientificName: 'Pterois volitans', group: 'pez', category: 'peces-arrecife', role: 'Especie invasora', invasive: true, summary: 'Depredador del Indopacífico sin enemigos naturales en el Caribe; su control es prioritario.' },
  'coral-cuerno-de-alce': { name: 'Coral cuerno de alce', scientificName: 'Acropora palmata', group: 'coral', category: 'invertebrados', role: 'Constructor arrecifal', iucnStatus: 'CR', summary: 'Estructura la zona de rompiente y disipa el oleaje; objeto de planes de restauración.' },
  'esponja-barril-gigante': { name: 'Esponja de barril gigante', scientificName: 'Xestospongia muta', group: 'esponja', category: 'invertebrados', role: 'Filtrador', summary: 'Llamada «la secuoya del arrecife»: puede vivir siglos y filtrar miles de litros al día.' },
  'caracol-pala': { name: 'Caracol pala', scientificName: 'Aliger gigas', group: 'invertebrado', category: 'invertebrados', role: 'Especie protegida', summary: 'Gasterópodo de las praderas marinas; su extracción está prohibida en San Andrés.' },
  'langosta-espinosa': { name: 'Langosta espinosa del Caribe', scientificName: 'Panulirus argus', group: 'invertebrado', category: 'invertebrados', role: 'Especie con veda', summary: 'Pasa su etapa juvenil en manglares y praderas; tiene temporadas de veda.' },
  'pulpo-de-arrecife': { name: 'Pulpo de arrecife del Caribe', scientificName: 'Octopus briareus', group: 'invertebrado', category: 'invertebrados', role: 'Cazador nocturno', summary: 'Protagonista de las inmersiones nocturnas, cuando sale a cazar entre las rocas.' }
};

// ---------------------------------------------------------------------
// 5. Ecosistemas
// ---------------------------------------------------------------------
const ecosystems = {
  'arrecifes-coralinos': { name: 'Arrecifes coralinos', order: 1, subtitle: 'Estructuras de carbonato de calcio', summary: 'Construidos por pólipos en simbiosis con zooxantelas; albergan gran parte de la biodiversidad marina del Caribe.', keySpeciesIds: ['coral-cuerno-de-alce', 'pez-loro-guacamayo', 'esponja-barril-gigante'], sourceIds: ['noaa'] },
  'praderas-pastos-marinos': { name: 'Praderas de pastos marinos', order: 2, subtitle: 'Lechos de Thalassia testudinum', summary: 'Estabilizan sedimentos, clarifican el agua y almacenan carbono azul; alimentan a tortugas verdes y manatíes.', keySpeciesIds: ['tortuga-verde', 'caracol-pala'], sourceIds: ['pnuma-cep'] },
  manglares: { name: 'Bosques de manglar', order: 3, subtitle: 'Guarderías costeras', summary: 'Las raíces del mangle rojo protegen larvas y juveniles de meros, pargos y langostas antes de migrar al arrecife.', keySpeciesIds: ['mero-guasa', 'langosta-espinosa'], sourceIds: ['pnuma-cep'] },
  'macizos-rocosos': { name: 'Macizos rocosos continentales', order: 4, subtitle: 'Afloramientos y surgencias (Tayrona)', summary: 'Paredes graníticas de la Sierra Nevada de Santa Marta bajo el mar, enriquecidas por fenómenos de surgencia.', keySpeciesIds: ['pulpo-de-arrecife'], sourceIds: ['minambiente'] },
  'complejos-karsticos': { name: 'Complejos kársticos', order: 5, subtitle: 'Cenotes y agujeros azules', summary: 'Formaciones de roca caliza disuelta, como los cenotes de Yucatán con haloclinas y espeleotemas.', keySpeciesIds: [], sourceIds: ['noaa'] }
};

// ---------------------------------------------------------------------
// 6. Destinos (los ids coinciden con las fichas de la página)
// ---------------------------------------------------------------------
const destinations = {
  'san-andres': {
    name: 'San Andrés y Providencia', countryCode: 'co', regionId: 'caribe-suroccidental', order: 1,
    summary: 'Núcleo de la Reserva de Biosfera Seaflower (UNESCO) y del «Mar de los Siete Colores».',
    description: 'Tercera barrera coralina más extensa del planeta. San Andrés ofrece logística ágil y paredes como La Pared (de 15 a más de 300 m); Providencia es remota y prístina, con tiburones de arrecife y coral negro.',
    depthRangeM: { min: 6, max: 300 }, visibilityRangeM: { min: 20, max: 35 },
    bestSeason: 'Diciembre a abril', protectedArea: 'Reserva de Biosfera Seaflower (UNESCO)',
    regulations: 'Zonificación estricta; prohibido extraer caracol pala y la pesca submarina con tanque. Monitoreo de CORALINA.',
    location: { lat: 12.58, lng: -81.7 },
    levelIds: ['open-water', 'advanced-open-water'], diveModeIds: ['recreativo', 'deriva'],
    ecosystemIds: ['arrecifes-coralinos', 'praderas-pastos-marinos', 'manglares'],
    featuredSpeciesIds: ['tiburon-arrecife', 'caracol-pala'], sourceIds: ['colombia-travel', 'minambiente']
  },
  'santa-marta': {
    name: 'Santa Marta, Taganga y P.N.N. Tayrona', countryCode: 'co', regionId: 'caribe-sur', order: 2,
    summary: 'Capital formativa de Colombia, donde la Sierra Nevada se hunde en el mar.',
    description: 'Más de 30 sitios en bahías protegidas como Granate y Calichan, rica macrofauna y la principal infraestructura hiperbárica del Caribe colombiano.',
    depthRangeM: { min: 4, max: 40 }, visibilityRangeM: { min: 8, max: 20 },
    bestSeason: 'Todo el año (mejor visibilidad fuera de la temporada de lluvias)', protectedArea: 'Parque Nacional Natural Tayrona',
    regulations: 'Áreas del parque con capacidad de carga y operadores autorizados.',
    location: { lat: 11.24, lng: -74.21 },
    levelIds: ['open-water', 'advanced-open-water'], diveModeIds: ['recreativo', 'nocturno', 'pecios'],
    ecosystemIds: ['macizos-rocosos', 'arrecifes-coralinos'],
    featuredSpeciesIds: ['pulpo-de-arrecife', 'pez-loro-guacamayo'], sourceIds: ['colombia-travel', 'minambiente']
  },
  cozumel: {
    name: 'Cozumel', countryCode: 'mx', regionId: 'arrecife-mesoamericano', order: 3,
    summary: 'Parque Nacional Arrecifes de Cozumel, célebre por el buceo de deriva.',
    description: 'La corriente del Caribe fluye de sur a norte por la costa oeste y transporta al buceador sobre muros y cañones. Hogar del pez sapo espléndido, endémico de la isla.',
    depthRangeM: { min: 10, max: 40 }, visibilityRangeM: { min: 30, max: 45 },
    bestSeason: 'Noviembre a mayo', protectedArea: 'Parque Nacional Arrecifes de Cozumel (1996)',
    regulations: 'Guía local acreditado obligatorio; prohibido el uso de guantes.',
    location: { lat: 20.42, lng: -86.92 },
    levelIds: ['open-water', 'advanced-open-water'], diveModeIds: ['deriva', 'pecios'],
    ecosystemIds: ['arrecifes-coralinos'],
    featuredSpeciesIds: ['pez-sapo-esplendido', 'tortuga-carey'], sourceIds: ['noaa']
  },
  bonaire: {
    name: 'Bonaire', countryCode: 'bq', regionId: 'caribe-sur', order: 4,
    summary: 'Capital mundial del buceo desde la orilla, con más de 54 sitios señalizados.',
    description: 'Los sitios se marcan con piedras amarillas junto a la carretera. Pionera en prohibir el fondeo con anclas y los protectores solares con oxibenzona.',
    depthRangeM: { min: 5, max: 40 }, visibilityRangeM: { min: 25, max: 35 },
    bestSeason: 'Todo el año (fuera del cinturón habitual de huracanes)', protectedArea: 'Bonaire National Marine Park (STINAPA)',
    regulations: 'Tasa de naturaleza obligatoria, orientación y check dive de flotabilidad; prohibida la oxibenzona.',
    location: { lat: 12.15, lng: -68.27 },
    levelIds: ['open-water', 'advanced-open-water'], diveModeIds: ['orilla', 'pecios', 'nocturno'],
    ecosystemIds: ['arrecifes-coralinos'],
    featuredSpeciesIds: ['pez-loro-guacamayo', 'pez-angel-reina'], sourceIds: ['padi']
  },
  cayman: {
    name: 'Islas Caimán', countryCode: 'ky', regionId: 'caribe-central', order: 5,
    summary: 'Visibilidad de hasta 45 m, el muro de Bloody Bay y el pecio USS Kittiwake.',
    description: 'Bloody Bay Wall arranca a 6 m y cae verticalmente hacia el abismo; Grand Cayman acoge el USS Kittiwake, preparado para la penetración recreativa.',
    depthRangeM: { min: 3, max: 1000 }, visibilityRangeM: { min: 30, max: 45 },
    bestSeason: 'Diciembre a mayo', protectedArea: 'Zonas de conservación marina de las Islas Caimán',
    regulations: 'Prohibida la extracción de coral y de artefactos de naufragios; límites de velocidad para embarcaciones.',
    location: { lat: 19.31, lng: -81.25 },
    levelIds: ['open-water', 'advanced-open-water', 'deep'], diveModeIds: ['recreativo', 'pecios'],
    ecosystemIds: ['arrecifes-coralinos'],
    featuredSpeciesIds: ['tiburon-arrecife', 'raya-aguila-moteada'], sourceIds: ['noaa']
  },
  roatan: {
    name: 'Roatán', countryCode: 'hn', regionId: 'arrecife-mesoamericano', order: 6,
    summary: 'Paredes de arrecife a minutos de la costa, gestionadas por el Roatan Marine Park.',
    description: 'Fracturas profundas y chimeneas recubiertas de esponjas tubo, con tortugas y cardúmenes de jureles. Control activo del pez león.',
    depthRangeM: { min: 8, max: 40 }, visibilityRangeM: { min: 20, max: 35 },
    bestSeason: 'Febrero a septiembre', protectedArea: 'Roatan Marine Park (BINMP)',
    regulations: 'Uso obligatorio de boyas de amarre; erradicación supervisada del pez león.',
    location: { lat: 16.32, lng: -86.53 },
    levelIds: ['open-water', 'advanced-open-water'], diveModeIds: ['recreativo', 'pecios', 'nocturno'],
    ecosystemIds: ['arrecifes-coralinos', 'manglares'],
    featuredSpeciesIds: ['pez-leon', 'tortuga-carey'], sourceIds: ['roatan-marine-park']
  },
  'dom-rep': {
    name: 'República Dominicana', countryCode: 'do', regionId: 'antillas-mayores', order: 7,
    summary: 'La mayor concentración de pecios accesibles del Caribe insular.',
    description: 'Bayahibe, Punta Cana y Santo Domingo reúnen pecios para todos los niveles, del Atlantic Princess (12 m) al St. George (hasta 44 m).',
    depthRangeM: { min: 10, max: 44 }, visibilityRangeM: { min: 20, max: 30 },
    bestSeason: 'Diciembre a mayo', protectedArea: 'P.N. Cotubanamá y P.N. Submarino La Caleta',
    regulations: 'Protección del patrimonio cultural subacuático.',
    location: { lat: 18.37, lng: -68.84 },
    levelIds: ['open-water', 'advanced-open-water', 'deep', 'tec'], diveModeIds: ['pecios', 'recreativo'],
    ecosystemIds: ['arrecifes-coralinos'],
    featuredSpeciesIds: ['raya-aguila-moteada', 'mero-guasa'], sourceIds: ['noaa']
  }
};

// ---------------------------------------------------------------------
// 7. Sitios de inmersión (1:N con destinos → consulta por destinationId)
// ---------------------------------------------------------------------
const diveSites = {
  'la-pared-san-andres': { name: 'La Pared (Blue Wall)', destinationId: 'san-andres', type: 'pared', depthRangeM: { min: 15, max: 40 }, summary: 'Pared abrupta que cae a más de 300 m; se bucea en su tramo recreativo.' },
  'cantil-providencia': { name: 'El Cantil de Providencia', destinationId: 'san-andres', type: 'pared', summary: 'Caída oceánica con tiburones de arrecife y coral negro.' },
  'calichan-el-coro': { name: 'Calichan y El Coro', destinationId: 'santa-marta', type: 'arrecife', depthRangeM: { min: 4, max: 25 }, summary: 'Terrazas rocosas ideales para formación y fotografía macro.' },
  'isla-aguja': { name: 'Isla Aguja', destinationId: 'santa-marta', type: 'pared', depthRangeM: { min: 10, max: 40 }, summary: 'Paredes inclinadas con corrientes oceánicas y cardúmenes de jureles.' },
  'barcaza-de-carbon': { name: 'Barcaza de Carbón', destinationId: 'santa-marta', type: 'pecio', depthRangeM: { min: 5, max: 30 }, summary: 'Pecio partido en tres secciones en la bahía urbana.' },
  'punta-venado': { name: 'Punta Venado', destinationId: 'santa-marta', type: 'nocturno', summary: 'Inmersión nocturna de referencia, con pulpos cazando y peces loro dormidos.' },
  'arrecife-palancar': { name: 'Arrecife Palancar', destinationId: 'cozumel', type: 'deriva', summary: 'Grandes formaciones coralinas (Jardines, Cuevas, Herradura) recorridas a la deriva.' },
  'muro-santa-rosa': { name: 'Muro de Santa Rosa', destinationId: 'cozumel', type: 'pared', summary: 'Muro vertical con corriente, cuevas y saliente de coral.' },
  'paso-del-cedral': { name: 'Paso del Cedral', destinationId: 'cozumel', type: 'deriva', summary: 'Arrecife de baja altura con abundante vida y corriente suave.' },
  'pecio-c53': { name: 'Pecio C-53 Felipe Xicoténcatl', destinationId: 'cozumel', type: 'pecio', depthRangeM: { min: 10, max: 24 }, summary: 'Antiguo buque de la Armada de México hundido como arrecife artificial.' },
  'salt-pier': { name: 'Salt Pier', destinationId: 'bonaire', type: 'orilla', summary: 'Pilares del muelle salinero cubiertos de corales y esponjas.' },
  '1000-steps': { name: '1000 Steps', destinationId: 'bonaire', type: 'orilla', summary: 'Escalera hacia un arrecife de franja de aguas muy claras.' },
  karpata: { name: 'Karpata', destinationId: 'bonaire', type: 'orilla', summary: 'Pendiente arrecifal con gorgonias en el parque marino.' },
  'bari-reef': { name: 'Bari Reef', destinationId: 'bonaire', type: 'orilla', summary: 'Uno de los arrecifes con más especies de peces registradas de la isla.' },
  'pecio-hilma-hooker': { name: 'Pecio Hilma Hooker', destinationId: 'bonaire', type: 'pecio', depthRangeM: { min: 18, max: 30 }, summary: 'Carguero tumbado sobre la arena entre dos arrecifes.' },
  'bloody-bay-wall': { name: 'Bloody Bay Wall', destinationId: 'cayman', type: 'pared', depthRangeM: { min: 6, max: 40 }, summary: 'Muro de Little Cayman que arranca a 6 m y cae hacia el abismo.' },
  'stingray-city': { name: 'Stingray City', destinationId: 'cayman', type: 'bajo-arenoso', depthRangeM: { min: 3, max: 4 }, summary: 'Banco de arena somero frecuentado por rayas.' },
  'uss-kittiwake': { name: 'USS Kittiwake', destinationId: 'cayman', type: 'pecio', depthRangeM: { min: 5, max: 20 }, summary: 'Buque de rescate de submarinos de 5 cubiertas, preparado para buceo recreativo.' },
  'captain-keith-tibbetts': { name: 'MV Captain Keith Tibbetts', destinationId: 'cayman', type: 'pecio', summary: 'Antigua fragata hundida frente a Cayman Brac.' },
  'west-end-wall': { name: 'West End Wall', destinationId: 'roatan', type: 'pared', summary: 'Pared arrecifal a pocos minutos en lancha desde West End.' },
  'marys-place': { name: "Mary's Place", destinationId: 'roatan', type: 'pared', summary: 'Grietas y fracturas profundas recubiertas de esponjas.' },
  'mandys-eel-garden': { name: "Mandy's Eel Garden", destinationId: 'roatan', type: 'arrecife', summary: 'Fondo arenoso con colonias de anguilas jardineras.' },
  'pecio-el-aguila': { name: 'Pecio El Águila', destinationId: 'roatan', type: 'pecio', summary: 'Carguero hundido como arrecife artificial y partido por un huracán.' },
  'pecio-halliburton': { name: 'Pecio Halliburton', destinationId: 'roatan', type: 'pecio', summary: 'Buque de suministro hundido como arrecife artificial.' },
  'pecio-st-george': { name: 'Pecio St. George', destinationId: 'dom-rep', type: 'pecio', depthRangeM: { min: 12, max: 44 }, summary: 'Carguero de 73 m frente a Bayahibe, con rayas águila y meros.' },
  'pecio-atlantic-princess': { name: 'Pecio Atlantic Princess', destinationId: 'dom-rep', type: 'pecio', depthRangeM: { min: 10, max: 12 }, summary: 'Iniciación perfecta a los pecios sobre arena blanca.' },
  'pecio-hickory': { name: 'Pecio Hickory', destinationId: 'dom-rep', type: 'pecio', depthRangeM: { min: 10, max: 18 }, summary: 'Pecio del Parque Nacional Submarino La Caleta.' },
  'arrecife-guaraguao': { name: 'Arrecife Guaraguao', destinationId: 'dom-rep', type: 'arrecife', summary: 'Arrecife con cañones históricos del siglo XVIII.' }
};

// ---------------------------------------------------------------------
// 8. Naufragios (entidad histórica; siteId enlaza con el lugar de buceo)
//    Solo se incluyen datos verificables; los campos dudosos se omiten.
// ---------------------------------------------------------------------
const wrecks = {
  'hilma-hooker': { name: 'Hilma Hooker', destinationId: 'bonaire', siteId: 'pecio-hilma-hooker', vesselType: 'Carguero', sunkYear: 1984, cause: 'accidente', lengthM: 72, depthRangeM: { min: 18, max: 30 }, minCertificationId: 'advanced-open-water', order: 1, summary: 'Carguero que se hundió en 1984 junto a la costa sur de Bonaire mientras estaba retenido por las autoridades. Reposa sobre su costado entre dos arrecifes.' },
  'uss-kittiwake': { name: 'USS Kittiwake', destinationId: 'cayman', siteId: 'uss-kittiwake', vesselType: 'Buque de rescate de submarinos', sunkYear: 2011, cause: 'arrecife-artificial', lengthM: 76, depthRangeM: { min: 5, max: 20 }, minCertificationId: 'open-water', order: 2, summary: 'Buque de la Armada de EE. UU. hundido en 2011 en Grand Cayman como arrecife artificial. Sus 5 cubiertas están preparadas para la penetración recreativa.' },
  'captain-keith-tibbetts': { name: 'MV Captain Keith Tibbetts', destinationId: 'cayman', siteId: 'captain-keith-tibbetts', vesselType: 'Fragata', sunkYear: 1996, cause: 'arrecife-artificial', minCertificationId: 'open-water', order: 3, summary: 'Antigua fragata de construcción soviética hundida en 1996 frente a Cayman Brac como arrecife artificial.' },
  'c53-felipe-xicotencatl': { name: 'C-53 Felipe Xicoténcatl', destinationId: 'cozumel', siteId: 'pecio-c53', vesselType: 'Dragaminas', sunkYear: 2000, cause: 'arrecife-artificial', lengthM: 56, depthRangeM: { min: 10, max: 24 }, minCertificationId: 'open-water', order: 4, summary: 'Dragaminas de la Armada de México hundido en el año 2000 como arrecife artificial frente a Cozumel.' },
  'el-aguila': { name: 'El Águila', destinationId: 'roatan', siteId: 'pecio-el-aguila', vesselType: 'Carguero', sunkYear: 1997, cause: 'arrecife-artificial', minCertificationId: 'advanced-open-water', order: 5, summary: 'Carguero hundido en 1997 como arrecife artificial. El huracán Mitch (1998) lo partió en tres secciones.' },
  halliburton: { name: 'Halliburton', destinationId: 'roatan', siteId: 'pecio-halliburton', vesselType: 'Buque de suministro', cause: 'arrecife-artificial', minCertificationId: 'advanced-open-water', order: 6, summary: 'Buque de suministro hundido intencionalmente frente a Roatán como arrecife artificial.' },
  'st-george': { name: 'St. George', destinationId: 'dom-rep', siteId: 'pecio-st-george', vesselType: 'Carguero', sunkYear: 1999, cause: 'arrecife-artificial', lengthM: 73, depthRangeM: { min: 12, max: 44 }, minCertificationId: 'advanced-open-water', order: 7, summary: 'Carguero de 73 m hundido en 1999 frente a Bayahibe. Rayas águila y meros lo visitan con frecuencia.' },
  'atlantic-princess': { name: 'Atlantic Princess', destinationId: 'dom-rep', siteId: 'pecio-atlantic-princess', vesselType: 'Embarcación', cause: 'arrecife-artificial', depthRangeM: { min: 10, max: 12 }, minCertificationId: 'open-water', order: 8, summary: 'Pecio somero sobre fondo de arena blanca en Bayahibe, ideal para iniciarse en naufragios.' },
  hickory: { name: 'Hickory', destinationId: 'dom-rep', siteId: 'pecio-hickory', vesselType: 'Embarcación de exploración', cause: 'arrecife-artificial', depthRangeM: { min: 10, max: 18 }, minCertificationId: 'open-water', order: 9, summary: 'Antiguo barco de exploración hundido en el Parque Nacional Submarino La Caleta, en Santo Domingo.' },
  'nuestra-senora-de-guadalupe': { name: 'Nuestra Señora de Guadalupe', destinationId: 'dom-rep', vesselType: 'Galeón español', sunkYear: 1724, cause: 'tormenta', order: 10, summary: 'Galeón que naufragó en 1724 en la bahía de Samaná durante un huracán. Sus restos son patrimonio cultural subacuático.' },
  'barcaza-de-carbon': { name: 'Barcaza de Carbón', destinationId: 'santa-marta', siteId: 'barcaza-de-carbon', vesselType: 'Barcaza', cause: 'desconocida', depthRangeM: { min: 5, max: 30 }, minCertificationId: 'open-water', order: 11, summary: 'Barcaza partida en tres secciones en la bahía de Santa Marta; buena para practicar navegación en pecios.' }
};

// ---------------------------------------------------------------------
// 9. Conservación, seguridad y glosario
// ---------------------------------------------------------------------
const threats = {
  blanqueamiento: { name: 'Calentamiento global y blanqueamiento', order: 1, summary: 'Las olas de calor provocan la expulsión de las zooxantelas y dejan al coral sin alimento.' },
  'filtros-solares': { name: 'Químicos de los protectores solares', order: 2, summary: 'La oxibenzona y el octinoxato dañan el ADN del coral y deforman larvas de plancton.' },
  'pez-leon': { name: 'Invasión del pez león', order: 3, summary: 'Depredador sin enemigos naturales que diezma especies herbívoras juveniles.', speciesId: 'pez-leon' },
  sobrepesca: { name: 'Sobrepesca de especies clave', order: 4, summary: 'Extraer herbívoros como el pez loro favorece que las macroalgas asfixien al coral.', speciesId: 'pez-loro-guacamayo' },
  'impacto-fisico': { name: 'Fondeo y buceo descuidado', order: 5, summary: 'Anclas, aleteo sobre sedimentos y contacto físico destruyen colonias centenarias.' }
};

const practices = {
  'flotabilidad-neutra': { name: 'Flotabilidad neutra impecable', order: 1, summary: 'Ajustar el lastre para mantenerse horizontal sin tocar el fondo ni los corales.' },
  'no-tocar': { name: 'Política de no tocar', order: 2, summary: 'Un simple toque destruye la capa mucosa protectora del coral.' },
  'no-alimentar': { name: 'Cero alimentación e interacción forzada', order: 3, summary: 'No alimentar peces ni perseguir tortugas o rayas.' },
  'protector-mineral': { name: 'Protector solar mineral', order: 4, summary: 'Usar óxido de zinc o dióxido de titanio no nano, o camisetas de protección UV.' },
  'boyas-de-amarre': { name: 'Boyas de amarre', order: 5, summary: 'Exigir que la embarcación se amarre a boyas fijas y nunca fondee sobre el arrecife.' },
  'vedas-y-tasas': { name: 'Respeto a vedas y tasas', order: 6, summary: 'Respetar las vedas de langosta y pagar las tasas de conservación de los parques.' }
};

const safetyRules = {
  certificacion: { name: 'Certificación válida', order: 1, summary: 'Bucear dentro de los límites de tu certificación y experiencia.' },
  companero: { name: 'Sistema de compañeros', order: 2, summary: 'Nunca bucear solo y hacer el chequeo BWRAF antes de cada entrada.' },
  equipo: { name: 'Revisión del equipo', order: 3, summary: 'Manómetro, inflador y ordenador verificados y calibrados.' },
  ascenso: { name: 'Velocidad de ascenso y parada', order: 4, summary: 'Ascender a no más de 9-18 m/min y hacer 3 minutos de parada a 5 m.' },
  reserva: { name: 'Reserva mínima de gas', order: 5, summary: 'Llegar a la superficie con al menos 35 bar (500 psi).' },
  'pre-vuelo': { name: 'Intervalo antes de volar', order: 6, summary: '12 h tras una inmersión única sin descompresión; 18-24 h tras inmersiones repetitivas.' },
  'condicion-fisica': { name: 'Condición física', order: 7, summary: 'Nada de alcohol, drogas ni fatiga extrema; mantener la hidratación.' },
  suspension: { name: 'Derecho a suspender', order: 8, summary: 'Cualquier buceador puede cancelar la inmersión en cualquier momento por seguridad.' }
};

const hyperbaricChambers = {
  'hospital-julio-mendez': { name: 'Hospital Universitario Julio Méndez Barreneche', city: 'Santa Marta', countryCode: 'co', destinationId: 'santa-marta' },
  'cornerstone-roatan': { name: 'Cornerstone Medical Chamber', city: 'Roatán', countryCode: 'hn', destinationId: 'roatan' },
  'clinica-san-miguel': { name: 'Clínica San Miguel', city: 'Cozumel', countryCode: 'mx', destinationId: 'cozumel' },
  'san-francisco-bonaire': { name: 'San Francisco Hospital', city: 'Kralendijk', countryCode: 'bq', destinationId: 'bonaire' }
};

const glossary = {
  ndl: { term: 'Límite de no descompresión (NDL)', definition: 'Tiempo máximo a una profundidad sin necesidad de paradas de descompresión obligatorias.' },
  'parada-de-seguridad': { term: 'Parada de seguridad', definition: 'Pausa de 3 minutos a 5 m antes de salir, recomendada en toda inmersión recreativa.' },
  'flotabilidad-neutra': { term: 'Flotabilidad neutra', definition: 'Estado en el que el buceador ni sube ni baja, controlado con el lastre, el chaleco y la respiración.' },
  narcosis: { term: 'Narcosis por nitrógeno', definition: 'Efecto narcótico del nitrógeno a presión; se vuelve perceptible a partir de unos 30 m.' },
  nitrox: { term: 'Nitrox', definition: 'Aire enriquecido con más del 21 % de oxígeno (normalmente 32 % o 36 %) que reduce la absorción de nitrógeno.' },
  trimix: { term: 'Trimix', definition: 'Mezcla de helio, nitrógeno y oxígeno usada en el buceo técnico profundo.' },
  termoclina: { term: 'Termoclina', definition: 'Capa de agua donde la temperatura cambia bruscamente con la profundidad.' },
  haloclina: { term: 'Haloclina', definition: 'Límite entre agua dulce y salada, típico de los cenotes; produce un efecto visual borroso.' },
  zooxantelas: { term: 'Zooxantelas', definition: 'Microalgas que viven dentro del coral y le aportan alimento mediante la fotosíntesis.' },
  blanqueamiento: { term: 'Blanqueamiento', definition: 'Pérdida de las zooxantelas por estrés térmico, que deja el coral blanco y debilitado.' },
  pecio: { term: 'Pecio', definition: 'Restos de una embarcación hundida.' },
  bwraf: { term: 'BWRAF', definition: 'Chequeo con el compañero antes de entrar: chaleco (BCD), lastre, liberaciones, aire y revisión final.' },
  'enfermedad-descompresiva': { term: 'Enfermedad descompresiva', definition: 'Formación de burbujas de nitrógeno en los tejidos por un ascenso rápido o por exceder los límites; se trata en cámara hiperbárica.' }
};

// =====================================================================
// Validación
// =====================================================================
const errores = [];
const fallo = (msg) => errores.push(msg);

const colecciones = {
  regions, countries, sources, certifications, diveModes, species, ecosystems,
  destinations, diveSites, wrecks, threats, practices, safetyRules, hyperbaricChambers, glossary
};

const KEY_VALIDA = /^[a-z0-9-]{2,60}$/;
for (const [nombre, col] of Object.entries(colecciones)) {
  for (const id of Object.keys(col)) {
    if (!KEY_VALIDA.test(id)) fallo(`${nombre}/${id}: id inválido (usa minúsculas, números y guiones)`);
  }
}

function existe(col, nombreCol, id, contexto) {
  if (id !== undefined && !(id in col)) fallo(`${contexto}: no existe ${nombreCol}/${id}`);
}
function enumValido(lista, valor, contexto) {
  if (valor !== undefined && !lista.includes(valor)) fallo(`${contexto}: valor "${valor}" no permitido (${lista.join(', ')})`);
}
function requeridos(obj, campos, contexto) {
  for (const c of campos) if (obj[c] === undefined || obj[c] === '') fallo(`${contexto}: falta el campo "${c}"`);
}
function rango(r, contexto) {
  if (r === undefined) return;
  if (typeof r.min !== 'number' || typeof r.max !== 'number' || r.min < 0 || r.min > r.max) fallo(`${contexto}: rango inválido`);
}

for (const [id, d] of Object.entries(destinations)) {
  const ctx = `destinations/${id}`;
  requeridos(d, ['name', 'countryCode', 'regionId', 'summary', 'order'], ctx);
  existe(countries, 'countries', d.countryCode, ctx);
  existe(regions, 'regions', d.regionId, ctx);
  rango(d.depthRangeM, ctx); rango(d.visibilityRangeM, ctx);
  d.levelIds?.forEach((x) => existe(certifications, 'certifications', x, ctx));
  d.diveModeIds?.forEach((x) => existe(diveModes, 'diveModes', x, ctx));
  d.ecosystemIds?.forEach((x) => existe(ecosystems, 'ecosystems', x, ctx));
  d.featuredSpeciesIds?.forEach((x) => existe(species, 'species', x, ctx));
  d.sourceIds?.forEach((x) => existe(sources, 'sources', x, ctx));
}
for (const [id, s] of Object.entries(diveSites)) {
  const ctx = `diveSites/${id}`;
  requeridos(s, ['name', 'destinationId', 'type', 'summary'], ctx);
  existe(destinations, 'destinations', s.destinationId, ctx);
  enumValido(ENUM.siteType, s.type, ctx);
  rango(s.depthRangeM, ctx);
}
for (const [id, w] of Object.entries(wrecks)) {
  const ctx = `wrecks/${id}`;
  requeridos(w, ['name', 'destinationId', 'vesselType', 'cause', 'summary', 'order'], ctx);
  existe(destinations, 'destinations', w.destinationId, ctx);
  existe(diveSites, 'diveSites', w.siteId, ctx);
  existe(certifications, 'certifications', w.minCertificationId, ctx);
  enumValido(ENUM.wreckCause, w.cause, ctx);
  rango(w.depthRangeM, ctx);
  if (w.siteId && diveSites[w.siteId].destinationId !== w.destinationId) fallo(`${ctx}: el sitio pertenece a otro destino`);
  if (w.sunkYear !== undefined && (w.sunkYear < 1492 || w.sunkYear > new Date().getFullYear())) fallo(`${ctx}: año fuera de rango`);
}
for (const [id, s] of Object.entries(species)) {
  const ctx = `species/${id}`;
  requeridos(s, ['name', 'scientificName', 'group', 'category', 'role', 'summary'], ctx);
  enumValido(ENUM.speciesGroup, s.group, ctx);
  enumValido(ENUM.speciesCategory, s.category, ctx);
  enumValido(ENUM.iucnStatus, s.iucnStatus, ctx);
}
for (const [id, e] of Object.entries(ecosystems)) {
  e.keySpeciesIds.forEach((x) => existe(species, 'species', x, `ecosystems/${id}`));
  e.sourceIds.forEach((x) => existe(sources, 'sources', x, `ecosystems/${id}`));
}
for (const [id, c] of Object.entries(certifications)) existe(certifications, 'certifications', c.prerequisiteId, `certifications/${id}`);
for (const [id, m] of Object.entries(diveModes)) {
  enumValido(ENUM.modeLevel, m.level, `diveModes/${id}`);
  existe(certifications, 'certifications', m.minCertificationId, `diveModes/${id}`);
}
for (const [id, t] of Object.entries(threats)) existe(species, 'species', t.speciesId, `threats/${id}`);
for (const [id, h] of Object.entries(hyperbaricChambers)) {
  existe(countries, 'countries', h.countryCode, `hyperbaricChambers/${id}`);
  existe(destinations, 'destinations', h.destinationId, `hyperbaricChambers/${id}`);
}
for (const [id, s] of Object.entries(sources)) enumValido(ENUM.sourceType, s.type, `sources/${id}`);

if (errores.length) {
  console.error(`✖ El catálogo tiene ${errores.length} error(es):\n  - ${errores.join('\n  - ')}`);
  process.exit(1);
}

// =====================================================================
// Transformación a la forma de Realtime Database
//   - Las listas de ids se guardan como mapas { id: true } (RTDB no
//     maneja bien los arrays y los mapas permiten consultar/actualizar
//     un elemento sin reescribir la lista).
//   - Todo registro publicado lleva status: 'published'.
// =====================================================================
const aMapa = (lista) => (lista && lista.length ? Object.fromEntries(lista.map((id) => [id, true])) : undefined);

function normalizar(col) {
  return Object.fromEntries(Object.entries(col).map(([id, item]) => {
    const salida = { status: 'published' };
    for (const [k, v] of Object.entries(item)) {
      if (v === undefined) continue;
      salida[k] = k.endsWith('Ids') && Array.isArray(v) ? aMapa(v) : v;
      if (salida[k] === undefined) delete salida[k];
    }
    return [id, salida];
  }));
}

const catalog = Object.fromEntries(Object.entries(colecciones).map(([nombre, col]) => [nombre, normalizar(col)]));

// ---------------------------------------------------------------------
// Índices inversos derivados (relaciones N:M y filtros frecuentes)
// Las relaciones 1:N (sitios o naufragios de un destino) NO necesitan
// índice propio: se consultan con orderByChild + .indexOn en las reglas.
// ---------------------------------------------------------------------
function agregar(indice, clave, id) {
  (indice[clave] ??= {})[id] = true;
}
const destinationsBySpecies = {};
const destinationsBySiteType = {};
const destinationsByEcosystem = {};
const speciesByEcosystem = {};

for (const [id, d] of Object.entries(destinations)) {
  d.featuredSpeciesIds.forEach((sp) => agregar(destinationsBySpecies, sp, id));
  d.ecosystemIds.forEach((ec) => agregar(destinationsByEcosystem, ec, id));
}
for (const s of Object.values(diveSites)) agregar(destinationsBySiteType, s.type, s.destinationId);
for (const [id, e] of Object.entries(ecosystems)) e.keySpeciesIds.forEach((sp) => agregar(speciesByEcosystem, id, sp));

const indexes = { destinationsBySpecies, destinationsBySiteType, destinationsByEcosystem, speciesByEcosystem };

const meta = {
  schemaVersion: SCHEMA_VERSION,
  generatedAt: new Date().toISOString(),
  locale: 'es',
  counts: Object.fromEntries(Object.entries(catalog).map(([k, v]) => [k, Object.keys(v).length]))
};

const seed = { meta, catalog, indexes };
const salida = join(dirname(fileURLToPath(import.meta.url)), 'seed.json');
writeFileSync(salida, JSON.stringify(seed, null, 2) + '\n', 'utf8');

const total = Object.values(meta.counts).reduce((a, b) => a + b, 0);
console.log(`✔ seed.json generado: ${total} registros en ${Object.keys(catalog).length} colecciones`);
console.log(Object.entries(meta.counts).map(([k, v]) => `  · ${k}: ${v}`).join('\n'));
