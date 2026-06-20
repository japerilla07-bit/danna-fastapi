// NeuralBackground — Red neuronal animada en canvas vanilla.
// Port 1:1 del JS del mockup v2.
//
// Características:
//   - Nodos animados con drift suave y pulso de tamaño (40-140 según resolución)
//   - Conexiones dinámicas cyan con opacidad por distancia (<180px)
//   - Halos radiales alrededor de cada nodo
//   - Data packets viajando por aristas cada 600-1800ms (cyan o violeta)
//   - Performance: ~2% CPU en M1, devicePixelRatio limitado a 2
//
// Optimizaciones React:
//   - Una sola instancia (canvas único)
//   - requestAnimationFrame cancelado al unmount
//   - resize listener cleanup correcto

import { useEffect, useRef } from 'react';

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  phase: number;
  speed: number;
}

interface Packet {
  a: Node;
  b: Node;
  t: number;
  speed: number;
  hue: 'cyan' | 'violet';
}

const MAX_DIST = 180;
const NODE_COUNT_DENSITY = 1 / 16000;

export function NeuralBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 0, H = 0, DPR = 1;
    const NODES: Node[] = [];
    const PACKETS: Packet[] = [];
    let lastSpawn = 0;
    let rafId = 0;

    function resize() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas!.width = W * DPR;
      canvas!.height = H * DPR;
      canvas!.style.width = W + 'px';
      canvas!.style.height = H + 'px';
      ctx!.setTransform(DPR, 0, 0, DPR, 0, 0);

      const count = Math.max(40, Math.min(140, Math.floor(W * H * NODE_COUNT_DENSITY)));
      NODES.length = 0;
      for (let i = 0; i < count; i++) {
        NODES.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.20,
          vy: (Math.random() - 0.5) * 0.20,
          r: 1.2 + Math.random() * 1.6,
          phase: Math.random() * Math.PI * 2,
          speed: 0.6 + Math.random() * 0.8,
        });
      }
    }

    function spawnPacket() {
      if (NODES.length < 2) return;
      const a = NODES[Math.floor(Math.random() * NODES.length)];
      const nearbyIdx: number[] = [];
      for (let i = 0; i < NODES.length; i++) {
        const b = NODES[i];
        if (b === a) continue;
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < MAX_DIST * MAX_DIST) nearbyIdx.push(i);
      }
      if (nearbyIdx.length === 0) return;
      const bIdx = nearbyIdx[Math.floor(Math.random() * nearbyIdx.length)];
      PACKETS.push({
        a, b: NODES[bIdx], t: 0,
        speed: 0.008 + Math.random() * 0.012,
        hue: Math.random() < 0.5 ? 'cyan' : 'violet',
      });
    }

    function maybeSpawn(now: number) {
      if (now - lastSpawn > 600 + Math.random() * 1200) {
        spawnPacket();
        lastSpawn = now;
      }
    }

    function step(now: number) {
      ctx!.clearRect(0, 0, W, H);

      // Update nodos
      for (const n of NODES) {
        n.x += n.vx;
        n.y += n.vy;
        n.phase += 0.008 * n.speed;
        if (n.x < -20) n.x = W + 20;
        if (n.x > W + 20) n.x = -20;
        if (n.y < -20) n.y = H + 20;
        if (n.y > H + 20) n.y = -20;
      }

      // Conexiones
      ctx!.lineWidth = 1;
      for (let i = 0; i < NODES.length; i++) {
        const a = NODES[i];
        for (let j = i + 1; j < NODES.length; j++) {
          const b = NODES[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < MAX_DIST * MAX_DIST) {
            const d = Math.sqrt(d2);
            const alpha = (1 - d / MAX_DIST) * 0.16;
            ctx!.strokeStyle = `rgba(0, 229, 255, ${alpha})`;
            ctx!.beginPath();
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(b.x, b.y);
            ctx!.stroke();
          }
        }
      }

      // Nodos (con pulso)
      for (const n of NODES) {
        const pulse = 0.7 + 0.3 * Math.sin(n.phase);
        const r = n.r * pulse;
        const grd = ctx!.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 4);
        grd.addColorStop(0, `rgba(0, 229, 255, ${0.35 * pulse})`);
        grd.addColorStop(1, 'rgba(0, 229, 255, 0)');
        ctx!.fillStyle = grd;
        ctx!.beginPath();
        ctx!.arc(n.x, n.y, r * 4, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.fillStyle = `rgba(0, 229, 255, ${0.7 * pulse})`;
        ctx!.beginPath();
        ctx!.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx!.fill();
      }

      // Packets
      maybeSpawn(now);
      for (let i = PACKETS.length - 1; i >= 0; i--) {
        const p = PACKETS[i];
        p.t += p.speed;
        if (p.t >= 1) { PACKETS.splice(i, 1); continue; }
        const x = p.a.x + (p.b.x - p.a.x) * p.t;
        const y = p.a.y + (p.b.y - p.a.y) * p.t;
        const color = p.hue === 'cyan'
          ? `rgba(0, 229, 255, 1)`
          : `rgba(168, 85, 247, 1)`;
        const trail = ctx!.createRadialGradient(x, y, 0, x, y, 8);
        trail.addColorStop(0, color);
        trail.addColorStop(1, 'rgba(0,0,0,0)');
        ctx!.fillStyle = trail;
        ctx!.beginPath();
        ctx!.arc(x, y, 8, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.fillStyle = color;
        ctx!.beginPath();
        ctx!.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx!.fill();
      }

      rafId = requestAnimationFrame(step);
    }

    resize();
    window.addEventListener('resize', resize);
    rafId = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="neural-bg" aria-hidden="true" />;
}
