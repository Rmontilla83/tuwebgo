/**
 * El brief traducido al formato que espera el constructor de landings.
 *
 * El constructor (PROYECTOS WEB/Constructor de landing pages) arranca con un
 * cuestionario de 4 rondas, PERO su CLAUDE.md dice que si el primer mensaje ya
 * trae un brief con la forma de `docs/brief-template.md`, se las salta y
 * empieza directo en FASE 0. Ese es todo el objetivo de este archivo: que
 * Rafael copie un bloque y el constructor no le pregunte nada que el cliente
 * ya respondió.
 *
 * Las cuatro líneas de FASE 0 —rubro, posicionamiento, registro, audiencia—
 * son, según la propia plantilla, las que más cambian el resultado. Por eso
 * son las que más trabajo de traducción llevan acá.
 *
 * Lo que el cliente no respondió va como `tú decides`, que es la palabra que
 * la plantilla define para eso. Nunca se deja una línea vacía ni se borra:
 * un campo ausente hace que el constructor vuelva a preguntar.
 */

type Datos = Record<string, unknown>

const txt = (v: unknown): string =>
  Array.isArray(v) ? v.filter(Boolean).join(', ') : v == null ? '' : String(v).trim()

/** Lo que no sabemos se dice así, tal como lo define la plantilla. */
const DECIDES = 'tú decides'
const oDecides = (v: unknown) => txt(v) || DECIDES

/**
 * Nuestros rubros → los 14 del constructor.
 *
 * No hay equivalente para `saas-tech` ni `ong` porque nuestro formulario no
 * los ofrece: en la base de negocios venezolanos no aparecieron. Si alguna vez
 * llega uno, cae en `otro`, que es el comportamiento correcto — inventarle un
 * rubro sería peor.
 */
const RUBRO: Record<string, string> = {
  'Comida / restaurante / repostería': 'gastronomía',
  'Tienda / venta de productos': 'retail-moda',
  'Belleza / estética / barbería': 'belleza',
  'Salud / consultorio / odontología': 'salud',
  'Servicio profesional (abogado, contador, consultor)': 'legal-finanzas',
  'Construcción / reparaciones / técnico': 'industria-construcción',
  'Educación / cursos / academia': 'educación',
  'Inmobiliaria': 'inmobiliaria',
  'Eventos / fotografía': 'eventos',
  'Fitness / entrenamiento': 'fitness',
  'Marca personal': 'agencia-creativa',
}

/** Posición en precio → el eje 1-5 (1 masivo/económico, 5 lujo/exclusivo). */
const POSICION: Record<string, number> = {
  'Económico': 1, 'Precio justo': 2, 'Equilibrado': 3, 'Premium': 4, 'Exclusivo': 5,
}

/**
 * Sensación → el eje de registro 1-5 (1 institucional/serio, 5 expresivo).
 *
 * Acá no preguntamos nada nuevo: la sensación que ya elige el cliente ES el
 * registro, dicho en palabras que él entiende. Preguntarle "¿del 1 al 5, qué
 * tan expresivo?" a un panadero no da mejor información, da peor.
 */
const REGISTRO: Record<string, number> = {
  'Clásico y formal': 1,
  'Elegante y minimalista': 2,
  'Cálido y cercano': 3,
  'Natural y artesanal': 3,
  'Moderno y tecnológico': 4,
  'Atrevido y colorido': 5,
}

/** Busca por prefijo: los valores del formulario llevan un guion y su explicación. */
function porPrefijo(tabla: Record<string, number>, valor: string): number | null {
  const v = valor.trim()
  for (const [k, n] of Object.entries(tabla)) if (v.startsWith(k)) return n
  return null
}

/** Quién decide la compra, en una frase. */
function audiencia(d: Datos): string {
  const detalle = txt(d.cliente_detalle)
  if (detalle) return detalle

  const quien = txt(d.cliente)
  const zona = txt(d.zona)
  if (!quien) return DECIDES
  const base = quien.startsWith('Empresas')
    ? 'otros negocios que contratan el servicio'
    : quien.startsWith('Los dos')
      ? 'personas y empresas'
      : 'el consumidor final'
  return zona ? `${base}, en ${zona}` : base
}

/** El tema, con una salida razonable si no lo eligieron. */
function tema(d: Datos): string {
  const t = txt(d.tema)
  if (t.startsWith('Claro')) return 'claro'
  if (t.startsWith('Oscuro')) return 'oscuro'
  return DECIDES
}

/** Contacto en el orden que la plantilla prefiere: mailto, o el WhatsApp. */
function contacto(d: Datos): string {
  const email = txt(d.email)
  if (email) return `mailto:${email}`
  const wa = txt(d.whatsapp).replace(/\D/g, '')
  return wa ? `WhatsApp +${wa}` : DECIDES
}

const tieneMaterial = (d: Datos, que: string) =>
  (Array.isArray(d.material) ? d.material.map(String) : []).some((m) => m.startsWith(que))

function material(d: Datos, que: 'Logo' | 'Fotos'): string {
  if (!tieneMaterial(d, que)) return 'no'
  return que === 'Logo' ? 'sí, el cliente lo envía aparte' : 'sí, el cliente las envía aparte'
}

