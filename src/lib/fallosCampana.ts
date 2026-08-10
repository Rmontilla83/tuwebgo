/**
 * De quién es la culpa cuando un envío de campaña falla.
 *
 * No todos los fallos dicen lo mismo, y tratarlos igual fue lo que dejó las
 * campañas trancadas: 4 números sin WhatsApp y 1 excluido por un experimento
 * de Meta dieron 25% de fallo sobre 20 envíos, el freno corta en 20%, y el
 * botón pasó a "Envío bloqueado" con la plantilla recién aprobada y todo
 * funcionando.
 *
 * Son dos cosas distintas:
 *
 *  DEL CONTACTO — ese número no tiene WhatsApp, no existe, o Meta lo excluyó.
 *    Es el costo normal de una lista scrapeada de Google Maps: un teléfono
 *    publicado en una ficha no garantiza que tenga WhatsApp. No dice nada de
 *    nuestro mensaje y NO puede frenar la campaña.
 *
 *  DEL SISTEMA — plantilla sin aprobar o pausada, parámetros que no cuadran,
 *    token vencido, cuenta restringida. Esto sí significa "para todo": le va
 *    a pasar igual a los 173 y cada intento gasta cuota y reputación.
 *
 * El freno de calidad solo mira los del sistema. Los del contacto se cuentan
 * y se muestran aparte, porque sí dicen algo útil —qué tan buena es la lista—
 * pero no son motivo para detenerse.
 */

/**
 * Códigos de Meta que significan "ese destinatario no se puede alcanzar".
 *
 * Se comparan por código y no solo por texto porque el texto cambia con el
 * idioma y con la versión de la API; el código no. Los envíos nuevos guardan
 * el código adelante (`[131026] ...`), y para las filas viejas que no lo
 * tienen queda el respaldo por texto.
 */
const CODIGOS_DEL_CONTACTO = new Set([
  131026, // Message undeliverable: el número no tiene WhatsApp o no puede recibir
  131052, // No se pudo descargar el medio del usuario
  131053, // Medio subido no soportado por el destinatario
  131056, // Demasiados mensajes a ESE par emisor/receptor
  138000, // El destinatario está en un experimento de Meta
])

const TEXTO_DEL_CONTACTO =
  /undeliverable|not a whatsapp user|no( es|s)? (un )?usuario|part of an experiment|experimento|invalid.*(recipient|phone)|recipient.*(invalid|not)/i

/** Extrae el código que el envío guardó al principio del mensaje de error. */
export function codigoDeError(error: string | null | undefined): number | null {
  const m = /^\[(\d{2,6})\]/.exec((error ?? '').trim())
  return m ? Number(m[1]) : null
}

/**
 * true = el fallo es de ese contacto y no nuestro.
 *
 * Ante la duda devuelve false, o sea "puede ser del sistema". Un fallo nuestro
 * que se cuela como "del contacto" apaga el freno justo cuando hace falta, y
 * eso cuesta la reputación del número — que es lo más caro de reemplazar.
 */
export function esFalloDelContacto(error: string | null | undefined): boolean {
  const cod = codigoDeError(error)
  if (cod !== null) return CODIGOS_DEL_CONTACTO.has(cod)
  return TEXTO_DEL_CONTACTO.test(error ?? '')
}
