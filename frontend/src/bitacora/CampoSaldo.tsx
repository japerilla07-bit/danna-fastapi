// BITÁCORA — casilla de monto (saldo). Escribes "100000", "100.000" o "100,5"; al salir se muestra como 100.000.
// Mantiene su propio texto mientras escribes, así no se "come" lo que tecleas; solo avisa al padre cuando es un monto válido.

import { useEffect, useState } from 'react';
import { formatearMonto, parsearMonto } from './registro';

interface Props {
  valor: number | null;
  onChange: (v: number | null) => void;
  etiqueta: string;
  placeholder?: string;
  ancho?: number | string;
}

export function CampoSaldo({ valor, onChange, etiqueta, placeholder = 'Ej. 100.000', ancho }: Props) {
  const [texto, setTexto] = useState(formatearMonto(valor));
  const [foco, setFoco] = useState(false);
  const [invalido, setInvalido] = useState(false);
  useEffect(() => { if (!foco) { setTexto(formatearMonto(valor)); setInvalido(false); } }, [valor, foco]);
  return (
    <input
      className="bt-in" type="text" inputMode="decimal" autoComplete="off" placeholder={placeholder} aria-label={etiqueta} aria-invalid={invalido || undefined}
      style={{ ...(ancho ? { width: ancho } : null), ...(invalido ? { borderColor: '#ff4d63' } : null) }} value={texto}
      onFocus={() => { setFoco(true); setTexto(valor === null ? '' : String(valor).replace('.', ',')); }}
      onBlur={() => setFoco(false)}
      onChange={(e) => {
        const t = e.target.value; setTexto(t);
        const v = parsearMonto(t);
        if (v === undefined) { setInvalido(true); return; }
        setInvalido(false);
        if (v !== valor) onChange(v);
      }}
    />
  );
}