/**
 * El favicon no se le pregunta al cliente: se deduce.
 *
 * Si dijo que tiene logo, el favicon sale del logo — es lo que haría
 * cualquiera. Preguntárselo aparte sería una pregunta más para una respuesta
 * que ya tenemos, y "favicon" no es una palabra que un panadero deba
 * aprenderse para pedir su página.
 */
const favicon = (d: Datos) =>
  tieneMaterial(d, 'Logo') ? 'usar el logo del cliente' : DECIDES

/**
 * La dirección donde va a vivir la página, ya resuelta.
 *
 * El formulario acepta las dos cosas en el mismo campo: "tunegocio" para el
 * subdominio gratis, o "midominio.com" si el cliente ya tiene uno. Se
 * distingue por el punto, igual que hace el resumen del formulario.
 *
 * Va en la línea 18 y no solo en el contexto adicional porque es lo que el
 * constructor tiene que EJECUTAR al final. Enterrado entre notas, se lee como
 * un dato de color y la página termina en una URL descartable.
 */
export function dominioDestino(d: Datos): string | null {
  const sub = txt(d.subdominio)
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .trim()
  if (!sub) return null
  return sub.includes('.') ? sub : `${sub}.tuwebgo.net`
}

function deploy(d: Datos): string {
  const dom = dominioDestino(d)
  return dom
    ? `sí, a ${dom} en Netlify (equipo "wuipi web")`
    : 'sí, en Netlify. El cliente no pidió dirección: usa <negocio>.tuwebgo.net'
}

export function briefAFormatoBuilder(datos: Datos, negocio: string): string {
  const d = datos ?? {}

  const rubroCrudo = txt(d.rubro)
  const rubro = RUBRO[rubroCrudo] ?? 'otro'

  const pos = porPrefijo(POSICION, txt(d.posicion))
  const reg = porPrefijo(REGISTRO, txt(d.estilo))

  const servicios = Array.isArray(d.servicios) ? d.servicios.map(String).filter(Boolean) : []
  // El diferencial primero: es la respuesta a "por qué te compran a ti", que
  // es exactamente lo que la plantilla quiere destacar.
  const clave = [txt(d.diferencial), ...servicios].filter(Boolean).slice(0, 4).join(' · ')

  const redes = txt(d.instagram)
    ? `instagram.com/${txt(d.instagram).replace(/^@/, '')}`
    : DECIDES

  const L = [
    'BRIEF',
    '',
    '## Clasificación (FASE 0)',
    `rubro:            ${rubro}`,
    `posicionamiento:  ${pos ?? DECIDES}`,
    `registro:         ${reg ?? DECIDES}`,
    `audiencia:        ${audiencia(d)}`,
    '',
    '## Ronda 1 — Básicos',
    `1. Nombre del negocio: ${txt(d.nombre) || negocio || DECIDES}`,
    `2. A qué se dedican: ${oDecides(d.que_hace)}`,
    `3. A quién quieren llegar: ${audiencia(d)}`,
    '',
    '## Ronda 2 — Visual',
    `4. Webs de referencia: ${oDecides(d.referencia)}`,
    `5. Colores: ${oDecides(d.colores)}`,
    `6. Tema: ${tema(d)}`,
    `7. Sensación: ${oDecides(d.estilo)}`,
    '',
    '## Ronda 3 — Contenido',
    `8.  Acción principal: ${oDecides(d.accion)}`,
    `9.  3-4 cosas clave: ${clave || DECIDES}`,
    `10. Contacto: ${contacto(d)}`,
    // El eslogan no se le pregunta al cliente a propósito: casi ninguno tiene
    // uno y el que improvisa en un formulario sale peor que el que escribe
    // quien arma la página.
    `11. Eslogan: ${DECIDES}`,
    `12. Testimonios: ${txt(d.testimonios) || 'placeholder'}`,
    `13. Redes sociales: ${redes}`,
    '',
    '## Ronda 4 — Técnico',
    `14. Logo: ${material(d, 'Logo')}`,
    `15. Imágenes: ${material(d, 'Fotos')}`,
    `16. Favicon: ${favicon(d)}`,
    '17. Idioma: español',
    `18. Deploy: ${deploy(d)}`,
  ]

  // Todo lo que el formulario recogió y la plantilla no contempla. Va como
  // contexto extra y no se pierde: las cifras y el horario son justo lo que
  // hace que una página no parezca de relleno.
  const extras: [string, string][] = [
    ['Zona', txt(d.zona)],
    ['Precios', [txt(d.precios), txt(d.precios_detalle)].filter(Boolean).join(' — ')],
    ['Cifras que dan confianza', txt(d.cifras)],
    ['Dirección', txt(d.direccion)],
    ['Horario', txt(d.horario)],
    ['WhatsApp', txt(d.whatsapp) && `+${txt(d.whatsapp).replace(/\D/g, '')}`],
    ['Dirección pedida (textual)', txt(d.subdominio)],
    ['Notas del cliente', txt(d.notas)],
    // Solo cuando cayó en 'otro' por no tener equivalente. Si el cliente
    // eligió literalmente "Otro", repetirlo no agrega nada.
    ['Rubro que eligió', rubro === 'otro' && rubroCrudo && rubroCrudo !== 'Otro' ? rubroCrudo : ''],
  ]
  const conValor = extras.filter(([, v]) => v)
  if (conValor.length) {
    L.push('', '## Contexto adicional')
    for (const [k, v] of conValor) L.push(`- ${k}: ${v}`)
  }

  return L.join('\n')
}
