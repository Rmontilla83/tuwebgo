import { MODELO_POR_DEFECTO } from '@/lib/gemini'

const GRAPH = process.env.GRAPH_API_VERSION || 'v26.0'

/**
 * Archivos que llegan por WhatsApp: descarga y transcripción.
 *
 * Meta no manda el archivo en el webhook, manda un id. Bajarlo son dos saltos
 * y los dos necesitan el token:
 *   1. GET /{media_id}      → devuelve una URL temporal
 *   2. GET esa URL          → el binario
 *
 * La URL del paso 1 vence a los ~5 minutos, así que guardarla no sirve para
 * nada. Por eso el archivo se copia a Supabase Storage: sin eso, una nota de
 * voz es inescuchable al rato de haber llegado.
 */

/** Tope de descarga. Una nota de voz de WhatsApp ronda 1 KB por segundo. */
const MAX_BYTES = 16 * 1024 * 1024

type MetaMedia = { url?: string; mime_type?: string; file_size?: number; error?: { message?: string } }

export async function descargarMedia(mediaId: string, token: string): Promise<{
  datos: Buffer
  mime: string
} | null> {
  try {
    const metaRes = await fetch(`https://graph.facebook.com/${GRAPH}/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    })
    const meta = (await metaRes.json()) as MetaMedia
    if (!metaRes.ok || !meta.url) {
      throw new Error(meta.error?.message ?? `HTTP ${metaRes.status} pidiendo la URL`)
    }
    if (meta.file_size && meta.file_size > MAX_BYTES) {
      throw new Error(`archivo de ${Math.round(meta.file_size / 1024)} KB, por encima del tope`)
    }

    // La URL del CDN de Meta TAMBIÉN exige el token. Sin la cabecera devuelve
    // 401 y es un error fácil de diagnosticar mal, porque la URL parece pública.
    const binRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(30000),
    })
    if (!binRes.ok) throw new Error(`HTTP ${binRes.status} bajando el archivo`)

    const datos = Buffer.from(await binRes.arrayBuffer())
    if (datos.length > MAX_BYTES) throw new Error('el archivo excede el tope')

    return { datos, mime: meta.mime_type ?? 'application/octet-stream' }
  } catch (e) {
    console.error('[waMedia] descargar:', e instanceof Error ? e.message : e)
    return null
  }
}

/* ══════════════════════════════════════════════════════════════
   TRANSCRIPCIÓN
   ══════════════════════════════════════════════════════════════ */

type RespuestaGemini = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
  error?: { message?: string }
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
}

/**
 * El prompt es corto y terminante a propósito.
 *
 * Un modelo al que le das un audio tiende a resumirlo, a comentarlo o a
 * contestarlo. Acá lo único que se quiere es el texto: quien lo va a
 * interpretar es Sofía, con todo el catálogo delante, no este llamado.
 */
const INSTRUCCION = `
Transcribe este audio a texto, palabra por palabra.

- Devuelve SOLO la transcripción. Nada de introducciones, comillas, comentarios
  ni "el audio dice".
- Es español de Venezuela: respeta el modo de hablar, no lo corrijas ni lo
  hagas más formal.
- Si se escucha mal o no se entiende nada, devuelve exactamente: [inaudible]
- Si el audio está vacío o en silencio, devuelve exactamente: [sin audio]
`.trim()

/** Recorte de la transcripción. Una nota de voz de 5 minutos no aporta más. */
const MAX_CARACTERES = 3000

export async function transcribirAudio(opts: {
  apiKey: string
  modelo?: string
  datos: Buffer
  mime: string
}): Promise<{ texto: string; tokensIn: number; tokensOut: number; modelo: string } | null> {
  const modelo = opts.modelo || MODELO_POR_DEFECTO

  // WhatsApp manda "audio/ogg; codecs=opus" y la API de Gemini rechaza el
  // parámetro extra. Se queda solo con el tipo.
  const mime = opts.mime.split(';')[0].trim()

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
      {
        method: 'POST',
        headers: { 'x-goog-api-key': opts.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { text: INSTRUCCION },
              { inline_data: { mime_type: mime, data: opts.datos.toString('base64') } },
            ],
          }],
          generationConfig: {
            temperature: 0,          // transcribir no es escribir: cero invención
            maxOutputTokens: 1200,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal: AbortSignal.timeout(60000),
      }
    )

    const data = (await res.json()) as RespuestaGemini
    if (data.error) throw new Error(data.error.message ?? 'error desconocido')

    const texto = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? '').join('').trim().slice(0, MAX_CARACTERES)

    if (!texto) throw new Error('Gemini no devolvió texto')

    return {
      texto,
      tokensIn: data.usageMetadata?.promptTokenCount ?? 0,
      tokensOut: data.usageMetadata?.candidatesTokenCount ?? 0,
      modelo,
    }
  } catch (e) {
    console.error('[waMedia] transcribir:', e instanceof Error ? e.message : e)
    return null
  }
}

/** ¿La transcripción sirve para que Sofía conteste algo? */
export function transcripcionUtil(texto: string): boolean {
  const t = texto.trim().toLowerCase()
  return t.length > 0 && t !== '[inaudible]' && t !== '[sin audio]'
}
