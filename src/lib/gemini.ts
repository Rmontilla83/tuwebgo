/**
 * Asistente de redacción con Gemini.
 *
 * Redacta el BORRADOR de la respuesta; Rafael la lee, la edita si hace falta y
 * la manda. No responde solo. Eso encaja con la Fase 0 (donde el envío ya es
 * manual) y elimina el riesgo de que un modelo le invente algo a un cliente.
 *
 * Toda la información comercial vive en CATALOGO y viene textual de la landing
 * (secciones #proceso, #precios y #faq de Tuwebgolanding/index.html). Cuando
 * cambien los precios, se cambian ACÁ — no en el prompt suelto.
 */

// Modelos verificados contra la API con esta cuenta el 2026-08-07.
export const MODELO_POR_DEFECTO = 'gemini-2.5-flash'

const CATALOGO = `
PLANES (pago único, precios en USD):
- Pre-diseño — $50. Bosquejo funcional de la web, entrega en 48 horas, sin
  compromiso de compra. GARANTÍA: si no le gusta, se le devuelven los $50 sin
  preguntas. Es la puerta de entrada y el argumento más fuerte.
- Landing Page — desde $150. Subdominio gratis (sunegocio.tuwebgo.net), hosting
  incluido, responsive, SEO y rendimiento optimizados, 2 rondas de ajustes.
  No obliga a comprar dominio.
- Sitio Web — desde $250 + dominio anual. 3 a 5 páginas, todo lo de Landing,
  secciones a medida, formulario de contacto funcional, SEO avanzado.
- Sitio Pro — $497. Todo lo de Sitio Web + Google My Business configurado,
  WhatsApp Business con link directo, SEO local avanzado, Pixel de Meta +
  Google Analytics 4, 3 meses de mantenimiento y 3 reels cortos.

EXTRAS (se suman a cualquier plan):
Google My Business $30 · Setup WhatsApp Business $20 · Pixel Meta + GA4 $25 ·
SEO local avanzado $35 · Diseño de logo $30 · Foto curada del negocio $20 ·
Mantenimiento mensual $10/mes · Ronda extra de ajustes $15

TIEMPOS DE ENTREGA (no prometer nada distinto):
- Pre-diseño: 48 horas
- Landing Page completa: 3 a 5 días hábiles
- Sitio Web de varias páginas: 5 a 10 días hábiles
Dependen de que el cliente mande textos y feedback a tiempo.

PAGOS: Zelle, PayPal, Binance (USDT), pago móvil y transferencia bancaria.
El pre-diseño se paga por adelantado. El resto del proyecto: 50% al aprobar el
diseño y 50% al entregar.

DOMINIO: los planes incluyen hosting. El dominio .com cuesta aparte, entre
$10 y $15 al año, y TuWebGo guía en la compra y configuración.

PROCESO: (1) escribe por WhatsApp, (2) cuenta de qué va su negocio,
(3) en 48h recibe el pre-diseño por $50, (4) aprueba y se entrega.
`.trim()

const INSTRUCCION = `
Sos Rafael Montilla, dueño de TuWebGo. Hacés páginas web para pequeños negocios
en Venezuela. Estás respondiendo por WhatsApp.

CÓMO ESCRIBÍS
- Español de Venezuela, natural y cercano. Tuteo.
- Corto: 2 a 4 líneas. Es WhatsApp, no un correo.
- Directo y sin corporativismo. Nada de "estimado cliente", "quedo a sus
  órdenes", "en TuWebGo nos caracterizamos por".
- Nunca uses expresiones de otros países ("¿te late?", "órale", "che", "vale la
  pena que agendemos"). Si querés cerrar, preguntá simple: "¿Te animas?",
  "¿Arrancamos?", "¿Te sirve así?".
- Como mucho un emoji, y solo si suma. Muchas veces ninguno es mejor.

CÓMO VENDÉS
- El público son dueños de negocio que desconfían y a veces ya los estafaron.
  La objeción número uno es "me van a robar". Tu mejor arma es el pre-diseño de
  $50 con devolución garantizada: ven algo real antes de invertir más.
- Reconocé la objeción antes de responderla. No la atropelles con argumentos.
- Un solo próximo paso claro por mensaje. No des tres opciones.
- Si el lead ya está avanzado, no vuelvas a explicar lo básico.

REGLAS QUE NO SE ROMPEN
- Nunca inventes precios, plazos, funcionalidades ni formas de pago. Si algo no
  está en el catálogo, decí que lo consultás y respondés — no improvises.
- Nunca prometas resultados de posicionamiento ("primer lugar en Google"),
  cantidad de ventas ni de clientes.
- No inventes nombres de clientes, casos de éxito ni cifras.
- Si el mensaje del cliente no se entiende, pedí que aclare en vez de asumir.

SALIDA
Devolvé ÚNICAMENTE el texto del mensaje, listo para pegar en WhatsApp.
Sin comillas, sin "Respuesta:", sin explicaciones, sin alternativas.
`.trim()

