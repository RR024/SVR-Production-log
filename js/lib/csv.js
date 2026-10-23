/**
 * RFC 4180 escaping, plus protection from spreadsheet formula injection: a
 * text cell beginning with = + - @ (or tab/CR) gets an apostrophe prefix so
 * Excel/Sheets show it as text instead of running it as a formula.
 */
export function escapeCsvCell(value) {
  if (value === null || value === undefined) return ''
  let s = typeof value === 'number' ? String(value) : String(value)
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(header, rows) {
  return [header, ...rows].map((r) => r.map(escapeCsvCell).join(',')).join('\r\n')
}

/** UTF-8 CSV with BOM so Excel reads non-ASCII text correctly. */
export function downloadCsv(filename, csv) {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
