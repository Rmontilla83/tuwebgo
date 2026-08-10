/**
 * La plantilla de marca de TuWebGo para correo.
 *
 * El correo no es una página web y escribirlo como si lo fuera es la forma
 * más rápida de que llegue roto. Lo que manda acá:
 *
 *  · TABLAS para maquetar. Outlook usa el motor de Word: flex y grid no
 *    existen, y un div con `display:flex` colapsa en una columna sin aviso.
 *  · ESTILOS EN LÍNEA. Gmail borra el <head> cuando reenvías un correo, así
 *    que todo lo que importa va en el atributo `style` de cada celda.
 *  · NADA DE SVG. Gmail no lo renderiza — sale el hueco del alt. Por eso el
 *    logo es PNG a 2x (360px para mostrarse a 180).
 *  · 600px de ancho, que es lo que entra en el panel de lectura de Outlook.
 *  · Debajo de 102 KB o Gmail corta el correo y muestra "ver mensaje
 *    completo", justo encima de la firma.
 *
 * Y una regla de negocio: esto lo abre gente que nos está pagando para que le
 * hagamos su página. Un correo nuestro que se vea mal es la peor carta de
 * presentación posible.
 */

import { SITIO } from '@/lib/config'

/** Los assets viven en el portal: el correo necesita una URL absoluta y pública. */
const ASSETS = 'https://portal.tuwebgo.net/email'

const C = {
  tinta: '#0F172A',
  cuerpo: '#475569',
  suave: '#94A3B8',
  linea: '#E2E8F0',
  fondo: '#F1F5F9',
  tarjeta: '#FFFFFF',
  indigo: '#4F46E5',
  indigoOscuro: '#1E1B4B', // el mismo fondo que trae el logo, para que no se note el corte
  ambarBg: '#FFFBEB',
  ambarBorde: '#FDE68A',
  ambarTinta: '#92400E',
  rojoBg: '#FEF2F2',
  rojoBorde: '#FECACA',
  rojoTinta: '#991B1B',
  verdeBg: '#F0FDF4',
  verdeBorde: '#BBF7D0',
  verdeTinta: '#166534',
}

const FUENTE =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif"

export type Tono = 'neutro' | 'urgente' | 'aviso' | 'bueno'

const TONOS: Record<Tono, { bg: string; borde: string; tinta: string }> = {
  neutro:  { bg: '#EEF2FF', borde: '#C7D2FE', tinta: '#3730A3' },
  urgente: { bg: C.rojoBg,  borde: C.rojoBorde,  tinta: C.rojoTinta },
  aviso:   { bg: C.ambarBg, borde: C.ambarBorde, tinta: C.ambarTinta },
  bueno:   { bg: C.verdeBg, borde: C.verdeBorde, tinta: C.verdeTinta },
}

/** Nada de lo que venga de un cliente entra crudo en el HTML. */
export function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export type Correo = {
  /** Lo que se lee en la lista antes de abrir. Si falta, el cliente muestra el HTML crudo. */
  preheader: string
  /** La etiqueta de color arriba del título. */
  etiqueta?: string
  tono?: Tono
  titulo: string
  /** Párrafos. Se escapan solos. */
  parrafos?: string[]
  /** Filas de datos, en orden. Los valores se escapan. */
  datos?: [string, string][]
  boton?: { texto: string; url: string }
  /** Nota chica al final, antes del pie. */
  nota?: string
}

const parrafo = (t: string) =>
  `<p style="margin:0 0 14px;font-family:${FUENTE};font-size:15px;line-height:1.6;color:${C.cuerpo};">${esc(t)}</p>`

/** Fila de dato. La etiqueta arriba y chica, el valor abajo y fuerte: en 320px de pantalla dos columnas se aplastan. */
const fila = ([k, v]: [string, string], ultima: boolean) => `
<tr>
  <td style="padding:11px 16px;${ultima ? '' : `border-bottom:1px solid ${C.linea};`}">
    <div style="font-family:${FUENTE};font-size:11px;line-height:1.4;letter-spacing:.06em;text-transform:uppercase;color:${C.suave};font-weight:700;">${esc(k)}</div>
    <div style="font-family:${FUENTE};font-size:15px;line-height:1.5;color:${C.tinta};font-weight:600;margin-top:3px;">${esc(v)}</div>
  </td>
</tr>`

/**
 * Botón "a prueba de balas": el fondo lo pinta el <td>, no el <a>.
 *
 * Outlook ignora el padding de un enlace, así que un botón hecho solo con <a>
 * le sale como texto suelto sin fondo.
 */