export type ContextoLead = {
  nombre?: string | null
  negocio?: string | null
  etapa?: string | null
  plan?: string | null
  montoCotizado?: number | null
  canal?: string | null
  refCode?: string | null
}

export type TurnoConversacion = {
  autor: 'rafael' | 'cliente'
  texto: string
  fecha?: string | null
}

const ETIQUETA_ETAPA: Record<string, string> = {
  nuevo: 'Nuevo — todavía no se le ha escrito',
  contactado: 'Contactado — ya hubo primer contacto',
  pre_diseno_enviado: 'Se le envió el pre-diseño, esperando su feedback',
  aprobado: 'Aprobó el diseño — falta cobrar y arrancar',
  pagado: 'Ya pagó — proyecto en ejecución',
  entregado: 'Proyecto entregado',
  perdido: 'Se dio por perdido — reactivación',
}

const ETIQUETA_PLAN: Record<string, string> = {
  pre_diseno: 'Pre-diseño ($50)',
  landing_page: 'Landing Page (desde $150)',
  sitio_web: 'Sitio Web (desde $250)',
}

export function construirPrompt(
  lead: ContextoLead,
  conversacion: TurnoConversacion[],
  instruccionExtra?: string
): string {
  const ctx = [
    lead.nombre && `- Nombre: ${lead.nombre}`,
    lead.negocio && `- Negocio: ${lead.negocio}`,
    lead.etapa && `- Etapa: ${ETIQUETA_ETAPA[lead.etapa] ?? lead.etapa}`,
    lead.plan && `- Plan de interés: ${ETIQUETA_PLAN[lead.plan] ?? lead.plan}`,
    lead.montoCotizado && `- Ya cotizado: $${lead.montoCotizado}`,
    lead.canal && `- Llegó por: ${lead.canal}`,
    lead.refCode && `- Vino de la web (sesión ${lead.refCode})`,
  ].filter(Boolean).join('\n')

  const hilo = conversacion.length
    ? conversacion.map((t) => `${t.autor === 'rafael' ? 'Rafael' : 'Cliente'}: ${t.texto}`).join('\n')
    : '(todavía no hay mensajes)'

  return [
    `CONTEXTO DEL LEAD:\n${ctx || '(sin datos cargados)'}`,
    `\nCONVERSACIÓN HASTA AHORA:\n${hilo}`,
    instruccionExtra ? `\nINDICACIÓN DE RAFAEL PARA ESTE MENSAJE:\n${instruccionExtra}` : '',
    `\nRedactá el próximo mensaje de Rafael.`,
  ].join('\n')
}

type RespuestaGemini = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
  error?: { message?: string; code?: number }
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
}

/**
 * Llama a Gemini y devuelve el borrador.
 *
 * thinkingBudget: 0 es deliberado. Con el razonamiento activado (que viene por
 * defecto en 2.5+), los tokens de thinking se cuentan dentro de
 * maxOutputTokens: en las pruebas consumió 383 de 400 y la respuesta salió
 * cortada a media frase. Para un mensaje de WhatsApp no aporta nada.
 */
export async function redactarBorrador(opts: {
  apiKey: string
  modelo?: string
  lead: ContextoLead
  conversacion: TurnoConversacion[]
  instruccionExtra?: string
}): Promise<{ texto: string; tokens: number }> {
  const modelo = opts.modelo || MODELO_POR_DEFECTO

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': opts.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: `${INSTRUCCION}\n\n=== CATÁLOGO Y CONDICIONES ===\n${CATALOGO}` }] },
        contents: [{ role: 'user', parts: [{ text: construirPrompt(opts.lead, opts.conversacion, opts.instruccionExtra) }] }],
        generationConfig: {
          temperature: 0.75,
          maxOutputTokens: 400,
          thinkingConfig: { thinkingBudget: 0 },
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
        ],
      }),
    }
  )

  const data = (await res.json()) as RespuestaGemini

  if (data.error) throw new Error(`Gemini: ${data.error.message ?? 'error desconocido'}`)

  const cand = data.candidates?.[0]
  const texto = (cand?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim()

  if (!texto) {
    throw new Error(
      cand?.finishReason === 'SAFETY'
        ? 'Gemini bloqueó la respuesta por filtros de seguridad.'
        : `Gemini no devolvió texto (finishReason: ${cand?.finishReason ?? 'desconocido'}).`
    )
  }

  // A veces envuelve el mensaje en comillas pese a la instrucción.
  const limpio = texto.replace(/^["“”']|["“”']$/g, '').trim()

  return { texto: limpio, tokens: data.usageMetadata?.candidatesTokenCount ?? 0 }
}
