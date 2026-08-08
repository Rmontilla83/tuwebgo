/**
 * Plantillas para aprobación de Meta.
 *
 * Solo hacen falta para escribir FUERA de la ventana de 24h. Dentro de la
 * ventana Sofía responde libre y no cuesta nada.
 *
 * Reglas de Meta que hay que respetar o rechaza la plantilla:
 *  · El nombre va en minúscula, solo letras, números y guion bajo
 *  · El cuerpo NO puede empezar ni terminar con una variable
 *  · Las variables son {{1}}, {{2}}… y deben ir en orden, sin saltos
 *  · Hay que dar un ejemplo por variable
 *
 * Sobre las categorías: es tentador declarar todo como UTILITY porque cuesta
 * ~6,5x menos ($0,0113 vs $0,0740). Meta revisa el contenido y recategoriza
 * igual — una plantilla que ofrece algo es MARKETING aunque digas otra cosa.
 * Declararla mal solo consigue que el costo cambie cuando no lo esperas.
 */

export type PlantillaWA = {
  name: string
  category: 'UTILITY' | 'MARKETING'
  /** Para qué sirve, mostrado en el CRM */
  proposito: string
  body: string
  /** Un ejemplo por variable, en orden */
  ejemplos: string[]
  footer?: string
}

export const PLANTILLAS: PlantillaWA[] = [
  {
    name: 'seguimiento_lead',
    category: 'UTILITY',
    proposito: 'El cliente no contestó y ya pasaron las 24 horas',
    body:
      'Hola {{1}}, ¿cómo vas? Te escribimos del equipo de TuWebGo para saber si pudiste ' +
      'pensar lo de la página web para {{2}}. Cualquier duda que tengas la respondemos con gusto.',
    ejemplos: ['Carlos', 'Repuestos El Zulia'],
  },
  {
    name: 'pre_diseno_listo',
    category: 'UTILITY',
    proposito: 'Avisar que el pre-diseño ya está listo para revisar',
    body:
      'Hola {{1}}, tu pre-diseño ya está listo. Te lo enviamos para que lo revises con calma ' +
      'y nos digas qué te gustaría cambiar: colores, textos, secciones, lo que sea. ' +
      'Ajustamos hasta que quede como lo imaginas.',
    ejemplos: ['Carlos'],
  },
  {
    name: 'recordatorio_pago',
    category: 'UTILITY',
    proposito: 'Aprobó el diseño pero todavía no ha pagado',
    body:
      'Hola {{1}}, quedamos en arrancar con tu {{2}}. Apenas confirmes el pago empezamos de una vez. ' +
      'Aceptamos Zelle, pago móvil, Binance y tarjeta, el que te quede más cómodo.',
    ejemplos: ['Carlos', 'Landing Page'],
  },
  {
    name: 'entrega_lista',
    category: 'UTILITY',
    proposito: 'La web del cliente ya está publicada',
    body:
      'Hola {{1}}, tu página ya está en línea en {{2}}. Échale un ojo y dinos si quieres ajustar algo. ' +
      'Cualquier cosa que necesites más adelante, aquí estamos.',
    ejemplos: ['Carlos', 'repuestoselzulia.com'],
  },
  {
    name: 'reactivacion_oferta',
    category: 'MARKETING',
    proposito: 'Reactivar leads dormidos — la que abre los 476 contactos de la base',
    body:
      'Hola {{1}}, te escribimos del equipo de TuWebGo. ¿Sigues interesado en la página web para {{2}}? ' +
      'Seguimos con el pre-diseño de $50: ves tu página real en 48 horas y si no te gusta te devolvemos el dinero.',
    ejemplos: ['Carlos', 'tu negocio'],
    footer: 'Responde BAJA si no quieres recibir más mensajes',
  },

  /* ══════════════════════════════════════════════════════════════
     PRIMER CONTACTO EN FRÍO — para los contactos scrapeados
     ══════════════════════════════════════════════════════════════
     Estas van a gente que NUNCA habló con TuWebGo. Meta exige opt-in y estos
     números no lo tienen, así que el riesgo real no es que rechacen la
     plantilla: es que el destinatario toque "Bloquear" o "Reportar". Eso baja
     el quality_score, Meta reduce el límite de mensajería y termina
     restringiendo el número.

     Por eso todas siguen las mismas reglas:
     · Decir QUIÉN escribe en la primera línea. Un mensaje anónimo se reporta.
     · Nombrar el negocio del destinatario: prueba que no es un envío masivo
       ciego y baja mucho la tasa de bloqueo.
     · Una sola pregunta, corta, sin presión.
     · Salida explícita en el footer. Que alguien responda BAJA es infinitamente
       mejor que un reporte a Meta.
     · Nada de urgencia falsa, mayúsculas ni promesas. Eso dispara tanto el
       rechazo de la revisión como el bloqueo del usuario. */

  {
    name: 'presentacion_negocio',
    category: 'MARKETING',
    proposito: 'Primer contacto en frío — presentación',
    body:
      'Hola {{1}}, te escribimos de TuWebGo. Hacemos páginas web para negocios en Venezuela ' +
      'desde $50 y listas en 48 horas. Vimos que {{2}} todavía no tiene una y quisimos ' +
      'contarte. ¿Te muestro cómo se vería?',
    ejemplos: ['Carlos', 'Repuestos El Zulia'],
    footer: 'Responde BAJA y no te escribimos más',
  },
  {
    name: 'oferta_prediseno_frio',
    category: 'MARKETING',
    proposito: 'Primer contacto en frío — directo a la oferta',
    body:
      'Hola {{1}}, somos TuWebGo. Por $50 te hacemos un pre-diseño real de la página de {{2}} ' +
      'en 48 horas, y si no te gusta te devolvemos el dinero completo, sin preguntas. ' +
      '¿Te gustaría verlo?',
    ejemplos: ['Carlos', 'Repuestos El Zulia'],
    footer: 'Responde BAJA y no te escribimos más',
  },
  {
    name: 'segundo_intento',
    category: 'MARKETING',
    proposito: 'Único reintento para quien no contestó el primero',
    body:
      'Hola {{1}}, te escribimos hace unos días de TuWebGo por la página web de {{2}}. ' +
      'Si te interesa seguimos con gusto, y si no, no te escribimos más. ¿Qué nos dices?',
    ejemplos: ['Carlos', 'Repuestos El Zulia'],
    footer: 'Responde BAJA y no te escribimos más',
  },
  {
    name: 'datos_para_arrancar',
    category: 'UTILITY',
    proposito: 'Ya aceptó — pedirle logo, fotos y textos',
    body:
      'Hola {{1}}, para arrancar con la página de {{2}} necesito unas cositas: tu logo si tienes, ' +
      'fotos de tus productos o del local, y los textos de qué haces y dónde estás. ' +
      '¿Me los puedes enviar por aquí?',
    ejemplos: ['Carlos', 'Repuestos El Zulia'],
  },
  {
    name: 'prediseno_recordatorio',
    category: 'UTILITY',
    proposito: 'Se le envió el pre-diseño y no dio señales',
    body:
      'Hola {{1}}, te dejamos el pre-diseño de {{2}} hace unos días y no supimos más. ' +
      '¿Pudiste verlo? Cualquier ajuste que quieras lo hacemos con gusto.',
    ejemplos: ['Carlos', 'Repuestos El Zulia'],
  },
]

/** Cuerpo con las variables reemplazadas, para previsualizar en el CRM. */
export function previsualizar(p: PlantillaWA): string {
  return p.body.replace(/\{\{(\d+)\}\}/g, (_, n) => p.ejemplos[Number(n) - 1] ?? `{{${n}}}`)
}

/** Traduce la plantilla al formato que espera la Graph API. */
export function aFormatoMeta(p: PlantillaWA) {
  const components: Record<string, unknown>[] = [
    {
      type: 'BODY',
      text: p.body,
      ...(p.ejemplos.length ? { example: { body_text: [p.ejemplos] } } : {}),
    },
  ]
  if (p.footer) components.push({ type: 'FOOTER', text: p.footer })

  return { name: p.name, language: 'es', category: p.category, components }
}

export const COSTO_APROX: Record<string, string> = {
  UTILITY: '$0,0113',
  MARKETING: '$0,0740',
}
