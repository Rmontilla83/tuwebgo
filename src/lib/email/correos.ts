import { enviarCorreo, EQUIPO } from '@/lib/email/enviar'
import type { Correo } from '@/lib/email/plantilla'

/**
 * Los correos concretos que manda el sistema.
 *
 * Criterio para que algo merezca un correo: **tiene que pedir una acción que
 * no puede esperar a que alguien abra el portal.** Un aviso que no se actúa
 * entrena a ignorar la bandeja, y una bandeja que se ignora vuelve inútil al
 * aviso que sí importaba. Por eso no hay correo de "llegó un mensaje": para
 * eso está el inbox, y Sofía ya lo está atendiendo.
 */

const PORTAL = 'https://portal.tuwebgo.net'
const conv = (id: string | null) =>
  id ? `${PORTAL}/dashboard/inbox?conv=${id}` : `${PORTAL}/dashboard/inbox`

const interno = (asunto: string, correo: Correo, etiqueta: string) =>
  enviarCorreo({ para: EQUIPO, asunto, correo, etiqueta })

/* ══════════════════════════════════════════════════════════════
   1. SLA — lo que un cliente esperando de más nos cuesta
   ══════════════════════════════════════════════════════════════ */

export type ConvEnEspera = {
  id: string
  quien: string
  telefono: string | null
  motivo: string | null
  minutos: number
  ultimo: string | null
}

/**
 * Una conversación lleva más de 10 minutos esperando a una persona.
 *
 * El asunto lleva los minutos adelante porque se lee desde la notificación
 * del teléfono sin abrir nada, que es exactamente la situación para la que
 * existe este correo.
 */
export function avisarSlaVencido(pendientes: ConvEnEspera[], limite: number) {
  const n = pendientes.length
  const peor = Math.max(...pendientes.map((p) => p.minutos))

  const uno = pendientes[0]
  const correo: Correo = {
    preheader:
      n === 1
        ? `${uno.quien} lleva ${uno.minutos} min esperando respuesta.`
        : `${n} conversaciones esperando. La más vieja, ${peor} min.`,
    etiqueta: 'Requiere atención',
    tono: 'urgente',
    titulo:
      n === 1
        ? `${uno.quien} lleva ${uno.minutos} minutos esperando`
        : `${n} clientes esperando respuesta`,
    parrafos: [
      n === 1
        ? 'Sofía se apartó de esta conversación y todavía nadie la ha atendido.'
        : `Sofía se apartó de estas conversaciones y todavía nadie las ha atendido. La que más lleva esperando son ${peor} minutos.`,
      `El acuerdo interno es responder antes de ${limite} minutos.`,
    ],
    datos:
      n === 1
        ? ([
            ['Cliente', uno.quien],
            uno.telefono ? ['WhatsApp', `+${uno.telefono}`] : null,
            ['Esperando desde hace', `${uno.minutos} minutos`],
            uno.motivo ? ['Por qué se apartó Sofía', uno.motivo] : null,
            uno.ultimo ? ['Lo último que escribió', uno.ultimo] : null,
          ].filter(Boolean) as [string, string][])
        : pendientes
            .slice(0, 8)
            .map((p) => [p.quien, `${p.minutos} min · ${p.motivo ?? 'esperando'}`] as [string, string]),
    boton: { texto: n === 1 ? 'Responder ahora' : 'Abrir el inbox', url: conv(n === 1 ? uno.id : null) },
    nota:
      n > 8
        ? `Y ${n - 8} más. Están todas en el inbox.`
        : 'Este aviso se manda una sola vez por conversación. No vas a recibir recordatorios.',
  }

  return interno(
    n === 1
      ? `${uno.minutos} min esperando · ${uno.quien}`
      : `${n} clientes esperando · hasta ${peor} min`,
    correo,
    'sla'
  )
}

/* ══════════════════════════════════════════════════════════════
   2. Pago reportado — plata que hay que verificar
   ══════════════════════════════════════════════════════════════ */

export function avisarPagoReportado(p: {
  convId: string
  quien: string
  telefono: string | null
  texto: string | null
  conComprobante: boolean
}) {
  const correo: Correo = {
    preheader: `${p.quien} dice que ya pagó. Falta verificar que entró.`,
    etiqueta: 'Pago por verificar',
    tono: 'aviso',
    titulo: `${p.quien} reportó un pago`,
    parrafos: [
      'Sofía ya le acusó recibo y le mandó el formulario del pre-diseño. Falta lo único que no puede hacer ella: confirmar que el dinero entró.',
    ],
    datos: [
      ['Cliente', p.quien],
      ...(p.telefono ? ([['WhatsApp', `+${p.telefono}`]] as [string, string][]) : []),
      ['Comprobante', p.conComprobante ? 'Mandó una imagen' : 'Solo texto'],
      ...(p.texto ? ([['Lo que escribió', p.texto]] as [string, string][]) : []),
    ],
    boton: { texto: 'Ver la conversación', url: conv(p.convId) },
    nota: 'El lead se queda en "por cobrar" hasta que marques que el pago entró. Un pago que nadie vio no debe mover el embudo.',
  }
  return interno(`Pago reportado · ${p.quien}`, correo, 'pago_reportado')
}

/* ══════════════════════════════════════════════════════════════
   3. Brief recibido — interno y al cliente
   ══════════════════════════════════════════════════════════════ */

