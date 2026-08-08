/**
 * Iconos de línea, en el mismo trazo que la navegación (stroke 1.8, 24x24).
 *
 * Reemplazan a los emoji que había repartidos por la app. Un emoji se ve
 * distinto en cada sistema operativo, no hereda el color del texto, no escala
 * con la tipografía y le da al CRM un aire improvisado que no ayuda cuando se
 * lo mostrás a un cliente.
 */

type Props = { className?: string; strokeWidth?: number }

function Svg({ d, className = 'w-4 h-4', strokeWidth = 1.8 }: Props & { d: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}

/* ── Canales de origen ── */
export const IconGlobo = (p: Props) => <Svg {...p} d="M12 21a9 9 0 100-18 9 9 0 000 18zM3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 010 18M12 3a15 15 0 000 18" />
export const IconCamara = (p: Props) => <Svg {...p} d="M6.8 6.5l1-2h8.4l1 2H20a1 1 0 011 1v11a1 1 0 01-1 1H4a1 1 0 01-1-1v-11a1 1 0 011-1h2.8zM12 16.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z" />
export const IconPersonas = (p: Props) => <Svg {...p} d="M17 20h4v-1a3.5 3.5 0 00-3-3.46M15 7a3 3 0 11-4 2.83M3 20v-1a4 4 0 014-4h2a4 4 0 014 4v1M11.5 7.5a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0z" />
export const IconMegafono = (p: Props) => <Svg {...p} d="M11 5.5L6 9H3.5A1.5 1.5 0 002 10.5v3A1.5 1.5 0 003.5 15H6l5 3.5v-13zM15.5 9.5a3.5 3.5 0 010 5M18.5 6.5a7.5 7.5 0 010 11" />
export const IconChat = (p: Props) => <Svg {...p} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.42-4.03 8-9 8a9.86 9.86 0 01-4.26-.95L3 20l1.4-3.72A7.94 7.94 0 013 12c0-4.42 4.03-8 9-8s9 3.58 9 8z" />
export const IconMarcador = (p: Props) => <Svg {...p} d="M12 21s7-5.6 7-11a7 7 0 10-14 0c0 5.4 7 11 7 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />

/* ── Métricas ── */
export const IconOjo = (p: Props) => <Svg {...p} d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 100-6 3 3 0 000 6z" />
export const IconClic = (p: Props) => <Svg {...p} d="M9 3.5v3M4.2 5.2l2.1 2.1M3.5 10h3M9.5 9.5l10 4-4.3 1.7L13.5 19.5l-4-10z" />
export const IconUsuario = (p: Props) => <Svg {...p} d="M12 12a4 4 0 100-8 4 4 0 000 8zM5 20.5a7 7 0 0114 0" />
export const IconDinero = (p: Props) => <Svg {...p} d="M12 3v18M16 7.5c0-1.66-1.79-2.5-4-2.5s-4 .84-4 2.5c0 3.5 8 1.5 8 5 0 1.66-1.79 2.5-4 2.5s-4-.84-4-2.5" />

/* ── Actividad y timeline ── */
export const IconNota = (p: Props) => <Svg {...p} d="M16.5 3.5l4 4L9 19l-4.5 1L5.5 15.5 16.5 3.5zM14.5 5.5l4 4" />
export const IconTelefono = (p: Props) => <Svg {...p} d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 006 6l1.5-2 4 1.5v3a1.5 1.5 0 01-1.6 1.5A17.5 17.5 0 015 5.1 1.5 1.5 0 016.5 3.5z" />
export const IconCorreo = (p: Props) => <Svg {...p} d="M3.5 6.5h17v11h-17v-11zM3.5 7l8.5 6 8.5-6" />
export const IconTarea = (p: Props) => <Svg {...p} d="M9 11.5l2.5 2.5 5-5M12 21a9 9 0 100-18 9 9 0 000 18z" />
export const IconEtapa = (p: Props) => <Svg {...p} d="M4 12a8 8 0 0113.7-5.7M20 12a8 8 0 01-13.7 5.7M17 3.5v3h-3M7 20.5v-3h3" />
export const IconSistema = (p: Props) => <Svg {...p} d="M10.3 4.3a1.7 1.7 0 013.4 0 1.7 1.7 0 002.5 1 1.7 1.7 0 012.4 2.4 1.7 1.7 0 001 2.6 1.7 1.7 0 010 3.4 1.7 1.7 0 00-1 2.5 1.7 1.7 0 01-2.4 2.4 1.7 1.7 0 00-2.5 1 1.7 1.7 0 01-3.4 0 1.7 1.7 0 00-2.6-1 1.7 1.7 0 01-2.4-2.4 1.7 1.7 0 00-1-2.5 1.7 1.7 0 010-3.4 1.7 1.7 0 001-2.6A1.7 1.7 0 017.7 5.3a1.7 1.7 0 002.6-1zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />

/* ── Estados vacíos ── */
export const IconBandeja = (p: Props) => <Svg {...p} d="M3.5 13.5h4l1.5 3h6l1.5-3h4M3.5 13.5L6 5h12l2.5 8.5v5a1 1 0 01-1 1h-15a1 1 0 01-1-1v-5z" />
export const IconCarpeta = (p: Props) => <Svg {...p} d="M3.5 6.5h6l2 2.5h9v10h-17v-12.5z" />
export const IconGrafico = (p: Props) => <Svg {...p} d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
export const IconLista = (p: Props) => <Svg {...p} d="M9 4.5h6a1 1 0 011 1v1h2v14H6v-14h2v-1a1 1 0 011-1zM8 6.5h8M9 12h6M9 16h4" />

/* ── Traspaso a humano ── */
export const IconCompra = (p: Props) => <Svg {...p} d="M3 4.5h2l2 11h10l2-8H6M9 20a1 1 0 100-2 1 1 0 000 2zM17 20a1 1 0 100-2 1 1 0 000 2z" />
export const IconAlerta = (p: Props) => <Svg {...p} d="M12 9v4M12 17h.01M10.3 3.9L2.4 17.5a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
export const IconPregunta = (p: Props) => <Svg {...p} d="M9.5 9a2.5 2.5 0 114 2c-.9.7-1.5 1.3-1.5 2.5M12 17h.01M12 21a9 9 0 100-18 9 9 0 000 18z" />
export const IconMano = (p: Props) => <Svg {...p} d="M7 11V5.5a1.5 1.5 0 013 0V11M10 11V4.5a1.5 1.5 0 013 0V11M13 11V6a1.5 1.5 0 013 0v7M16 9.5a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-1a6 6 0 01-6-6v-3.5a1.5 1.5 0 013 0" />

/* ── Acciones ── */
export const IconCerrar = (p: Props) => <Svg {...p} d="M6 18L18 6M6 6l12 12" />
export const IconCheck = (p: Props) => <Svg {...p} d="M4.5 12.5l5 5 10-11" />
export const IconVolver = (p: Props) => <Svg {...p} d="M9 14l-4-4 4-4M5 10h9a5 5 0 010 10h-3" />
export const IconError = (p: Props) => <Svg {...p} d="M15 9l-6 6M9 9l6 6M12 21a9 9 0 100-18 9 9 0 000 18z" />
export const IconFlecha = (p: Props) => <Svg {...p} d="M5 12h14M13 6l6 6-6 6" />
export const IconAsistente = (p: Props) => <Svg {...p} d="M12 3l1.9 4.6 4.6 1.9-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3zM18.5 15l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8.8-1.9z" />
export const IconWhatsApp = ({ className = 'w-4 h-4' }: Props) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 016.99 2.896 9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
  </svg>
)

/* ── Mapas para los registros que antes guardaban un emoji ── */

export const ICONO_CANAL: Record<string, (p: Props) => React.JSX.Element> = {
  landing_page: IconGlobo,
  instagram_dm: IconCamara,
  referral: IconPersonas,
  meta_ads_direct: IconMegafono,
  organic_wa: IconChat,
  other: IconMarcador,
}

export const ICONO_ACTIVIDAD: Record<string, (p: Props) => React.JSX.Element> = {
  note: IconNota,
  call: IconTelefono,
  message: IconChat,
  email: IconCorreo,
  task: IconTarea,
  stage_change: IconEtapa,
  system: IconSistema,
}

export const ICONO_HANDOFF: Record<string, (p: Props) => React.JSX.Element> = {
  quiere_comprar: IconCompra,
  pago_reportado: IconDinero,
  queja: IconAlerta,
  fuera_de_alcance: IconPregunta,
  pide_humano: IconMano,
}

export const IconEnlaceExterno = (p: Props) => <Svg {...p} d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />
