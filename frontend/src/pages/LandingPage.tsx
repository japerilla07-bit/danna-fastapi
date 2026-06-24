/**
 * D.A.N.N.A. — LandingPage.tsx (FINAL — v3)
 * ✓ Todos los textos originales preservados
 * ✓ Todos los UUIDs de LemonSqueezy reales
 * ✓ Validación completa: legal checkbox, min chars
 * ✓ dangerouslySetInnerHTML para mensaje de éxito
 * ✓ ParticleCanvas neural net + scan-lines + glitch
 * ✓ Glassmorphism + paleta cyan/amber/red de la app
 * ✓ Sin dependencia de landing.css (todo self-contained)
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";

// ─── Checkout URLs reales ──────────────────────────────────────────────────
const CHECKOUT = {
  daily:   "https://mlgunnerenginedanna.lemonsqueezy.com/checkout/buy/ccab099f-9c7d-47a2-9874-a7cba4d93766",
  weekly:  "https://mlgunnerenginedanna.lemonsqueezy.com/checkout/buy/3cdb40dd-defd-468d-a2fe-b47b1fe6b18b",
  monthly: "https://mlgunnerenginedanna.lemonsqueezy.com/checkout/buy/41a8c44e-e7b9-4782-a3a1-33a51c7da1c5",
};

// ─── CSS inyectado (sin dependencia externa) ────────────────────────────────
const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Michroma&family=JetBrains+Mono:wght@400;700&family=Space+Grotesk:wght@400;500;600;700&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:       #04080e;
  --cyan:     #00C8DC;
  --cyan2:    rgba(0,200,220,0.55);
  --cyan-g:   rgba(0,200,220,0.10);
  --amber:    #E8A020;
  --amber2:   #b8960f;
  --red:      #E03040;
  --green:    #1ed97a;
  --gold:     #ffd700;
  --txt:      rgba(248,250,252,0.90);
  --txt-dim:  rgba(248,250,252,0.45);
  --border:   rgba(0,200,220,0.10);
  --fm:       'Michroma', sans-serif;
  --fmono:    'JetBrains Mono', monospace;
  --fsans:    'Space Grotesk', sans-serif;
}

html { scroll-behavior: smooth; }
body { background: var(--bg); color: var(--txt); font-family: var(--fsans); overflow-x: hidden; }

/* ── Keyframes ── */
@keyframes fomoFlicker { 0%,100%{opacity:1} 50%{opacity:0.72} }
@keyframes pulseDot    { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.7);opacity:0.45} }
@keyframes glitchTitle {
  0%,84%,100% { text-shadow:0 0 40px rgba(0,200,220,0.75),0 0 80px rgba(0,200,220,0.2); transform:translate(0,0); }
  85% { text-shadow:-6px 0 #E03040, 6px 0 #00C8DC; transform:translate(-4px,1px); }
  86% { text-shadow: 6px 0 #E03040,-6px 0 #00C8DC; transform:translate( 4px,-1px); }
  87% { text-shadow:-3px 0 #E8A020, 3px 0 #00C8DC; transform:translate(-1px,0); }
  88% { text-shadow:0 0 40px rgba(0,200,220,0.75);  transform:translate(0,0); }
}
@keyframes scanSweep    { 0%{top:-4px} 100%{top:100vh} }
@keyframes ctaPulse     { 0%,100%{box-shadow:0 0 14px rgba(0,200,220,0.30)} 50%{box-shadow:0 0 32px rgba(0,200,220,0.65)} }
@keyframes amberPulse   { 0%,100%{box-shadow:0 0 14px rgba(232,160,32,0.30)} 50%{box-shadow:0 0 32px rgba(232,160,32,0.65)} }
@keyframes goldPulse    { 0%,100%{box-shadow:0 0 14px rgba(255,215,0,0.25)} 50%{box-shadow:0 0 28px rgba(255,215,0,0.55)} }
@keyframes exScroll     { from{transform:translateX(0)} to{transform:translateX(-50%)} }
@keyframes spinAnim     { 100%{transform:rotate(360deg)} }
@keyframes fadeInUp     { from{opacity:0;transform:translateY(28px)} to{opacity:1;transform:translateY(0)} }
@keyframes borderGlow   { 0%,100%{border-color:rgba(0,200,220,0.15)} 50%{border-color:rgba(0,200,220,0.45)} }

/* ── Scroll fade ── */
.fade { opacity:0; transform:translateY(22px); transition:opacity .6s ease, transform .6s ease; }
.fade.visible { opacity:1; transform:translateY(0); }

/* ── Cards hover ── */
.sci-card { transition: transform .3s, border-color .3s, box-shadow .3s; }
.sci-card:hover { transform:translateY(-5px); border-color:rgba(0,200,220,0.4)!important; box-shadow:0 8px 40px rgba(0,200,220,0.08)!important; }

.plan-card-wrap { transition: transform .3s, box-shadow .3s; }
.plan-card-wrap:hover { transform:translateY(-7px); }

/* ── FAQ ── */
.faq-body { max-height:0; overflow:hidden; transition:max-height .35s ease; }
.faq-body.open { max-height:500px; }

/* ── Form inputs ── */
.danna-field {
  width:100%;
  padding:12px 14px;
  background:rgba(0,200,220,0.04);
  border:1px solid rgba(0,200,220,0.18);
  border-radius:5px;
  color:rgba(248,250,252,0.9);
  font-family:var(--fsans);
  font-size:14px;
  transition:border-color .2s, box-shadow .2s;
}
.danna-field::placeholder { color:rgba(248,250,252,0.25); }
.danna-field:focus { border-color:rgba(0,200,220,0.60)!important; box-shadow:0 0 0 3px rgba(0,200,220,0.08)!important; outline:none; }

/* ── Divider ── */
.danna-divider { border:none; border-top:1px solid rgba(0,200,220,0.08); margin:0; }

/* ── Gradient text ── */
.grad-cyan { background:linear-gradient(135deg,#00C8DC 0%,#67e8f9 50%,#00C8DC 100%); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
.grad-amber { background:linear-gradient(135deg,#E8A020 0%,#ffd700 50%,#b8960f 100%); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
`;

// ─── Particle type ──────────────────────────────────────────────────────────
interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  r: number; o: number;
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function LandingPage() {
  const navigate = useNavigate();

  // FOMO (igual que original: empieza en 14, baja lentamente)
  const [fomoCount, setFomoCount] = useState(14);

  // Form state (igual que original)
  const [username, setUsername] = useState("");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [legal,    setLegal]    = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ text: string; color: string; html?: boolean } | null>(null);

  // FAQ
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);

  // ── FOMO counter (lógica original: baja si > 4 y random > 0.75) ──
  useEffect(() => {
    const t = setInterval(() => {
      setFomoCount(v => {
        if (v > 4 && Math.random() > 0.75) return v - 1;
        return v;
      });
    }, 18000);
    return () => clearInterval(t);
  }, []);

  // ── Scroll fade-in observer ──
  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => e.isIntersecting && e.target.classList.add("visible")),
      { threshold: 0.08 }
    );
    document.querySelectorAll(".fade").forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  // ── Particle canvas ──
  const initParticles = useCallback((w: number, h: number): Particle[] =>
    Array.from({ length: 70 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.42,
      vy: (Math.random() - 0.5) * 0.42,
      r: Math.random() * 1.8 + 0.8,
      o: Math.random() * 0.45 + 0.12,
    }))
  , []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const particles: Particle[] = [];
    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      particles.length = 0;
      particles.push(...initParticles(canvas.width, canvas.height));
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const { width: W, height: H } = canvas;
      ctx.clearRect(0, 0, W, H);

      // Connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx   = particles[i].x - particles[j].x;
          const dy   = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 125) {
            ctx.strokeStyle = `rgba(0,200,220,${(1 - dist / 125) * 0.22})`;
            ctx.lineWidth   = 0.55;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Nodes
      ctx.shadowColor = "#00C8DC";
      ctx.shadowBlur  = 5;
      particles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,200,220,${p.o})`;
        ctx.fill();
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
      });
      ctx.shadowBlur = 0;

      rafRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [initParticles]);

  // ── Submit (lógica original preservada) ──
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!legal) {
      setMsg({ text: "◈ Debes aceptar los términos para continuar.", color: "#e03040" });
      return;
    }
    if (username.trim().length < 3) {
      setMsg({ text: "◈ Usuario mínimo 3 caracteres.", color: "#e03040" });
      return;
    }
    if (password.length < 6) {
      setMsg({ text: "◈ Contraseña mínimo 6 caracteres.", color: "#e03040" });
      return;
    }

    setSubmitting(true);
    try {
      const res  = await fetch("/api/register", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ username: username.trim(), password, email: email.trim() }),
      });
      const data = await res.json();

      if (data.success) {
        setMsg({
          text: '◈ Cuenta creada exitosamente.<br><span style="color:rgba(155,195,212,0.6);font-size:10px;">Adquiere tu licencia arriba usando este mismo email para activación automática.</span>',
          color: "#ffd700",
          html:  true,
        });
        setUsername(""); setEmail(""); setPassword(""); setLegal(false);
      } else {
        setMsg({ text: "◈ " + (data.message || "Error al crear cuenta."), color: "#e03040" });
      }
    } catch {
      setMsg({ text: "◈ Error de conexión. Verifica tu red e intenta de nuevo.", color: "#e03040" });
    }
    setSubmitting(false);
  }

  // ── Helpers ──
  const S = styles;

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{GLOBAL_CSS}</style>

      {/* ── Particle canvas bg ── */}
      <canvas ref={canvasRef} style={S.canvas} />

      {/* ── Scan-line overlay ── */}
      <div style={S.scanOverlay} />

      {/* ── Scan sweep ── */}
      <div style={S.scanSweep} />

      {/* ── Root ── */}
      <div style={S.root}>

        {/* ════════ ALERT BAR ════════ */}
        <div style={S.alertBar}>
          ◈ Acceso limitado activo &nbsp;·&nbsp;{" "}
          <span style={{ color: "#FF6070", fontWeight: 700 }}>{fomoCount}</span>
          {" "}licencias disponibles &nbsp;·&nbsp; El cupo cierra cuando se completa la capacidad operativa
        </div>

        {/* ════════ NAV ════════ */}
        <nav style={S.nav}>
          {/* Logo */}
          <div style={S.navLogo}>D.A.N.N.A.</div>

          {/* Status */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={S.pulseDot} />
            <span style={S.navStatus}>SISTEMA OPERATIVO</span>
          </div>

          {/* CTA */}
          <button onClick={() => navigate("/login")} style={S.navBtn}>
            ACCEDER AL TERMINAL →
          </button>
        </nav>

        {/* ════════ HERO ════════ */}
        <section style={S.hero}>

          {/* Badge */}
          <div className="fade" style={{ marginBottom: "18px" }}>
            <span style={S.heroBadge}>
              Motor Predictivo · Versión 2.0 · Validado sobre 8,151 Spins
            </span>
          </div>

          {/* Title */}
          <h1 className="fade grad-cyan" style={S.heroTitle}>
            D.A.N.N.A.
          </h1>

          {/* Tagline */}
          <h2 className="fade" style={S.heroTagline}>
            Nada permanece oculto bajo el análisis..
            <br />
            <span style={{ color: "rgba(248,250,252,0.45)", fontWeight: 400 }}>
              Lo que parece caos tiene estructura. Nosotros la procesamos.
            </span>
          </h2>

          {/* Description */}
          <p className="fade" style={S.heroDesc}>
            D.A.N.N.A. es un motor de análisis probabilístico de alta precisión. Procesa flujos de
            frecuencia y ciclos de comportamiento en tiempo real para extraer vectores de ejecución
            basados en lógica computacional — no en el azar.
          </p>

          {/* CTA */}
          <div className="fade" style={{ marginBottom: "56px", textAlign: "center" }}>
            <a href="#registro" style={S.heroCta}>◈ ACCEDER AL TERMINAL</a>
            <p style={S.heroSubCta}>
              Registro en 60 segundos · Sin tarjeta requerida para Trial
            </p>
          </div>

          {/* Stats */}
          <div className="fade" style={S.statsRow}>
            {[
              { val: "68.1%", lbl: "Hit Rate Docenas",  color: "#00C8DC" },
              { val: "8,151", lbl: "Spins Validados",   color: "#00C8DC" },
              { val: "+838u", lbl: "PnL Backtest",       color: "#E8A020" },
              { val: "5",     lbl: "Modelos ML",         color: "#00C8DC" },
            ].map(({ val, lbl, color }) => (
              <div key={lbl} style={S.statChip}>
                <span style={{ ...S.statVal, color }}>{val}</span>
                <span style={S.statLbl}>{lbl}</span>
              </div>
            ))}
          </div>
        </section>

        <hr className="danna-divider" />

        {/* ════════ SCIENCE ════════ */}
        <section style={S.section}>
          <div className="fade" style={{ textAlign: "center", marginBottom: "56px" }}>
            <div style={S.eyebrow}>◈ ARQUITECTURA</div>
            <h2 style={S.sectionTitle}>The Science Behind the Edge</h2>
            <p style={S.sectionSub}>
              Tres pilares técnicos que convierten el ruido estadístico en vectores de ejecución accionables.
            </p>
          </div>

          <div className="fade" style={S.sciGrid}>
            {[
              {
                num:   "01 · ENSEMBLE NEURAL",
                title: "Red de Modelos Adaptativos",
                body:  "Cinco modelos operan en paralelo — FreqDecay, Markov, NaiveBayes, LSTM y WheelExpert físico. Un meta-learner pondera sus votos con pesos adaptativos en tiempo real según su rendimiento reciente.",
                accent: "#00C8DC",
              },
              {
                num:   "02 · ANÁLISIS DE CICLOS",
                title: "Detección de Patrones Físicos",
                body:  "WheelExpert Premium analiza la firma del crupier, el scatter de la bola y la dominancia de sector en la rueda europea. Cuando hay patrón físico detectable, el sistema lo extrae y lo traduce en probabilidades accionables.",
                accent: "#E8A020",
              },
              {
                num:   "03 · GESTIÓN DE VARIANZA",
                title: "Protocolo de Capital Óptimo",
                body:  "El indicador OPTIMAL / CAUTION / ABORT evalúa en tiempo real el score de la mesa, la entropía del sistema y los errores consecutivos. Cuando las condiciones son adversas, el motor lo indica antes de que el capital esté en riesgo.",
                accent: "#E03040",
              },
            ].map(({ num, title, body, accent }) => {
              const rgb = accent === "#00C8DC" ? "0,200,220" : accent === "#E8A020" ? "232,160,32" : "224,48,64";
              return (
                <div key={num} className="sci-card" style={{
                  ...S.sciCard,
                  border: `1px solid rgba(${rgb},0.15)`,
                  boxShadow: `0 0 0 0 rgba(${rgb},0)`,
                }}>
                  {/* Left accent bar */}
                  <div style={{
                    position: "absolute", top: 0, left: 0,
                    width: "3px", height: "70px",
                    background: `linear-gradient(to bottom,${accent},transparent)`,
                    borderRadius: "12px 0 0 0",
                  }} />
                  <div style={{ ...S.sciNum, color: accent }}>{num}</div>
                  <h3 style={S.sciTitle}>{title}</h3>
                  <p style={S.sciBody}>{body}</p>
                </div>
              );
            })}
          </div>
        </section>

        <hr className="danna-divider" />

        {/* ════════ EXCLUSIVITY ════════ */}
        <section className="fade" style={S.exclusiveSection}>
          <div style={S.exclusiveBar}>
            {/* Scroll ticker */}
            <div style={{ overflow: "hidden", width: "100%" }}>
              <div style={S.exScrollWrap}>
                {[...Array(4)].map((_, i) => (
                  <span key={i} style={{ display: "flex", gap: "64px", flexShrink: 0 }}>
                    {["◈ ACCESO RESTRINGIDO", "· CUPO DELIBERADAMENTE LIMITADO",
                      "· VENTAJA ALGORÍTMICA PROTEGIDA", "· NO ES UN PRODUCTO MASIVO",
                      "· HERRAMIENTA PARA OPERADORES SERIOS"].map(t => (
                      <span key={t} style={S.exItem}>{t}</span>
                    ))}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Exclusivity text block */}
          <div style={S.exclusiveCard}>
            <div style={{ ...S.eyebrow, textAlign: "left", marginBottom: "16px" }}>◈ ACCESO RESTRINGIDO</div>
            <p style={{ fontSize: "15px", color: "rgba(248,250,252,0.55)", lineHeight: 1.8 }}>
              El cupo de operadores activos es deliberadamente limitado. Un número elevado de usuarios
              simultáneos sobre los mismos patrones de mesa reduce la ventaja algorítmica colectiva.
              D.A.N.N.A. no es un producto masivo — es una herramienta para quienes toman el riesgo en serio.
            </p>
          </div>
        </section>

        <hr className="danna-divider" />

        {/* ════════ PLANES ════════ */}
        <section id="planes" style={S.section}>
          <div className="fade" style={{ textAlign: "center", marginBottom: "56px" }}>
            <div style={{ ...S.eyebrow, color: "#E8A020" }}>◈ LICENCIAS</div>
            <h2 style={S.sectionTitle}>Adquiere Tu Licencia de Acceso</h2>
            <p style={S.sectionSub}>Sin contratos. Sin permanencia. Activa solo cuando vayas a operar.</p>
          </div>

          <div className="fade" style={S.plansGrid}>

            {/* ── Trial ── */}
            <PlanCard
              tag="ENTRADA"
              name="Trial Access"
              price="$0"
              period="250 spins · Un solo uso"
              accent="#1ed97a"
              features={["Motor completo", "Sin tarjeta requerida", "WheelExpert activo"]}
              ctaLabel="INICIAR TRIAL →"
              ctaHref="#registro"
              featured={false}
              featuredBadge=""
            />

            {/* ── Daily ── */}
            <PlanCard
              tag="SESIÓN"
              name="Daily Pass"
              price="$10"
              period="Acceso 24 horas · Ilimitado"
              accent="#00C8DC"
              features={["Spins ilimitados", "Motor completo", "Activación inmediata"]}
              ctaLabel="ADQUIRIR LICENCIA — $10 →"
              ctaHref={CHECKOUT.daily}
              featured={false}
              featuredBadge=""
            />

            {/* ── Weekly (featured) ── */}
            <PlanCard
              tag="OPERACIONAL"
              name="Weekly Pro"
              price="$25"
              period="7 días · Acceso total"
              accent="#E8A020"
              features={["Spins ilimitados", "Soporte prioritario", "Actualizaciones de algoritmo", "Todas las categorías activas"]}
              ctaLabel="ADQUIRIR LICENCIA — $25 →"
              ctaHref={CHECKOUT.weekly}
              featured={true}
              featuredBadge="MÁS SELECCIONADO"
            />

            {/* ── Monthly ── */}
            <PlanCard
              tag="ÉLITE"
              name="Monthly Elite"
              price="$75"
              period="30 días · Máxima cobertura"
              accent="#00C8DC"
              features={["Spins ilimitados", "Soporte dedicado", "Todas las actualizaciones", "Acceso prioritario a nuevas versiones"]}
              ctaLabel="ADQUIRIR LICENCIA — $75 →"
              ctaHref={CHECKOUT.monthly}
              featured={false}
              featuredBadge=""
            />
          </div>

          <div className="fade" style={{ marginTop: "24px", textAlign: "center" }}>
            <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "10px", color: "rgba(248,250,252,0.40)", letterSpacing: "1px" }}>
              ◈ Usa el mismo email en LemonSqueezy y en tu registro D.A.N.N.A. — la activación es automática.
            </p>
          </div>
        </section>

        <hr className="danna-divider" />

        {/* ════════ REGISTRO ════════ */}
        <section id="registro" style={{ ...S.section, maxWidth: "540px" }}>
          <div className="fade" style={{ textAlign: "center", marginBottom: "40px" }}>
            <div style={S.eyebrow}>◈ ACCESO</div>
            <h2 style={S.sectionTitle}>Crear Cuenta de Operador</h2>
            <p style={{ ...S.sectionSub, marginTop: "10px", fontSize: "13px" }}>
              Registra tu cuenta. Luego adquiere tu licencia arriba.
              <br />
              La activación es automática al confirmar el pago.
            </p>
          </div>

          <div className="fade" style={S.regCard}>
            <form onSubmit={handleSubmit} autoComplete="off">

              {/* Username */}
              <div style={S.fieldWrap}>
                <label style={S.fieldLabel}>NOMBRE DE USUARIO</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="danna-field"
                  placeholder="mínimo 3 caracteres"
                  required
                />
              </div>

              {/* Email */}
              <div style={S.fieldWrap}>
                <label style={S.fieldLabel}>CORREO ELECTRÓNICO</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="danna-field"
                  placeholder="el mismo que usarás en LemonSqueezy"
                  required
                />
              </div>

              {/* Password */}
              <div style={S.fieldWrap}>
                <label style={S.fieldLabel}>CONTRASEÑA</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="danna-field"
                  placeholder="mínimo 6 caracteres"
                  required
                />
              </div>

              {/* Legal */}
              <div style={S.legalBox}>
                <input
                  type="checkbox"
                  checked={legal}
                  onChange={e => setLegal(e.target.checked)}
                  style={{ marginTop: "2px", accentColor: "#00C8DC", flexShrink: 0 }}
                  required
                />
                <label style={S.legalText}>
                  Soy mayor de edad (18+). Entiendo que D.A.N.N.A. es una herramienta de{" "}
                  <strong style={{ color: "rgba(248,250,252,0.85)" }}>análisis probabilístico</strong>,
                  no una garantía de resultados financieros. Asumo el 100% del riesgo operativo.
                </label>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting}
                style={{ ...S.submitBtn, opacity: submitting ? 0.65 : 1, cursor: submitting ? "not-allowed" : "pointer" }}
              >
                {submitting
                  ? <>
                      <span style={S.spinner} />
                      ◈ PROCESANDO...
                    </>
                  : "◈ CREAR CUENTA DE OPERADOR →"}
              </button>

              {/* Message */}
              {msg && (
                <div
                  style={{ ...S.msgBox, color: msg.color, borderColor: msg.color === "#ffd700" ? "rgba(255,215,0,0.25)" : "rgba(224,48,64,0.25)", background: msg.color === "#ffd700" ? "rgba(255,215,0,0.05)" : "rgba(224,48,64,0.05)" }}
                  dangerouslySetInnerHTML={msg.html ? { __html: msg.text } : undefined}
                >
                  {msg.html ? null : msg.text}
                </div>
              )}
            </form>

            {/* Login link */}
            <div style={S.loginLink}>
              <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "10px", color: "rgba(248,250,252,0.40)", marginBottom: "10px" }}>
                ¿Ya tienes cuenta?
              </p>
              <Link to="/login" style={S.loginBtn}>
                ACCEDER AL TERMINAL →
              </Link>
            </div>
          </div>
        </section>

        {/* ════════ FAQ ════════ */}
        <section style={{ ...S.section, maxWidth: "740px" }}>
          <div className="fade" style={{ textAlign: "center", marginBottom: "48px" }}>
            <div style={S.eyebrow}>◈ PREGUNTAS FRECUENTES</div>
            <h2 style={S.sectionTitle}>FAQ</h2>
          </div>

          <div className="fade" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {[
              {
                q: "¿Qué es D.A.N.N.A. y cómo funciona?",
                a: "Motor de análisis probabilístico con 5 modelos ML en consenso (FreqDecay, Markov, NaiveBayes, LSTM, WheelExpert). Procesa la secuencia activa de la ruleta en tiempo real para extraer vectores de ejecución basados en lógica computacional — no en el azar.",
              },
              {
                q: "¿El sistema garantiza ganancias?",
                a: "No. D.A.N.N.A. es una herramienta de análisis de riesgo y disciplina. El valor está en reducir el MAX de errores consecutivos, mantener la disciplina de stake y operar solo bajo condiciones estadísticamente favorables. El azar no se elimina — se gestiona.",
              },
              {
                q: "¿Cuántos dispositivos puedo usar simultáneamente?",
                a: "1 sesión activa por cuenta. Múltiples sesiones paralelas están bloqueadas por seguridad para proteger la integridad del motor y garantizar consistencia en el análisis.",
              },
              {
                q: "¿Cómo se activa mi plan después de pagar?",
                a: "El webhook de LemonSqueezy activa tu plan automáticamente en segundos. El sistema busca tu cuenta por el email de compra. Por eso es fundamental registrarte con el mismo email que usas al pagar.",
              },
              {
                q: "¿Puedo cancelar mi suscripción?",
                a: "Sí. Cancela en cualquier momento desde tu portal de cliente en LemonSqueezy. El acceso continúa hasta el final del período pagado sin cargos adicionales.",
              },
              {
                q: "¿Qué pasa cuando se acaba el Trial?",
                a: "Al consumir los 250 spins del Trial, el acceso se limita hasta adquirir un plan. Tus datos, historial de sesión y configuración se conservan íntegramente.",
              },
            ].map(({ q, a }, i) => (
              <div
                key={i}
                style={{
                  border: `1px solid ${openFaq === i ? "rgba(0,200,220,0.3)" : "rgba(0,200,220,0.09)"}`,
                  borderRadius: "8px",
                  background: "rgba(255,255,255,0.018)",
                  backdropFilter: "blur(8px)",
                  overflow: "hidden",
                  transition: "border-color .2s",
                }}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{
                    width: "100%", padding: "18px 22px",
                    background: "none", border: "none", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    textAlign: "left", gap: "16px",
                  }}
                >
                  <span style={{ fontSize: "14px", fontWeight: 600, color: openFaq === i ? "#00C8DC" : "rgba(248,250,252,0.85)", transition: "color .2s" }}>
                    {q}
                  </span>
                  <span style={{
                    fontFamily: "'Michroma',sans-serif",
                    fontSize: "16px", color: "#00C8DC", flexShrink: 0,
                    transition: "transform .3s",
                    transform: openFaq === i ? "rotate(45deg)" : "rotate(0deg)",
                    display: "inline-block",
                  }}>+</span>
                </button>
                <div className={`faq-body ${openFaq === i ? "open" : ""}`}>
                  <p style={{ padding: "0 22px 18px", fontSize: "13px", color: "rgba(248,250,252,0.55)", lineHeight: 1.8 }}>
                    {a}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ════════ FOOTER ════════ */}
        <footer style={S.footer}>
          <div style={{ fontFamily: "'Michroma',sans-serif", fontSize: "13px", letterSpacing: "4px", color: "#00C8DC", textShadow: "0 0 20px rgba(0,200,220,0.5)", marginBottom: "10px" }}>
            D.A.N.N.A.
          </div>
          <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "9px", letterSpacing: "2px", color: "rgba(248,250,252,0.35)" }}>
            MOTOR DE ANÁLISIS PROBABILÍSTICO · BOGOTÁ, COLOMBIA · 2026
          </p>
          <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "9px", color: "rgba(248,250,252,0.20)", marginTop: "6px" }}>
            El uso de este sistema es estrictamente analítico. No garantiza resultados financieros.
          </p>
        </footer>

      </div>
    </>
  );
}

// ─── PlanCard ───────────────────────────────────────────────────────────────
interface PlanCardProps {
  tag: string; name: string; price: string; period: string;
  accent: string; features: string[];
  ctaLabel: string; ctaHref: string;
  featured: boolean; featuredBadge: string;
}

function PlanCard({ tag, name, price, period, accent, features, ctaLabel, ctaHref, featured, featuredBadge }: PlanCardProps) {
  const [hov, setHov] = useState(false);
  const rgb = accent === "#00C8DC" ? "0,200,220"
            : accent === "#E8A020" ? "232,160,32"
            : accent === "#1ed97a" ? "30,217,122"
            : "224,48,64";
  const isExternal = ctaHref.startsWith("http");

  return (
    <div
      className="plan-card-wrap"
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position: "relative",
        padding: featured ? "38px 28px 32px" : "30px 24px 28px",
        background: featured ? `rgba(${rgb},0.07)` : "rgba(255,255,255,0.022)",
        border: `1px solid rgba(${rgb},${featured ? 0.45 : 0.15})`,
        borderRadius: "12px",
        backdropFilter: "blur(14px)",
        display: "flex", flexDirection: "column",
        boxShadow: featured
          ? `0 0 50px rgba(${rgb},0.12),inset 0 0 0 1px rgba(${rgb},0.08)`
          : hov ? `0 10px 40px rgba(${rgb},0.10)` : "none",
        transition: "transform .3s, box-shadow .3s",
      }}
    >
      {/* Featured badge */}
      {featuredBadge && (
        <div style={{
          position: "absolute", top: "-13px", left: "50%", transform: "translateX(-50%)",
          padding: "4px 16px",
          background: `rgba(${rgb},0.15)`,
          border: `1px solid rgba(${rgb},0.55)`,
          color: accent,
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: "9px", letterSpacing: "2px",
          borderRadius: "100px", whiteSpace: "nowrap",
          boxShadow: `0 0 18px rgba(${rgb},0.4)`,
          animation: "amberPulse 2.5s ease-in-out infinite",
        }}>
          {featuredBadge}
        </div>
      )}

      {/* Tag */}
      <div style={{
        fontFamily: "'JetBrains Mono',monospace",
        fontSize: "9px", letterSpacing: "2px",
        color: featured ? accent : "rgba(248,250,252,0.35)",
        marginBottom: "14px",
      }}>
        {tag}
      </div>

      {/* Name */}
      <div style={{
        fontFamily: "'Michroma',sans-serif",
        fontSize: "14px", color: "rgba(248,250,252,0.9)",
        marginBottom: "10px",
      }}>
        {name}
      </div>

      {/* Price */}
      <div style={{ marginBottom: "6px" }}>
        <span className={featured ? "grad-amber" : ""} style={{
          fontFamily: "'Michroma',sans-serif",
          fontSize: "38px",
          color: featured ? undefined : accent,
          textShadow: featured ? undefined : `0 0 20px ${accent}50`,
        }}>
          {price}
        </span>
      </div>

      {/* Period */}
      <div style={{
        fontFamily: "'JetBrains Mono',monospace",
        fontSize: "10px", color: "rgba(248,250,252,0.35)",
        marginBottom: "24px",
      }}>
        {period}
      </div>

      {/* Features */}
      <ul style={{ listStyle: "none", flex: 1, marginBottom: "28px", display: "flex", flexDirection: "column", gap: "8px" }}>
        {features.map(f => (
          <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "12px", color: "rgba(248,250,252,0.50)", lineHeight: 1.5 }}>
            <span style={{ color: accent, fontSize: "9px", marginTop: "3px", flexShrink: 0 }}>◆</span>
            {f}
          </li>
        ))}
      </ul>

      {/* CTA */}
      {isExternal ? (
        <a
          href={ctaHref}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "block",
            padding: "12px",
            textAlign: "center",
            textDecoration: "none",
            background: featured ? `rgba(${rgb},0.14)` : "transparent",
            border: `1px solid rgba(${rgb},${featured ? 0.7 : 0.35})`,
            color: accent,
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: "10px", letterSpacing: "1.5px",
            borderRadius: "5px",
            animation: featured ? "amberPulse 2.5s ease-in-out infinite" : "none",
            transition: "background .2s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = `rgba(${rgb},0.2)`)}
          onMouseLeave={e => (e.currentTarget.style.background = featured ? `rgba(${rgb},0.14)` : "transparent")}
        >
          {ctaLabel}
        </a>
      ) : (
        <a
          href={ctaHref}
          style={{
            display: "block",
            padding: "12px",
            textAlign: "center",
            textDecoration: "none",
            background: "transparent",
            border: `1px solid rgba(${rgb},0.35)`,
            color: accent,
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: "10px", letterSpacing: "1.5px",
            borderRadius: "5px",
            animation: "ctaPulse 2.5s ease-in-out infinite",
            transition: "background .2s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = `rgba(${rgb},0.12)`)}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          {ctaLabel}
        </a>
      )}
    </div>
  );
}

// ─── Style objects ──────────────────────────────────────────────────────────
const styles = {
  canvas: {
    position: "fixed" as const,
    inset: 0, width: "100%", height: "100%",
    zIndex: 0, pointerEvents: "none" as const,
  },
  scanOverlay: {
    position: "fixed" as const, inset: 0,
    backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,200,220,0.013) 3px,rgba(0,200,220,0.013) 4px)",
    pointerEvents: "none" as const, zIndex: 1,
  },
  scanSweep: {
    position: "fixed" as const, left: 0, right: 0,
    height: "2px",
    background: "linear-gradient(90deg,transparent,rgba(0,200,220,0.12),transparent)",
    animation: "scanSweep 9s linear infinite",
    pointerEvents: "none" as const, zIndex: 2,
  },
  root: {
    position: "relative" as const, zIndex: 10,
    minHeight: "100vh",
  },
  alertBar: {
    position: "sticky" as const, top: 0, zIndex: 99,
    background: "linear-gradient(90deg,#060205,#0c0309,#060205)",
    borderBottom: "1px solid rgba(224,48,64,0.28)",
    padding: "9px 20px",
    textAlign: "center" as const,
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: "11px",
    color: "rgba(224,80,96,0.85)",
    letterSpacing: "1px",
    animation: "fomoFlicker 3.5s ease-in-out infinite",
  },
  nav: {
    position: "sticky" as const, top: "37px", zIndex: 98,
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "15px 48px",
    backdropFilter: "blur(18px)",
    background: "rgba(4,8,14,0.78)",
    borderBottom: "1px solid rgba(0,200,220,0.07)",
  },
  navLogo: {
    fontFamily: "'Michroma',sans-serif",
    fontSize: "16px", color: "#00C8DC",
    letterSpacing: "6px",
    textShadow: "0 0 20px rgba(0,200,220,0.55)",
  },
  pulseDot: {
    width: "8px", height: "8px", borderRadius: "50%",
    background: "#1ed97a", boxShadow: "0 0 10px #1ed97a",
    animation: "pulseDot 2s ease-in-out infinite",
  },
  navStatus: {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: "9px", letterSpacing: "2.5px",
    color: "rgba(248,250,252,0.35)",
  },
  navBtn: {
    padding: "9px 22px",
    background: "transparent",
    border: "1px solid rgba(0,200,220,0.40)",
    color: "#00C8DC",
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: "10px", letterSpacing: "2px",
    cursor: "pointer", borderRadius: "4px",
    animation: "ctaPulse 2.5s ease-in-out infinite",
    transition: "background .2s",
  },
  hero: {
    position: "relative" as const,
    minHeight: "92vh",
    display: "flex", flexDirection: "column" as const,
    alignItems: "center", justifyContent: "center",
    textAlign: "center" as const,
    padding: "80px 24px 60px",
  },
  heroBadge: {
    display: "inline-block",
    padding: "5px 16px",
    border: "1px solid rgba(0,200,220,0.22)",
    borderRadius: "100px",
    background: "rgba(0,200,220,0.05)",
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: "10px", color: "rgba(248,250,252,0.45)",
    letterSpacing: "1.5px",
  },
  heroTitle: {
    fontFamily: "'Michroma',sans-serif",
    fontSize: "clamp(3.2rem,10vw,7.5rem)",
    fontWeight: 400,
    letterSpacing: "clamp(6px,2vw,18px)",
    lineHeight: 1,
    marginBottom: "16px",
    animation: "glitchTitle 8s ease-in-out infinite",
  },
  heroTagline: {
    fontFamily: "'Michroma',sans-serif",
    fontSize: "clamp(1rem,2.5vw,1.65rem)",
    fontWeight: 700,
    color: "rgba(200,220,232,0.85)",
    letterSpacing: "1.5px",
    marginBottom: "24px",
    lineHeight: 1.4,
  },
  heroDesc: {
    maxWidth: "640px",
    margin: "0 auto 36px",
    color: "rgba(248,250,252,0.45)",
    fontSize: "15px", lineHeight: 1.85,
  },
  heroCta: {
    display: "inline-block",
    padding: "16px 52px",
    background: "rgba(0,200,220,0.08)",
    border: "1px solid rgba(0,200,220,0.50)",
    color: "#00C8DC",
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: "12px", letterSpacing: "2.5px",
    borderRadius: "5px", textDecoration: "none",
    animation: "ctaPulse 2.5s ease-in-out infinite",
    transition: "background .2s",
  },
  heroSubCta: {
    marginTop: "12px",
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: "9px", letterSpacing: "1.5px",
    color: "rgba(248,250,252,0.35)",
  },
  statsRow: {
    display: "flex", gap: "16px", flexWrap: "wrap" as const, justifyContent: "center",
  },
  statChip: {
    display: "flex", flexDirection: "column" as const, alignItems: "center",
    padding: "16px 22px",
    background: "rgba(255,255,255,0.025)",
    border: "1px solid rgba(0,200,220,0.12)",
    borderRadius: "8px", backdropFilter: "blur(8px)",
    minWidth: "110px",
  },
  statVal: { fontFamily: "'Michroma',sans-serif", fontSize: "24px" },
  statLbl: {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: "9px", letterSpacing: "1px",
    color: "rgba(248,250,252,0.35)", marginTop: "5px",
  },
  section: {
    position: "relative" as const, zIndex: 10,
    padding: "96px 48px",
    maxWidth: "1160px", margin: "0 auto",
  },
  eyebrow: {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: "9px", letterSpacing: "3px",
    color: "#00C8DC", marginBottom: "14px",
    textAlign: "center" as const,
  },
  sectionTitle: {
    fontFamily: "'Michroma',sans-serif",
    fontSize: "clamp(1.4rem,3.5vw,2.4rem)",
    fontWeight: 400, color: "rgba(248,250,252,0.95)",
    letterSpacing: "2px", marginBottom: "14px",
    lineHeight: 1.2,
  },
  sectionSub: {
    color: "rgba(248,250,252,0.40)",
    fontSize: "14px", maxWidth: "500px",
    marginInline: "auto" as const, lineHeight: 1.75,
  },
  sciGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
    gap: "20px",
  },
  sciCard: {
    position: "relative" as const,
    padding: "32px 26px",
    background: "rgba(255,255,255,0.022)",
    borderRadius: "12px",
    backdropFilter: "blur(12px)",
    overflow: "hidden",
  },
  sciNum: {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: "9px", letterSpacing: "2px",
    marginBottom: "14px",
  },
  sciTitle: {
    fontFamily: "'Michroma',sans-serif",
    fontSize: "15px", color: "rgba(248,250,252,0.9)",
    marginBottom: "12px",
  },
  sciBody: {
    fontSize: "13px", color: "rgba(248,250,252,0.45)", lineHeight: 1.8,
  },
  exclusiveSection: {
    position: "relative" as const, zIndex: 10,
    padding: "0 0 0 0",
  },
  exclusiveBar: {
    borderTop: "1px solid rgba(0,200,220,0.08)",
    borderBottom: "1px solid rgba(0,200,220,0.08)",
    background: "rgba(0,200,220,0.025)",
    padding: "16px 0",
    overflow: "hidden",
  },
  exScrollWrap: {
    display: "flex", gap: "64px",
    whiteSpace: "nowrap" as const,
    animation: "exScroll 22s linear infinite",
    width: "max-content",
  },
  exItem: {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: "10px", letterSpacing: "2.5px",
    color: "rgba(0,200,220,0.40)",
  },
  exclusiveCard: {
    maxWidth: "860px", margin: "0 auto",
    padding: "48px 48px",
    background: "rgba(255,255,255,0.018)",
    backdropFilter: "blur(8px)",
    borderLeft: "3px solid rgba(0,200,220,0.25)",
  },
  plansGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
    gap: "20px",
    alignItems: "end",
  },
  regCard: {
    padding: "40px 36px",
    background: "rgba(255,255,255,0.022)",
    border: "1px solid rgba(0,200,220,0.14)",
    borderRadius: "14px",
    backdropFilter: "blur(14px)",
    animation: "borderGlow 4s ease-in-out infinite",
  },
  fieldWrap: { marginBottom: "14px" },
  fieldLabel: {
    display: "block",
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: "9px", letterSpacing: "2px",
    color: "rgba(248,250,252,0.35)",
    marginBottom: "7px",
  },
  legalBox: {
    marginBottom: "22px", padding: "16px",
    background: "rgba(224,48,64,0.04)",
    border: "1px solid rgba(224,48,64,0.16)",
    borderRadius: "5px",
    display: "flex", gap: "12px", alignItems: "flex-start",
  },
  legalText: {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: "10px", color: "rgba(248,250,252,0.40)",
    lineHeight: 1.7, cursor: "pointer",
  },
  submitBtn: {
    width: "100%", padding: "15px",
    background: "rgba(0,200,220,0.08)",
    border: "1px solid rgba(0,200,220,0.50)",
    color: "#00C8DC",
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: "11px", letterSpacing: "2px",
    borderRadius: "5px",
    animation: "ctaPulse 2.5s ease-in-out infinite",
    display: "flex", alignItems: "center",
    justifyContent: "center", gap: "10px",
    transition: "background .2s",
  },
  spinner: {
    display: "inline-block",
    width: "12px", height: "12px",
    border: "2px solid rgba(0,200,220,0.25)",
    borderTop: "2px solid #00C8DC",
    borderRadius: "50%",
    animation: "spinAnim .8s linear infinite",
  },
  msgBox: {
    marginTop: "14px",
    padding: "12px 16px",
    borderRadius: "5px",
    border: "1px solid",
    textAlign: "center" as const,
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: "11px", letterSpacing: "0.5px",
    lineHeight: 1.6,
  },
  loginLink: {
    marginTop: "24px", paddingTop: "20px",
    borderTop: "1px solid rgba(0,200,220,0.10)",
    textAlign: "center" as const,
  },
  loginBtn: {
    display: "inline-block",
    padding: "10px 28px",
    background: "transparent",
    border: "1px solid rgba(0,200,220,0.30)",
    color: "rgba(0,200,220,0.80)",
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: "10px", letterSpacing: "2px",
    borderRadius: "4px", textDecoration: "none",
    transition: "background .2s, border-color .2s",
  },
  footer: {
    borderTop: "1px solid rgba(0,200,220,0.08)",
    padding: "44px 24px",
    textAlign: "center" as const,
    background: "rgba(0,0,0,0.3)",
    backdropFilter: "blur(8px)",
  },
} as const;