export function avisarBriefRecibido(b: {
  negocio: string
  convId: string | null
  quePasa: string
  rubro: string
  manual: boolean
}) {
  const correo: Correo = {
    preheader: `${b.negocio} completó el formulario. Ya se puede armar el pre-diseño.`,
    etiqueta: 'Brief completo',
    tono: 'bueno',
    titulo: `${b.negocio} llenó el formulario`,
    parrafos: [
      'Están todas las respuestas para arrancar el pre-diseño. En el portal tienes el botón para copiarlo en el formato del constructor.',
    ],
    datos: [
      ['Negocio', b.negocio],
      ['Rubro', b.rubro || 'sin especificar'],
      ['A qué se dedica', b.quePasa || 'sin especificar'],
      ['Cómo llegó', b.manual ? 'Enlace generado a mano' : 'Por WhatsApp con Sofía'],
    ],
    boton: { texto: 'Ver el brief', url: `${PORTAL}/dashboard/briefs` },
    nota: 'El reloj de las 48 horas empieza cuando arrancas, no cuando llega esto.',
  }
  return interno(`Brief listo · ${b.negocio}`, correo, 'brief_recibido')
}

/**
 * La confirmación al CLIENTE. El único de esta lista que sale del equipo.
 *
 * Vale más de lo que parece: acaba de llenar diez pasos de formulario y
 * mandarlo a un servidor que no le contestó nada. Este correo le dice que
 * llegó, quién lo tiene y cuándo vuelve a saber de nosotros — que es todo lo
 * que quiere saber alguien que ya pagó.
 */
export function confirmarBriefAlCliente(c: { correo: string; negocio: string }) {
  const cuerpo: Correo = {
    preheader: `Recibimos todo lo de ${c.negocio}. Manos a la obra.`,
    etiqueta: 'Recibido',
    tono: 'bueno',
    titulo: 'Recibimos todo. Ya arrancamos.',
    parrafos: [
      `Gracias por tomarte el tiempo de responder, ${c.negocio}. Con esto tenemos lo que hace falta para armar tu pre-diseño.`,
      'En 48 horas te escribimos por WhatsApp con tu página lista para que la veas. No es una plantilla de muestra: es tu página, con tus textos y tus fotos.',
      'Cuando la veas nos dices qué cambiarías. Ajustamos hasta que quede como la imaginaste.',
    ],
    nota: 'Si te acordaste de algo que no pusiste, o quieres mandarnos el logo y las fotos, respóndenos por WhatsApp y lo sumamos.',
  }
  return enviarCorreo({
    para: c.correo,
    asunto: 'Recibimos tu información — tu página está en camino',
    correo: cuerpo,
    etiqueta: 'brief_confirmacion',
    // Que el cliente pueda responder y le llegue a una persona.
    responderA: EQUIPO[0],
  })
}

/* ══════════════════════════════════════════════════════════════
   4. Campañas
   ══════════════════════════════════════════════════════════════ */

export function avisarCampanaTerminada(c: {
  nombre: string
  enviados: number
  fallidos: number
  restantes: number
}) {
  const correo: Correo = {
    preheader: `${c.nombre}: ${c.enviados} mensajes enviados.`,
    etiqueta: 'Campaña enviada',
    tono: 'bueno',
    titulo: `Terminó el envío de "${c.nombre}"`,
    parrafos: [
      'Los mensajes salieron. Lo que viene ahora lo atiende Sofía sola: quien responda entra al inbox y ella sigue la conversación desde ahí.',
    ],
    datos: [
      ['Enviados', String(c.enviados)],
      ['Fallidos', String(c.fallidos)],
      ['En cola', String(c.restantes)],
    ],
    boton: { texto: 'Ver el avance', url: `${PORTAL}/dashboard/campanas` },
    nota: 'Las entregas y las lecturas siguen llegando durante las próximas horas: Meta las reporta cuando pasan.',
  }
  return interno(`Campaña enviada · ${c.nombre}`, correo, 'campana_fin')
}

/**
 * El envío se detuvo por un error de configuración.
 *
 * Este es el que de verdad hay que leer: significa que la campaña está
 * parada. Va como urgente aunque no se haya perdido ningún contacto.
 */
export function avisarCampanaDetenida(c: { nombre: string; motivo: string; restantes: number }) {
  const correo: Correo = {
    preheader: `"${c.nombre}" se detuvo. Nadie se quemó, pero está parada.`,
    etiqueta: 'Campaña detenida',
    tono: 'urgente',
    titulo: `Se detuvo "${c.nombre}"`,
    parrafos: [
      'Tres intentos seguidos fallaron con el mismo error, así que el problema es de configuración y no de los contactos. El envío se paró solo para no gastar la lista.',
      'Ningún contacto quedó marcado como fallido: siguen en la cola y el envío retoma donde quedó apenas se arregle.',
    ],
    datos: [
      ['Lo que dijo Meta', c.motivo],
      ['Contactos en cola', String(c.restantes)],
    ],
    boton: { texto: 'Ver la campaña', url: `${PORTAL}/dashboard/campanas` },
    nota: 'Lo más común: la plantilla todavía no está aprobada, o cambió y hay que volver a subirla.',
  }
  return interno(`Campaña detenida · ${c.nombre}`, correo, 'campana_detenida')
}
