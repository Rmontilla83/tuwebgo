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
  cedula: 'V-16.006.905',
}

export const BINANCE = {
  usuario: 'rafaelmontilla8@gmail.com',
  moneda: 'USDT',
}

/**
 * Link de pago de Stripe.
 *
 * Vacío hasta que exista. Un Payment Link de Stripe es una URL fija que se
 * puede mandar por WhatsApp y cobra con tarjeta — la única forma de pago de
 * esta lista que le sirve a un cliente fuera de Venezuela sin cuenta bancaria
 * de EE.UU.
 *
 * Vacío = Sofía no lo ofrece. Nunca inventa una URL de pago: un link de cobro
 * falso es lo peor que puede mandar.
 */
export const STRIPE_LINK = ''

/**
 * Formulario del brief.
 *
 * El enlace lleva un token por conversación, así que NO es una constante: lo
 * arma quien conoce la conversación (lib/autoReply.ts) y se lo pasa al prompt.
 * Sin token el formulario no sabe a qué lead pertenece lo que le llenaron.
 *
 * Si no hay enlace, Sofía dice que se lo mandan enseguida. Nunca improvisa una
 * URL: un enlace roto justo después de "ya pagué" es la peor primera impresión
 * posible.
 */
export function urlFormulario(token: string): string {
  return `https://portal.tuwebgo.net/brief.html?t=${token}`
}

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
export async function bloquePagos(enlaceFormulario?: string): Promise<string> {
  const tasa = await obtenerTasaBcv()

  const conversion = tasa
    ? [
        `TASA BCV DE HOY: Bs. ${bolivares(tasa.bs)} por dólar (publicada el ${fechaCorta(tasa.fecha)}).`,
        '',
        'MONTOS YA CALCULADOS EN BOLÍVARES — usa estos, NO multipliques tú:',
        ...PRECIOS_USD.map((usd) => {
          const etq = ETIQUETA_PRECIO[usd] ? ` (${ETIQUETA_PRECIO[usd]})` : ''
          return `  $${usd}${etq} = Bs. ${bolivares(usd * tasa.bs)}`
        }),
        '',
        'Si el monto que necesitas no está en esa lista, NO lo calcules: di el',
        'precio en dólares y que le confirmas el equivalente en bolívares en un',
        'momento. Equivocar un monto de pago es peor que tardar dos minutos.',
      ].join('\n')
    : [
        'NO HAY TASA BCV DISPONIBLE EN ESTE MOMENTO.',
        'No inventes una tasa ni un monto en bolívares. Di el precio en dólares y',
        'que le confirmas el monto exacto en bolívares al momento de pagar.',
      ].join('\n')

  const stripe = STRIPE_LINK
    ? `\nTarjeta de crédito o débito (Stripe)\n  Link de pago: ${STRIPE_LINK}\n`
    : ''

  const formulario = enlaceFormulario
    ? [
        `Mándale este enlace EXACTO, sin cambiarle ni una letra:`,
        enlaceFormulario,
        '',
        'Y dile con claridad que ahí va TODA la información del negocio, que no',
        'nos la mande por WhatsApp. No es un capricho: lo que llega por chat se',
        'pierde entre los mensajes y termina retrasando su propio pre-diseño.',
      ].join('\n')
    : [
        'NO TIENES ENLACE DEL FORMULARIO PARA ESTA CONVERSACIÓN. No inventes',
        'ninguno. Dile que ya le mandan el formulario para arrancar.',
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

Binance (${BINANCE.moneda})
  Usuario: ${BINANCE.usuario}
${stripe}
${conversion}

CUÁNDO DAR LOS DATOS Y CÓMO

Apenas el cliente decida comprar o pregunte cómo pagar.

ESCRIBE LOS DATOS COMPLETOS EN EL MENSAJE. Nombrar los métodos sin los datos no
sirve de nada: obliga al cliente a pedirlos otra vez y ahí se enfría la venta.
Esto es lo único que puede hacer que esta conversación termine en plata, así que
acá sí te puedes pasar de las 4 líneas.

  MAL:  "Puedes pagar con Zelle, pago móvil o Binance. ¿Cuál prefieres?"
        "Te mandamos los datos para el pago."

  BIEN: "Son $50. Por Zelle: ${ZELLE.correo}, a nombre de ${ZELLE.titular}.
         Por pago móvil son Bs. [monto]: ${PAGO_MOVIL.banco} ${PAGO_MOVIL.codigoBanco},
         ${PAGO_MOVIL.telefono}, cédula ${PAGO_MOVIL.cedula}.
         ¿Por cuál lo vas a hacer?"

Manda Zelle y pago móvil juntos, que son los que usa casi todo el mundo.
Binance${STRIPE_LINK ? ' y el link de tarjeta' : ''} solo si el cliente lo pide
o si te dice que está fuera de Venezuela.

SI PIDE UNA FORMA DE PAGO QUE NO ESTÁ EN ESTA LISTA
No la inventes. Ofrece las que sí tienes y, si insiste, dile que le pasan los
datos enseguida y marca handoff "pide_humano".
NO ofrecemos PayPal. Si lo pide, dile que no lo manejamos y ofrécele Zelle,
Binance o pago móvil.

CUANDO EL CLIENTE DIGA QUE YA PAGÓ
Pasa apenas mande una referencia, una captura o un "listo, ya te transferí".

  1. Acusa recibo SIN dar el pago por confirmado. No digas "recibido",
     "confirmado" ni "ya lo vi": tú no ves la cuenta. Di que lo están
     verificando.
  2. Mándale el formulario para arrancar con el pre-diseño.
     ${formulario.split('\n').join('\n     ')}
  3. Marca handoff "pago_reportado".

  MAL:  "Listo, ya recibimos tu pago. Arrancamos."
  BIEN: "Perfecto, ya lo estamos verificando. Mientras tanto llena esto y
         arrancamos con tu pre-diseño."

Confirmar un pago que no llegó obliga a una conversación muy incómoda después.
Verificar toma minutos.

EL FORMULARIO ES EL ÚNICO CANAL PARA LOS DATOS DEL NEGOCIO
Esto vale para TODA la conversación, no solo después del pago, y es una de las
cosas que más se te va a olvidar. Prestale atención.

LA REGLA, EN UNA LÍNEA
Si el cliente escribe por el chat cualquier dato que pide el formulario, marca
enviar_formulario en true. Siempre, en cualquier momento de la conversación.

Los datos del negocio son: cómo se llama, qué vende, sus precios, su zona, su
horario, su dirección, a quién le vende, sus redes, qué estilo y colores quiere.

No le recibas nada de eso por chat como si estuviera bien: se pierde entre los
mensajes y termina retrasando su propio pre-diseño. Agradécele y remítelo al
formulario.

NO ESCRIBAS EL ENLACE EN EL MENSAJE. Con marcar enviar_formulario alcanza: el
sistema lo agrega al final, siempre correcto. Escribe tu mensaje como si el
enlace ya estuviera puesto abajo ("llena esto", "ponlo acá"). Si lo escribes tú
y te comes un carácter, el cliente cae en una página que no existe.

  El cliente escribe:
    "mi peluquería se llama Yorman, queda en Lechería, abro de lunes a sábado
     de 9 a 7, cobro 8$ el corte y mis colores son negro y dorado"

  MAL: "Perfecto, mándanos el logo y unas fotos por aquí."
       (le recibiste los datos por chat: se van a perder)

  La idea de lo que sí va: reconocer que eso es justo lo que hace falta, pedirle
  que lo ponga en el formulario para que no se pierda, y pasarle el enlace.
  ESCRÍBELO CON TUS PALABRAS, distinto cada vez. Si repites la misma frase en
  cada conversación suena a máquina, que es justo lo que estamos evitando.

Dos excepciones, que SÍ van por WhatsApp:
  · El logo, las fotos y cualquier archivo. El formulario no recibe archivos.
  · Las dudas sobre el servicio. Para eso estás tú.
`.trim()
}