const boton = (b: { texto: string; url: string }) => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 4px;">
  <tr>
    <td align="center" bgcolor="${C.indigo}" style="border-radius:10px;">
      <a href="${esc(b.url)}" target="_blank"
         style="display:inline-block;padding:14px 30px;font-family:${FUENTE};font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:10px;">
        ${esc(b.texto)}
      </a>
    </td>
  </tr>
</table>`

export function render(c: Correo): string {
  const tono = TONOS[c.tono ?? 'neutro']

  const etiqueta = c.etiqueta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;">
         <tr><td style="background:${tono.bg};border:1px solid ${tono.borde};border-radius:999px;padding:5px 13px;font-family:${FUENTE};font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${tono.tinta};">${esc(c.etiqueta)}</td></tr>
       </table>`
    : ''

  const datos = c.datos?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
              style="margin:18px 0 4px;border:1px solid ${C.linea};border-radius:12px;background:#FAFBFC;">
         ${c.datos.map((d, i) => fila(d, i === c.datos!.length - 1)).join('')}
       </table>`
    : ''

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<!-- Sin esto, el modo oscuro de algunos clientes invierte los colores por su
     cuenta y el logo queda sobre un fondo que no es el que se diseñó. -->
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(c.titulo)}</title>
</head>
<body style="margin:0;padding:0;background:${C.fondo};">

<!-- El preheader: lo que se lee en la bandeja debajo del asunto. El bloque de
     caracteres invisibles después empuja el resto del HTML fuera de esa
     vista previa, que si no arrastra el texto del pie. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(c.preheader)}</div>
<div style="display:none;max-height:0;overflow:hidden;">${'&#847;&zwnj;&nbsp;'.repeat(60)}</div>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${C.fondo};">
<tr><td align="center" style="padding:28px 12px;">

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"
         style="width:100%;max-width:600px;background:${C.tarjeta};border-radius:16px;overflow:hidden;border:1px solid ${C.linea};">

    <!-- Cabecera. El PNG del logo ya trae este mismo fondo, así que el borde
         no se nota ni cuando el cliente de correo bloquea el color de fondo. -->
    <tr>
      <td align="center" bgcolor="${C.indigoOscuro}" style="background:${C.indigoOscuro};padding:26px 24px;">
        <a href="${SITIO}" target="_blank" style="text-decoration:none;">
          <img src="${ASSETS}/logo.png" width="180" height="39" alt="TuWebGo"
               style="display:block;border:0;outline:none;width:180px;height:39px;">
        </a>
      </td>
    </tr>

    <tr>
      <td style="padding:30px 28px 26px;">
        ${etiqueta}
        <h1 style="margin:0 0 14px;font-family:${FUENTE};font-size:23px;line-height:1.3;color:${C.tinta};font-weight:800;letter-spacing:-.01em;">${esc(c.titulo)}</h1>
        ${(c.parrafos ?? []).map(parrafo).join('')}
        ${datos}
        ${c.boton ? boton(c.boton) : ''}
        ${c.nota ? `<p style="margin:20px 0 0;padding-top:16px;border-top:1px solid ${C.linea};font-family:${FUENTE};font-size:13px;line-height:1.6;color:${C.suave};">${esc(c.nota)}</p>` : ''}
      </td>
    </tr>

    <tr>
      <td align="center" bgcolor="#FAFBFC" style="background:#FAFBFC;padding:20px 24px;border-top:1px solid ${C.linea};">
        <p style="margin:0 0 4px;font-family:${FUENTE};font-size:13px;color:${C.cuerpo};font-weight:700;">TuWebGo</p>
        <p style="margin:0;font-family:${FUENTE};font-size:12px;line-height:1.6;color:${C.suave};">
          Páginas web para negocios en Venezuela<br>
          <a href="${SITIO}" target="_blank" style="color:${C.indigo};text-decoration:none;font-weight:600;">tuwebgo.net</a>
        </p>
      </td>
    </tr>
  </table>

</td></tr>
</table>
</body>
</html>`
}

/**
 * La versión en texto plano.
 *
 * No es un adorno: los filtros antispam penalizan un correo que solo trae
 * HTML, y hay quien lee en un reloj o con lector de pantalla.
 */
export function texto(c: Correo): string {
  const l = [c.titulo, '', ...(c.parrafos ?? [])]
  if (c.datos?.length) {
    l.push('')
    for (const [k, v] of c.datos) l.push(`${k}: ${v}`)
  }
  if (c.boton) l.push('', `${c.boton.texto}: ${c.boton.url}`)
  if (c.nota) l.push('', c.nota)
  l.push('', '—', 'TuWebGo · Páginas web para negocios en Venezuela', SITIO)
  return l.join('\n')
}
