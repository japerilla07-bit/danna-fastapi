// BITÁCORA — descarga de archivos desde el navegador. Sin dependencias.

/** Descarga un texto como archivo. Con `bom` el CSV conserva las tildes al abrirlo en Excel. */
export function descargarTexto(nombre: string, contenido: string, mime: string, bom = false): void {
  const blob = new Blob([bom ? '﻿' : '', contenido], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
