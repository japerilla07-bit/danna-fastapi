// Telemetry — decoración tipo "telemetría espacial" en las 4 esquinas.
// Estática por ahora; en el futuro puede mostrar uptime real, latencia, etc.

import { useEffect, useState } from 'react';

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

export function Telemetry() {
  const [uptime, setUptime] = useState(0);

  // Uptime real desde que se montó la app
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      setUptime(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <div className="telemetry telemetry-tl">
        <span className="telemetry-l">SYS</span> · D.A.N.N.A v2.0<br/>
        <span className="telemetry-l">CORE</span> · ENGINE-2026.01.06
      </div>
      <div className="telemetry telemetry-tr">
        <span className="telemetry-l">UPLINK</span> · STABLE<br/>
        <span className="telemetry-l">LATENCY</span> · 8ms
      </div>
      <div className="telemetry telemetry-bl">
        <span className="telemetry-l">CTX</span> · ROULETTE_EURO_001<br/>
        <span className="telemetry-l">TBL</span> · MESA_1
      </div>
      <div className="telemetry telemetry-br">
        <span className="telemetry-l">CAPACITY</span> · 99.97%<br/>
        <span className="telemetry-l">UPTIME</span> · {formatUptime(uptime)}
      </div>
    </>
  );
}
