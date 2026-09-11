import { enviarCorreo, EQUIPO } from '@/lib/email/enviar'
import type { Correo } from '@/lib/email/plantilla'
import { SITIO } from '@/lib/config'
import { formatPhoneVE, waLink } from '@/lib/whatsapp'
import type { TurnoWeb } from '@/lib/firmaConversacion'

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

/**
 * El pre-diseño está listo. Va al CLIENTE.
 *
 * Es el correo que cobra los $50: hasta acá el cliente pagó por una promesa y
 * esto es la promesa cumplida. Por eso el enlace va en un botón grande y solo,
 * sin competir con nada, y el correo no pide nada a cambio salvo que mire.
 *
 * Se manda además del WhatsApp, no en su lugar. En el chat el enlace se pierde
 * entre mensajes a los dos días; en el correo sigue ahí cuando lo quiera
 * enseñar a un socio o a la esposa, que es exactamente lo que pasa cuando
 * alguien va a decidir sobre su negocio.
 */
export function avisarPredisenoListo(p: { correo: string; negocio: string; url: string }) {
  const cuerpo: Correo = {
    preheader: `La página de ${p.negocio} ya está lista para que la veas.`,
    etiqueta: 'Tu pre-diseño está listo',
    tono: 'bueno',
    titulo: 'Tu página ya está lista',
    parrafos: [
      `Terminamos el pre-diseño de ${p.negocio}. Ábrelo desde el botón y date una vuelta con calma, en el teléfono y en la computadora.`,
      'Esto no es una maqueta ni una plantilla de muestra: es tu página, con tus textos, tus servicios y tus datos de contacto.',
      'Cuando la veas, respóndenos por WhatsApp y dinos qué cambiarías. Colores, textos, el orden de las secciones, lo que sea. Ajustamos hasta que quede como la imaginaste.',
    ],
    boton: { texto: 'Ver mi página', url: p.url },
    nota: 'Si el botón no abre, copia y pega esta dirección en tu navegador: ' + p.url,
  }
  return enviarCorreo({
    para: p.correo,
    asunto: `Tu página está lista — ${p.negocio}`,
    correo: cuerpo,
    etiqueta: 'prediseno_listo',
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

/* ══════════════════════════════════════════════════════════════
   5. Formulario de contacto de tuwebgo.net
   ══════════════════════════════════════════════════════════════ */

/**
 * A quién le llegan los contactos de la web: a Rafael, que lo pidió así.
 * A diferencia del SLA, Jodany no. Si algún día hace falta, se agrega acá.
 */
const DESTINO_CONTACTO_WEB = EQUIPO[0]

/** De qué botón vino, dicho como lo diría una persona. */
const ORIGEN_LEGIBLE: Record<string, string> = {
  nav: 'Menú de arriba',
  mobile_menu: 'Menú del celular',
  hero: 'Portada',
  proceso: 'Sección "Proceso"',
  pricing: 'Precios',
  cta_final: 'Cierre de la página',
  footer_link: 'Pie de página',
  floating: 'Botón flotante',
  enlace: 'Enlace directo a #contacto',
  asistente: 'Chat con Sofía en la web',
}

export type ContactoWeb = {
  nombre: string
  negocio: string | null
  /** Móvil o internacional en E.164 sin "+": el único que sirve para WhatsApp. */
  telefonoE164: string | null
  /** Lo que escribió tal cual, por si es un fijo que no pasa a E.164. */
  telefono: string | null
  correo: string | null
  /** Ya legible: "Sitio Pro ($497)", no la clave. */
  plan: string | null
  mensaje: string | null
  idioma: 'es' | 'en'
  origen: string | null
  /** La etapa en la que ya estaba en el CRM. null si es un contacto nuevo. */
  etapaPrevia: string | null
  /** false si la base falló y este correo es lo único que quedó del contacto. */
  guardado: boolean
  /** La conversación con Sofía en la web, ya verificada por firma. */
  conversacion?: TurnoWeb[] | null
}

/**
 * Alguien llenó el formulario de la web.
 *
 * Este correo ES la notificación. A diferencia de WhatsApp, acá no hay Sofía
 * respondiendo mientras tanto: hasta que alguien le escriba, el cliente no
 * sabe nada de nosotros. Por eso el botón principal no lleva al portal sino
 * directo a escribirle, con el saludo ya redactado.
 *
 * El botón abre el WhatsApp de quien lee el correo, no el del negocio. Eso es
 * justo lo que hace falta mientras el número de la API esté bloqueado.
 */
export function avisarContactoWeb(c: ContactoWeb) {
  const primerNombre = c.nombre.split(' ')[0]
  const saludo =
    c.idioma === 'en'
      ? `Hi ${primerNombre}, this is TuWebGo. Thanks for reaching out through our website.`
      : `Hola ${primerNombre}, te escribo de TuWebGo por el mensaje que nos dejaste en la web.`
  const whatsapp = c.telefonoE164 ? waLink(c.telefonoE164, saludo) : null

  const boton = whatsapp
    ? { texto: 'Escribirle por WhatsApp', url: whatsapp }
    : c.telefono
      ? { texto: 'Llamar', url: `tel:${c.telefono.replace(/[^\d+]/g, '')}` }
      : c.correo
        ? { texto: 'Responderle por correo', url: `mailto:${c.correo}` }
        : undefined

  const correo: Correo = {
    preheader: `${c.nombre}${c.negocio ? ` (${c.negocio})` : ''} dejó sus datos en la web${c.plan ? `. Le interesa: ${c.plan}` : ''}.`,
    etiqueta: 'Contacto desde la web',
    tono: c.guardado ? 'aviso' : 'urgente',
    titulo: `${c.nombre} quiere hablar con nosotros`,
    parrafos: [
      ...(c.guardado
        ? []
        : ['Ojo: no se pudo guardar en el CRM. Este correo es lo único que quedó de este contacto.']),
      c.conversacion?.length
        ? `Conversó con Sofía en tuwebgo.net${c.idioma === 'en' ? ' (versión en inglés)' : ''} y dejó sus datos. Sofía le resolvió dudas pero no da datos de pago: el siguiente paso es tuyo. La conversación está abajo.`
        : `Llenó el formulario de tuwebgo.net${c.idioma === 'en' ? ' desde la versión en inglés' : ''}. No pasó por WhatsApp ni por Sofía, así que nadie le ha respondido todavía.`,
      whatsapp
        ? 'El botón abre tu WhatsApp con un saludo listo para mandarle.'
        : c.telefono
          ? 'El teléfono que dejó no es de WhatsApp: la vía es llamar.'
          : 'Solo dejó correo: respóndele desde aquí mismo.',
    ],
    datos: [
      ['Nombre', c.nombre],
      c.negocio ? ['Negocio', c.negocio] : null,
      c.telefono ? ['Teléfono', c.telefonoE164 ? formatPhoneVE(c.telefonoE164) : c.telefono] : null,
      c.correo ? ['Correo', c.correo] : null,
      c.plan ? ['Le interesa', c.plan] : null,
      c.mensaje ? ['Lo que escribió', c.mensaje] : null,
      [
        'En el CRM',
        !c.guardado
          ? 'No se guardó'
          : c.etapaPrevia
            ? `Ya estaba, en "${c.etapaPrevia.replace(/_/g, ' ')}"`
            : 'Contacto nuevo',
      ],
      c.origen ? ['Botón que usó', ORIGEN_LEGIBLE[c.origen] ?? c.origen] : null,
      // Lo último de la conversación, que es lo que sirve para abordarlo.
      ...(c.conversacion ?? []).slice(-12).map((t) => [t.rol === 'sofia' ? 'Sofía' : 'Visitante', t.texto.slice(0, 500)]),
    ].filter(Boolean) as [string, string][],
    boton,
    enlace: { texto: 'Ver el pipeline', url: `${PORTAL}/dashboard/pipeline` },
    nota: c.correo
      ? `Si le das a responder, el correo le llega directo a ${c.correo}.`
      : 'No dejó correo: si respondes este mensaje, no le llega.',
  }

  return enviarCorreo({
    para: DESTINO_CONTACTO_WEB,
    asunto: `${c.conversacion?.length ? 'Interesado desde el chat' : 'Contacto web'} · ${c.nombre}${c.negocio ? ` · ${c.negocio}` : ''}`,
    correo,
    etiqueta: 'contacto_web',
    // Responder desde Gmail le escribe al cliente, no a hola@tuwebgo.net.
    ...(c.correo ? { responderA: c.correo } : {}),
  })
}

/**
 * La confirmación al que llenó el formulario. Solo en español: la plantilla
 * de marca está en español, y un correo mitad en cada idioma se ve peor que
 * no mandarlo.
 *
 * Es el único correo del sistema que sale hacia una dirección que escribió un
 * desconocido. Por eso NO repite nada de lo que escribió salvo el nombre, y
 * solo si parece un nombre (lo decide quien llama): si no, este correo serviría
 * para mandar texto arbitrario, con nuestra marca, a la dirección de otro.
 */
export function confirmarContactoAlCliente(c: { correo: string; nombre: string | null; conTelefono: boolean }) {
  const cuerpo: Correo = {
    preheader: 'Ya tenemos tus datos. Te contactamos muy pronto.',
    etiqueta: 'Recibido',
    tono: 'bueno',
    titulo: 'Recibimos tu mensaje',
    parrafos: [
      `${c.nombre ? `Gracias por escribirnos, ${c.nombre}.` : 'Gracias por escribirnos.'} Tus datos ya le llegaron al equipo.`,
      c.conTelefono
        ? 'Te vamos a contactar por teléfono o por WhatsApp para conocer tu negocio y contarte cómo arrancamos.'
        : 'Te vamos a responder por este mismo correo para conocer tu negocio y contarte cómo arrancamos.',
      'Mientras tanto, puedes ver algunas de las páginas que ya hicimos para otros negocios.',
    ],
    boton: { texto: 'Ver trabajos', url: `${SITIO}/#portafolio` },
    nota: 'Si quieres agregar algo, responde a este correo y le llega directo a una persona del equipo.',
  }
  return enviarCorreo({
    para: c.correo,
    asunto: 'Recibimos tu mensaje — TuWebGo',
    correo: cuerpo,
    etiqueta: 'contacto_confirmacion',
    responderA: EQUIPO[0],
  })
}
