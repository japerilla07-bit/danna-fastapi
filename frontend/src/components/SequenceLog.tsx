// SequenceLog — Panel con los últimos N spins como chips con colores de ruleta.
// El último spin lleva outline dorado.

const REDS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

function colorOf(n: number): 'red' | 'black' | 'green' {
  if (n === 0) return 'green';
  if (REDS.has(n)) return 'red';
  return 'black';
}

interface Props {
  spins: readonly number[];
  limit?: number;
}

// ── PALETA GEASS / SHIKON PARA LOS CHIPS ──
const THEME = {
  red: { bg: 'linear-gradient(135deg, rgba(217,11,44,0.9) 0%, rgba(255,30,56,0.5) 100%)', border: 'rgba(255,30,56,0.8)', glow: 'rgba(255,30,56,0.5)', text: '#ffffff' },
  black: { bg: 'linear-gradient(135deg, rgba(10,13,26,0.9) 0%, rgba(28,33,53,0.8) 100%)', border: 'rgba(92,104,122,0.6)', glow: 'rgba(92,104,122,0.4)', text: '#cbd5e1' },
  green: { bg: 'linear-gradient(135deg, rgba(0,255,157,0.8) 0%, rgba(16,229,123,0.4) 100%)', border: 'rgba(0,255,157,0.9)', glow: 'rgba(0,255,157,0.6)', text: '#021a0d' },
};

export function SequenceLog({ spins, limit = 12 }: Props) {
  const tail = spins.slice(-limit);
  const lastIdx = tail.length - 1;

  return (
    <div className="panel" style={{
      padding: '12px 14px',
      clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
      background: 'linear-gradient(135deg, rgba(10,14,28,0.9) 0%, rgba(3,4,8,0.95) 100%)',
      border: '1px solid rgba(0,229,255,0.25)',
      boxShadow: '0 6px 20px rgba(0,0,0,0.6), inset 0 0 20px rgba(0,229,255,0.05)',
      backdropFilter: 'blur(12px)',
      marginBottom: '10px'
    }}>
      <div className="seqlog-title" style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '9px',
        color: '#00e5ff',
        letterSpacing: '0.25em',
        fontWeight: 800,
        textShadow: '0 0 10px rgba(0,229,255,0.6)',
        marginBottom: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        {/* Orbe de rastreo */}
        <span style={{ 
          width: '8px', height: '8px', background: '#00e5ff', 
          clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', 
          boxShadow: '0 0 10px #00e5ff' 
        }} />
        SEQUENCE LOG · LAST {tail.length || limit}
      </div>

      {tail.length === 0 ? (
        <div className="seqlog-empty" style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '11px',
          color: '#5c687a',
          textAlign: 'center',
          padding: '12px',
          border: '1px dashed rgba(92,104,122,0.4)',
          background: 'rgba(0,0,0,0.3)'
        }}>
          Sin spins todavía
        </div>
      ) : (
        <div className="seqlog-grid" style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          justifyContent: 'flex-start',
          paddingTop: '2px',
          paddingBottom: '4px' // Espacio extra para que el último elemento escalado no se corte
        }}>
          {tail.map((n, i) => {
            const c = colorOf(n);
            const isLast = i === lastIdx;
            const t = THEME[c];
            
            return (
              <div
                key={`${i}-${n}`}
                className={`seqchip ${c}${isLast ? ' last' : ''}`}
                title={isLast ? `Último: ${n}` : `Spin: ${n}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '26px',
                  background: t.bg,
                  /* Magia mecha: inclinación del contenedor */
                  transform: isLast ? 'skewX(-12deg) scale(1.15) translateY(-2px)' : 'skewX(-12deg)',
                  border: `1px solid ${isLast ? '#ffdf60' : t.border}`,
                  boxShadow: isLast 
                    ? `0 6px 12px rgba(0,0,0,0.5), 0 0 15px rgba(255,223,96,0.6), inset 0 0 10px rgba(255,223,96,0.4)` 
                    : `inset 0 0 8px ${t.glow}, 0 2px 4px rgba(0,0,0,0.4)`,
                  zIndex: isLast ? 2 : 1,
                  position: 'relative',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
              >
                {/* Des-inclinación del texto para que el número se vea derecho */}
                <span style={{ 
                  transform: 'skewX(12deg)', 
                  display: 'block',
                  fontFamily: "'Rajdhani', sans-serif",
                  fontSize: '17px',
                  fontWeight: 900,
                  color: isLast && c === 'black' ? '#ffdf60' : t.text, // Toque dorado al número si es negro
                  textShadow: c === 'black' && !isLast ? 'none' : `0 0 6px ${isLast ? 'rgba(255,223,96,0.8)' : t.text + '80'}`
                }}>
                  {n}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
