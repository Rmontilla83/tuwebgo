import { obtenerTasaBcv, bolivares, fechaCorta } from '@/lib/tasaBcv'

/**
 * Datos de cobro de TuWebGo y el bloque de texto que Sofía recita.
 *
 * Vive en código y no en la base a propósito: son datos que cambian una vez al
 * año, y tenerlos acá los deja versionados. Cambiar el Zelle es editar una
 * línea y desplegar.
 *
 * REGLA QUE SOSTIENE TODO ESTO: Sofía informa, nunca confirma. Puede entregar
 * los datos de pago —eso destraba la venta— pero no puede dar por recibido un
 * bolívar. Cuando el cliente dice que pagó, ella acusa recibo, manda el
 * formulario y le pasa el turno a Rafael para que verifique en el banco. El
 * lead NO avanza de etapa por el dicho del cliente.
 */

export const ZELLE = {
  correo: 'pagos@bahalu.com',
  titular: '4 Ward Studio',
}

export const PAGO_MOVIL = {
  banco: 'Banco Mercantil',
  codigoBanco: '0105',
  telefono: '0424-8672759',
  // Prefijo V asumido — corregir acá si la cédula es E.
  cedula: 'V-16.006.905',
}

/**
 * Formulario que se le manda al cliente después de que reporta el pago.
 *
 * Vacío = todavía no existe. Sofía lo detecta y en vez de inventar un link
 * dice que se lo mandan enseguida. Nunca improvises una URL acá: un enlace
 * roto en el mensaje de "ya pagaste" es la peor primera impresión posible.
 */
export const URL_FORMULARIO = ''

/**
 * Precios en dólares que se convierten a bolívares.
 *
 * Salen del CATALOGO de gemini.ts — planes y extras. Se precalculan porque un
 * modelo de lenguaje multiplicando 756,7083 × 250 se equivoca, y un monto malo
 * en una instrucción de pago es plata perdida y una discusión con el cliente.
 */
const PRECIOS_USD = [10, 15, 20, 25, 30, 35, 45, 50, 150, 250, 497]

const ETIQUETA_PRECIO: Record<number, string> = {
  50: 'pre-diseño',
  150: 'Landing Page',
  250: 'Sitio Web',
  497: 'Sitio Pro',
}

/**
 * Arma el bloque de pagos con la tasa del día ya resuelta.
 *
 * Se llama en cada respuesta y no una vez al arrancar: la tasa cambia todos los
 * días hábiles y un prompt construido al desplegar quedaría congelado.
 */
export async function bloquePagos(): Promise<string> {
  const tasa = await obtenerTasaBcv()

  const conversion = tasa
    ? [
        `TASA BCV DE HOY: Bs. ${bolivares(tasa.bs)} por dólar (publicada el ${fechaCorta(tasa.fecha)}).`,
        '',
        'MONTOS YA CALCULADOS EN BOLÍVARES — usá estos, NO multipliques vos:',
        ...PRECIOS_USD.map((usd) => {
          const etq = ETIQUETA_PRECIO[usd] ? ` (${ETIQUETA_PRECIO[usd]})` : ''
          return `  $${usd}${etq} = Bs. ${bolivares(usd * tasa.bs)}`
        }),
        '',
        'Si el monto que necesitás no está en esa lista, NO lo calcules: decí el',
        'precio en dólares y que le confirmás el equivalente en bolívares en un',
        'momento. Equivocar un monto de pago es peor que tardar dos minutos.',
      ].join('\n')
    : [
        'NO HAY TASA BCV DISPONIBLE EN ESTE MOMENTO.',
        'No inventes una tasa ni un monto en bolívares. Decí el precio en dólares',
        'y que le confirmás el monto exacto en bolívares al momento de pagar.',
      ].join('\n')

  const formulario = URL_FORMULARIO
    ? `Mandale este enlace: ${URL_FORMULARIO}`
    : [
        'TODAVÍA NO TENÉS EL ENLACE DEL FORMULARIO CARGADO. No inventes ninguno.',
        'Decile que ya le mandan el formulario para arrancar con el pre-diseño.',
      ].join('\n')

  return `
FORMAS DE PAGO — datos reales, se pueden dar tal cual

Zelle
  Correo: ${ZELLE.correo}
  A nombre de: ${ZELLE.titular}

Pago móvil (en bolívares)
  Banco: ${PAGO_MOVIL.banco} (${PAGO_MOVIL.codigoBanco})
  Teléfono: ${PAGO_MOVIL.telefono}
  Cédula: ${PAGO_MOVIL.cedula}

${conversion}

CUÁNDO DAR LOS DATOS
Apenas el cliente decida comprar o pregunte cómo pagar. No lo hagas esperar ni
digas "ya te los paso": los tenés, dáselos. Pasá los dos métodos juntos, son
cortos, y que elija. Después preguntá por cuál va a pagar.

SI PIDE PAYPAL, BINANCE O TRANSFERENCIA
Esos también se aceptan pero NO tenés los datos cargados. No los inventes.
Ofrecé Zelle o pago móvil, que son los que tenés a mano, y si insiste decile
que le pasan los datos enseguida y marcá handoff "pide_humano".

CUANDO EL CLIENTE DIGA QUE YA PAGÓ
Pasa apenas mande una referencia, una captura o un "listo, ya te transferí".

  1. Acusá recibo SIN dar el pago por confirmado. No digas "recibido",
     "confirmado" ni "ya lo vi": vos no ves la cuenta. Decí que lo están
     verificando.
  2. Mandale el formulario para arrancar con el pre-diseño.
     ${formulario.split('\n').join('\n     ')}
  3. Marcá handoff "pago_reportado".

  MAL:  "Listo, ya recibimos tu pago. Arrancamos."
  BIEN: "Perfecto, ya lo estamos verificando. Mientras tanto llena esto y
         arrancamos con tu pre-diseño."

Confirmar un pago que no llegó obliga a una conversación muy incómoda después.
Verificar toma minutos.
`.trim()
}
