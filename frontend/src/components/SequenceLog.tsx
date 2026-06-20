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

export function SequenceLog({ spins, limit = 12 }: Props) {
  const tail = spins.slice(-limit);
  const lastIdx = tail.length - 1;

  return (
    <div className="panel">
      <div className="seqlog-title">▸ SEQUENCE LOG — LAST {tail.length || limit}</div>

      {tail.length === 0 ? (
        <div className="seqlog-empty">
          Sin spins todavía
        </div>
      ) : (
        <div className="seqlog-grid">
          {tail.map((n, i) => {
            const c = colorOf(n);
            return (
              <div
                key={`${i}-${n}`}
                className={`seqchip ${c}${i === lastIdx ? ' last' : ''}`}
                title={i === lastIdx ? `Último: ${n}` : `Spin: ${n}`}
              >
                {n}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
