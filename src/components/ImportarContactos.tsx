'use client'

import { useState, useMemo } from 'react'
import { normalizePhoneVE, formatPhoneVE } from '@/lib/whatsapp'
import { IconCheck, IconAlerta, IconUsuario } from '@/components/icons'

type Fila = { nombre?: string; telefono?: string; negocio?: string; notas?: string }

/**
 * Importa contactos scrapeados pegando texto.
 *
 * Acepta lo que sale de un scraping real: CSV, tabulado desde Excel, o una
 * columna suelta de teléfonos. Detecta el separador y adivina qué columna es
 * cuál, porque pedirle a alguien que formatee un archivo antes de importarlo es
 * la razón por la que estos datos se quedan sin usar.
 *
 * Muestra la previsualización ANTES de tocar la base: cuántos entran, cuántos
 * no tienen móvil válido y cuántos vienen repetidos.
 */
export default function ImportarContactos({ onImportado }: { onImportado?: () => void }) {
  const [texto, setTexto] = useState('')
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState<Record<string, number | string[] | undefined> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const analisis = useMemo(() => parsear(texto), [texto])

  async function importar() {
    if (!analisis.filas.length) return
    setImportando(true); setError(null); setResultado(null)
    try {
      const res = await fetch('/api/leads/importar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filas: analisis.filas }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? `Error ${res.status}`); return }
      setResultado(d)
      setTexto('')
      onImportado?.()
    } catch {
      setError('No se pudo conectar.')
    } finally { setImportando(false) }
  }

  return (
    <div className="bg-[var(--card)] rounded-2xl p-5 border border-[var(--border)] shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-1 h-5 rounded-full gradient-bar" />
        <h2 className="text-sm font-bold text-[var(--dark)] font-[family-name:var(--font-display)] uppercase tracking-wider">
          Importar contactos
        </h2>
      </div>
      <p className="text-sm text-[var(--text-secondary)] mt-2 mb-4">
        Pegá lo que tengas: copiado de Excel, un CSV, o solo una columna de teléfonos.
        Entran como <span className="font-semibold">Sin contactar</span> y no se duplican.
      </p>

      <textarea
        value={texto}
        onChange={(e) => { setTexto(e.target.value); setResultado(null) }}
        rows={6}
        placeholder={'Nombre, Teléfono, Negocio\nMaría Rodríguez, 0414-1234567, Repostería Dulce María\n0424-9876543, Barbería Los Caballeros'}
        className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--dark)] font-mono resize-none placeholder:text-[var(--text-muted)] placeholder:font-sans"
      />

      {texto.trim() && (
        <div className="mt-3 p-3 rounded-xl bg-[var(--bg-alt)] border border-[var(--border-light)]">
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
            <span className="text-emerald-700 font-semibold inline-flex items-center gap-1">
              <IconCheck className="w-3.5 h-3.5" />{analisis.filas.length} con móvil válido
            </span>
            {analisis.sinTelefono > 0 && (
              <span className="text-amber-700 inline-flex items-center gap-1">
                <IconAlerta className="w-3.5 h-3.5" />{analisis.sinTelefono} sin móvil válido
              </span>
            )}
            {analisis.repetidos > 0 && (
              <span className="text-[var(--text-muted)]">{analisis.repetidos} repetidos en el texto</span>
            )}
          </div>

          {analisis.filas.length > 0 && (
            <div className="mt-2.5 pt-2.5 border-t border-[var(--border-light)]">
              <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                Así se van a guardar los primeros
              </p>
              <div className="space-y-0.5">
                {analisis.filas.slice(0, 3).map((f, i) => (
                  <p key={i} className="text-xs text-[var(--text-secondary)] font-mono truncate">
                    {formatPhoneVE(f.telefono)} · {f.nombre || <span className="italic">sin nombre</span>}
                    {f.negocio ? ` · ${f.negocio}` : ''}
                  </p>
                ))}
                {analisis.filas.length > 3 && (
                  <p className="text-[11px] text-[var(--text-muted)]">y {analisis.filas.length - 3} más</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200">
          <p className="text-xs text-red-600 break-words">{error}</p>
        </div>
      )}

      {resultado && (
        <div className="mt-3 px-3 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
          <p className="text-sm font-semibold text-emerald-800 inline-flex items-center gap-1.5">
            <IconUsuario className="w-4 h-4" />
            {String(resultado.importados)} contactos importados
          </p>
          <div className="text-xs text-emerald-700 mt-1 space-y-0.5">
            {Number(resultado.yaExistian) > 0 && <p>{String(resultado.yaExistian)} ya estaban en la base — no se duplicaron.</p>}
            {Number(resultado.sinTelefono) > 0 && <p>{String(resultado.sinTelefono)} sin móvil válido, descartados.</p>}
          </div>
        </div>
      )}

      <button
        onClick={importar}
        disabled={importando || !analisis.filas.length}
        className="w-full mt-3 py-2.5 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold font-[family-name:var(--font-display)] hover:bg-[var(--primary-light)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all active:scale-[0.98]"
      >
        {importando ? 'Importando…' : analisis.filas.length ? `Importar ${analisis.filas.length} contactos` : 'Pegá los contactos arriba'}
      </button>
    </div>
  )
}

/* ── Parseo tolerante ────────────────────────────────────────── */

/** Detecta separador y columnas. Prioriza no perder filas sobre ser estricto. */
function parsear(texto: string): { filas: Fila[]; sinTelefono: number; repetidos: number } {
  const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (!lineas.length) return { filas: [], sinTelefono: 0, repetidos: 0 }

  // Tabulado gana sobre coma: un negocio como "Repuestos El Zulia, C.A." tiene
  // comas dentro y partiría mal.
  const sep = lineas[0].includes('\t') ? '\t' : lineas[0].includes(';') ? ';' : ','

  const filas: Fila[] = []
  const vistos = new Set<string>()
  let sinTelefono = 0, repetidos = 0

  for (const [i, linea] of lineas.entries()) {
    const celdas = linea.split(sep).map((c) => c.trim().replace(/^["']|["']$/g, ''))

    // Encabezado: si ninguna celda parece teléfono y es la primera, se salta.
    const tieneTel = celdas.some((c) => normalizePhoneVE(c))
    if (i === 0 && !tieneTel && celdas.length > 1) continue

    const idxTel = celdas.findIndex((c) => normalizePhoneVE(c))
    if (idxTel === -1) { sinTelefono++; continue }

    const e164 = normalizePhoneVE(celdas[idxTel])!
    if (vistos.has(e164)) { repetidos++; continue }
    vistos.add(e164)

    // Lo que no es el teléfono: el primer texto es el nombre, el segundo el
    // negocio. Es la disposición de cualquier scraping de directorio.
    const resto = celdas.filter((_, j) => j !== idxTel).filter(Boolean)
    filas.push({
      telefono: celdas[idxTel],
      nombre: resto[0] || undefined,
      negocio: resto[1] || undefined,
      notas: resto.slice(2).join(' · ') || undefined,
    })
  }

  return { filas, sinTelefono, repetidos }
}
