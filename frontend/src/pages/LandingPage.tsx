import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../styles/landing.css";

export default function LandingPage() {
  const navigate = useNavigate();
  const [fomoCount, setFomoCount] = useState(14);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [legal, setLegal] = useState(false);
  const [msg, setMsg] = useState<{ text: string; color: string; html?: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fadeRefs = useRef<(HTMLDivElement | null)[]>([]);

  // ── FOMO counter ──
  useEffect(() => {
    const interval = setInterval(() => {
      setFomoCount((v) => {
        if (v > 4 && Math.random() > 0.75) return v - 1;
        return v;
      });
    }, 18000);
    return () => clearInterval(interval);
  }, []);

  // ── Fade observer ──
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.08 }
    );
    document.querySelectorAll(".fade").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // ── Submit handler ──
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
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
          email: email.trim(),
        }),
      });
      const data = await res.json();

      if (data.success) {
        setMsg({
          text:
            '◈ Cuenta creada exitosamente.<br><span style="color:rgba(155,195,212,0.6);font-size:10px;">Adquiere tu licencia arriba usando este mismo email para activación automática.</span>',
          color: "#ffd700",
          html: true,
        });
        setUsername("");
        setEmail("");
        setPassword("");
        setLegal(false);
      } else {
        setMsg({
          text: "◈ " + (data.message || "Error al crear cuenta."),
          color: "#e03040",
        });
      }
    } catch (err) {
      setMsg({
        text: "◈ Error de conexión. Verifica tu red e intenta de nuevo.",
        color: "#e03040",
      });
    }

    setSubmitting(false);
  }

  return (
    <div className="landing-root">
      {/* ── ALERT BAR ── */}
      <div className="alert-bar">
        ◈ Acceso limitado activo &nbsp;·&nbsp; <span>{fomoCount}</span> licencias disponibles &nbsp;·&nbsp; El cupo cierra cuando se completa la capacidad operativa
      </div>

      {/* ── NAV ── */}
      <nav>
        <div className="font-head" style={{ fontSize: "14px", fontWeight: "bold", letterSpacing: "0.1em", color: "#ffd700" }}>
          D.A.N.N.A.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="pulse-dot"></span>
          <span className="font-mono" style={{ fontSize: "9px", letterSpacing: "2px", color: "rgba(248,250,252,0.45)" }}>
            SISTEMA OPERATIVO
          </span>
        </div>
        <button
          onClick={() => navigate("/login")}
          className="btn-primary"
          style={{ padding: "8px 20px", fontSize: "9px" }}
        >
          ACCEDER AL TERMINAL →
        </button>
      </nav>

      {/* ── HERO ── */}
      <section className="hero-section">
        <div className="fade" style={{ marginBottom: "16px" }}>
          <span className="badge" style={{ borderColor: "rgba(255,215,0,0.30)", color: "rgba(248,250,252,0.45)" }}>
            Motor Predictivo · Versión 1.0 · Validado sobre 8,151 Spins
          </span>
        </div>

        <h1 className="fade font-head grad-cyan" style={{ fontSize: "clamp(3rem,10vw,7rem)", fontWeight: 900, letterSpacing: "-1px", lineHeight: 1, marginBottom: "12px" }}>
          D.A.N.N.A.
        </h1>

        <h2 className="fade font-head" style={{ fontSize: "clamp(1.1rem,3vw,2rem)", fontWeight: "bold", color: "rgba(200,220,232,0.85)", letterSpacing: "2px", marginBottom: "24px" }}>
          Nada permanece oculto bajo el análisis..
          <br />
          <span style={{ color: "rgba(248,250,252,0.45)", fontWeight: 400 }}>
            Lo que parece caos tiene estructura. Nosotros la procesamos.
          </span>
        </h2>

        <p className="fade" style={{ maxWidth: "640px", margin: "0 auto 36px", color: "rgba(248,250,252,0.45)", fontSize: "15px", lineHeight: 1.8 }}>
          D.A.N.N.A. es un motor de análisis probabilístico de alta precisión. Procesa flujos de frecuencia y ciclos de comportamiento en tiempo real para extraer vectores de ejecución basados en lógica computacional — no en el azar.
        </p>

        <div className="fade" style={{ marginBottom: "56px" }}>
          <a href="#registro" className="btn-primary" style={{ fontSize: "12px", padding: "16px 48px" }}>
            ◈ ACCEDER AL TERMINAL
          </a>
          <p style={{ marginTop: "12px", fontFamily: "'JetBrains Mono',monospace", fontSize: "9px", letterSpacing: "1.5px", color: "rgba(248,250,252,0.45)" }}>
            Registro en 60 segundos · Sin tarjeta requerida para Trial
          </p>
        </div>

        {/* Stats row */}
        <div className="fade stats-row">
          <div className="stat-chip">
            <span className="val" style={{ color: "#ffd700" }}>68.1%</span>
            <span className="lbl">Hit Rate Docenas</span>
          </div>
          <div className="stat-chip">
            <span className="val" style={{ color: "#ffd700" }}>8,151</span>
            <span className="lbl">Spins Validados</span>
          </div>
          <div className="stat-chip">
            <span className="val" style={{ color: "#b8960f" }}>+838u</span>
            <span className="lbl">PnL Backtest</span>
          </div>
          <div className="stat-chip">
            <span className="val" style={{ color: "#ffd700" }}>5</span>
            <span className="lbl">Modelos ML</span>
          </div>
        </div>
      </section>

      <div className="divider"></div>

      {/* ── SCIENCE ── */}
      <section className="px-6 py-24 max-w-5xl mx-auto">
        <div className="fade" style={{ textAlign: "center", marginBottom: "56px" }}>
          <div className="font-mono" style={{ fontSize: "9px", letterSpacing: "3px", color: "#ffd700", marginBottom: "10px" }}>◈ ARQUITECTURA</div>
          <h2 className="font-head" style={{ fontSize: "clamp(1.5rem,3vw,2.2rem)", fontWeight: "bold", color: "#f8fafc" }}>
            The Science Behind the Edge
          </h2>
          <p style={{ color: "rgba(248,250,252,0.45)", marginTop: "10px", fontSize: "14px", maxWidth: "520px", marginInline: "auto" }}>
            Tres pilares técnicos que convierten el ruido estadístico en vectores de ejecución accionables.
          </p>
        </div>

        <div className="fade sci-grid">
          <div className="sci-card">
            <div className="font-mono" style={{ fontSize: "9px", letterSpacing: "2px", color: "#ffd700", marginBottom: "14px" }}>01 · ENSEMBLE NEURAL</div>
            <h3 className="font-head" style={{ fontSize: "16px", color: "#f8fafc", marginBottom: "10px" }}>Red de Modelos Adaptativos</h3>
            <p style={{ fontSize: "13px", color: "rgba(248,250,252,0.45)", lineHeight: 1.8 }}>
              Cinco modelos operan en paralelo — FreqDecay, Markov, NaiveBayes, LSTM y WheelExpert físico. Un meta-learner pondera sus votos con pesos adaptativos en tiempo real según su rendimiento reciente.
            </p>
          </div>

          <div className="sci-card">
            <div className="font-mono" style={{ fontSize: "9px", letterSpacing: "2px", color: "#ffd700", marginBottom: "14px" }}>02 · ANÁLISIS DE CICLOS</div>
            <h3 className="font-head" style={{ fontSize: "16px", color: "#f8fafc", marginBottom: "10px" }}>Detección de Patrones Físicos</h3>
            <p style={{ fontSize: "13px", color: "rgba(248,250,252,0.45)", lineHeight: 1.8 }}>
              WheelExpert Premium analiza la firma del crupier, el scatter de la bola y la dominancia de sector en la rueda europea. Cuando hay patrón físico detectable, el sistema lo extrae y lo traduce en probabilidades accionables.
            </p>
          </div>

          <div className="sci-card">
            <div className="font-mono" style={{ fontSize: "9px", letterSpacing: "2px", color: "#ffd700", marginBottom: "14px" }}>03 · GESTIÓN DE VARIANZA</div>
            <h3 className="font-head" style={{ fontSize: "16px", color: "#f8fafc", marginBottom: "10px" }}>Protocolo de Capital Óptimo</h3>
            <p style={{ fontSize: "13px", color: "rgba(248,250,252,0.45)", lineHeight: 1.8 }}>
              El indicador OPTIMAL / CAUTION / ABORT evalúa en tiempo real el score de la mesa, la entropía del sistema y los errores consecutivos. Cuando las condiciones son adversas, el motor lo indica antes de que el capital esté en riesgo.
            </p>
          </div>
        </div>
      </section>

      <div className="divider"></div>

      {/* ── EXCLUSIVITY ── */}
      <section className="exclusive-section fade">
        <div className="exclusive-bar">
          <div style={{ flex: "0 0 auto" }}>
            <div className="font-head" style={{ fontSize: "11px", letterSpacing: "2px", color: "#b8960f" }}>◈ ACCESO RESTRINGIDO</div>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: "13px", color: "rgba(248,250,252,0.45)", lineHeight: 1.7 }}>
              El cupo de operadores activos es deliberadamente limitado. Un número elevado de usuarios simultáneos sobre los mismos patrones de mesa reduce la ventaja algorítmica colectiva. D.A.N.N.A. no es un producto masivo — es una herramienta para quienes toman el riesgo en serio.
            </p>
          </div>
        </div>
      </section>

      <div className="divider"></div>

      {/* ── PLANES ── */}
      <section id="planes" className="planes-section">
        <div className="fade" style={{ textAlign: "center", marginBottom: "56px" }}>
          <div className="font-mono" style={{ fontSize: "9px", letterSpacing: "3px", color: "#ffd700", marginBottom: "10px" }}>◈ LICENCIAS</div>
          <h2 className="font-head" style={{ fontSize: "clamp(1.5rem,3vw,2.2rem)", fontWeight: "bold" }}>Adquiere Tu Licencia de Acceso</h2>
          <p style={{ color: "rgba(248,250,252,0.45)", marginTop: "10px", fontSize: "14px" }}>
            Sin contratos. Sin permanencia. Activa solo cuando vayas a operar.
          </p>
        </div>

        <div className="fade plans-grid">
          {/* Trial */}
          <div className="plan-card">
            <div className="font-mono" style={{ fontSize: "9px", letterSpacing: "2px", color: "rgba(248,250,252,0.45)", marginBottom: "16px" }}>ENTRADA</div>
            <div className="font-head" style={{ fontSize: "15px", fontWeight: "bold", color: "#f8fafc", marginBottom: "8px" }}>Trial Access</div>
            <div className="font-head" style={{ fontSize: "2.5rem", fontWeight: 900, color: "#ffd700", lineHeight: 1, marginBottom: "4px" }}>$0</div>
            <div className="font-mono" style={{ fontSize: "10px", color: "rgba(248,250,252,0.45)", marginBottom: "24px" }}>250 spins · Un solo uso</div>
            <ul style={{ listStyle: "none", fontSize: "12px", color: "rgba(248,250,252,0.45)", lineHeight: 2, marginBottom: "28px", flex: 1 }}>
              <li>· Motor completo</li>
              <li>· Sin tarjeta requerida</li>
              <li>· WheelExpert activo</li>
            </ul>
            <a href="#registro" className="btn-outline">INICIAR TRIAL →</a>
          </div>

          {/* Daily */}
          <div className="plan-card">
            <div className="font-mono" style={{ fontSize: "9px", letterSpacing: "2px", color: "rgba(248,250,252,0.45)", marginBottom: "16px" }}>SESIÓN</div>
            <div className="font-head" style={{ fontSize: "15px", fontWeight: "bold", color: "#f8fafc", marginBottom: "8px" }}>Daily Pass</div>
            <div className="font-head" style={{ fontSize: "2.5rem", fontWeight: 900, color: "#ffd700", lineHeight: 1, marginBottom: "4px" }}>$10</div>
            <div className="font-mono" style={{ fontSize: "10px", color: "rgba(248,250,252,0.45)", marginBottom: "24px" }}>Acceso 24 horas · Ilimitado</div>
            <ul style={{ listStyle: "none", fontSize: "12px", color: "rgba(248,250,252,0.45)", lineHeight: 2, marginBottom: "28px", flex: 1 }}>
              <li>· Spins ilimitados</li>
              <li>· Motor completo</li>
              <li>· Activación inmediata</li>
            </ul>
            <a href="https://mlgunnerenginedanna.lemonsqueezy.com/checkout/buy/ccab099f-9c7d-47a2-9874-a7cba4d93766" target="_blank" rel="noopener noreferrer" className="btn-outline">
              ADQUIRIR LICENCIA — $10 →
            </a>
          </div>

          {/* Weekly featured */}
          <div className="plan-card featured" style={{ position: "relative" }}>
            <div style={{ position: "absolute", top: "-12px", left: "50%", transform: "translateX(-50%)" }}>
              <span className="badge" style={{ borderColor: "#b8960f", color: "#b8960f", background: "rgba(232,160,32,0.12)" }}>
                MÁS SELECCIONADO
              </span>
            </div>
            <div className="font-mono" style={{ fontSize: "9px", letterSpacing: "2px", color: "#b8960f", marginBottom: "16px" }}>OPERACIONAL</div>
            <div className="font-head" style={{ fontSize: "15px", fontWeight: "bold", color: "#f8fafc", marginBottom: "8px" }}>Weekly Pro</div>
            <div className="font-head grad-amber" style={{ fontSize: "2.5rem", fontWeight: 900, lineHeight: 1, marginBottom: "4px" }}>$25</div>
            <div className="font-mono" style={{ fontSize: "10px", color: "rgba(248,250,252,0.45)", marginBottom: "24px" }}>7 días · Acceso total</div>
            <ul style={{ listStyle: "none", fontSize: "12px", color: "rgba(248,250,252,0.45)", lineHeight: 2, marginBottom: "28px", flex: 1 }}>
              <li>· Spins ilimitados</li>
              <li>· Soporte prioritario</li>
              <li>· Actualizaciones de algoritmo</li>
              <li>· Todas las categorías activas</li>
            </ul>
            <a href="https://mlgunnerenginedanna.lemonsqueezy.com/checkout/buy/3cdb40dd-defd-468d-a2fe-b47b1fe6b18b" target="_blank" rel="noopener noreferrer" className="btn-amber">
              ADQUIRIR LICENCIA — $25 →
            </a>
          </div>

          {/* Monthly */}
          <div className="plan-card">
            <div className="font-mono" style={{ fontSize: "9px", letterSpacing: "2px", color: "rgba(248,250,252,0.45)", marginBottom: "16px" }}>ÉLITE</div>
            <div className="font-head" style={{ fontSize: "15px", fontWeight: "bold", color: "#f8fafc", marginBottom: "8px" }}>Monthly Elite</div>
            <div className="font-head" style={{ fontSize: "2.5rem", fontWeight: 900, color: "#ffd700", lineHeight: 1, marginBottom: "4px" }}>$75</div>
            <div className="font-mono" style={{ fontSize: "10px", color: "rgba(248,250,252,0.45)", marginBottom: "24px" }}>30 días · Máxima cobertura</div>
            <ul style={{ listStyle: "none", fontSize: "12px", color: "rgba(248,250,252,0.45)", lineHeight: 2, marginBottom: "28px", flex: 1 }}>
              <li>· Spins ilimitados</li>
              <li>· Soporte dedicado</li>
              <li>· Todas las actualizaciones</li>
              <li>· Acceso prioritario a nuevas versiones</li>
            </ul>
            <a href="https://mlgunnerenginedanna.lemonsqueezy.com/checkout/buy/41a8c44e-e7b9-4782-a3a1-33a51c7da1c5" target="_blank" rel="noopener noreferrer" className="btn-outline">
              ADQUIRIR LICENCIA — $75 →
            </a>
          </div>
        </div>

        <div className="fade" style={{ marginTop: "24px", textAlign: "center" }}>
          <p className="font-mono" style={{ fontSize: "10px", color: "rgba(248,250,252,0.45)", letterSpacing: "1px" }}>
            ◈ Usa el mismo email en LemonSqueezy y en tu registro D.A.N.N.A. — la activación es automática.
          </p>
        </div>
      </section>

      <div className="divider"></div>

      {/* ── REGISTRO ── */}
      <section id="registro" className="registro-section">
        <div className="fade" style={{ textAlign: "center", marginBottom: "40px" }}>
          <div className="font-mono" style={{ fontSize: "9px", letterSpacing: "3px", color: "#ffd700", marginBottom: "10px" }}>◈ ACCESO</div>
          <h2 className="font-head" style={{ fontSize: "clamp(1.4rem,3vw,2rem)", fontWeight: "bold" }}>Crear Cuenta de Operador</h2>
          <p style={{ color: "rgba(248,250,252,0.45)", marginTop: "10px", fontSize: "13px", lineHeight: 1.7 }}>
            Registra tu cuenta. Luego adquiere tu licencia arriba.
            <br />
            La activación es automática al confirmar el pago.
          </p>
        </div>

        <div className="fade card card-glow" style={{ padding: "36px" }}>
          <form onSubmit={handleSubmit} autoComplete="off">
            <div style={{ marginBottom: "14px" }}>
              <label className="font-mono" style={{ fontSize: "9px", letterSpacing: "2px", color: "rgba(248,250,252,0.45)", display: "block", marginBottom: "6px" }}>
                NOMBRE DE USUARIO
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="field"
                placeholder="minimo 3 caracteres"
                required
              />
            </div>

            <div style={{ marginBottom: "14px" }}>
              <label className="font-mono" style={{ fontSize: "9px", letterSpacing: "2px", color: "rgba(248,250,252,0.45)", display: "block", marginBottom: "6px" }}>
                CORREO ELECTRÓNICO
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field"
                placeholder="el mismo que usarás en LemonSqueezy"
                required
              />
            </div>

            <div style={{ marginBottom: "14px" }}>
              <label className="font-mono" style={{ fontSize: "9px", letterSpacing: "2px", color: "rgba(248,250,252,0.45)", display: "block", marginBottom: "6px" }}>
                CONTRASEÑA
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field"
                placeholder="mínimo 6 caracteres"
                required
              />
            </div>

            <div style={{ marginBottom: "24px", padding: "16px", background: "rgba(224,48,64,0.05)", border: "1px solid rgba(224,48,64,0.18)", borderRadius: "4px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
              <input
                type="checkbox"
                checked={legal}
                onChange={(e) => setLegal(e.target.checked)}
                style={{ marginTop: "2px" }}
                required
              />
              <label className="font-mono" style={{ fontSize: "10px", color: "rgba(248,250,252,0.45)", lineHeight: 1.6, cursor: "pointer" }}>
                Soy mayor de edad (18+). Entiendo que D.A.N.N.A. es una herramienta de{" "}
                <strong style={{ color: "#f8fafc" }}>análisis probabilístico</strong>, no una garantía de resultados financieros. Asumo el 100% del riesgo operativo.
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn-primary"
              style={{ width: "100%", padding: "15px", fontSize: "11px" }}
            >
              {submitting ? "◈ PROCESANDO..." : "◈ CREAR CUENTA DE OPERADOR →"}
            </button>

            {msg && (
              <div
                style={{
                  display: "block",
                  marginTop: "16px",
                  textAlign: "center",
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: "11px",
                  letterSpacing: "1px",
                  color: msg.color,
                }}
                dangerouslySetInnerHTML={msg.html ? { __html: msg.text } : undefined}
              >
                {msg.html ? null : msg.text}
              </div>
            )}
          </form>

          <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: "1px solid rgba(255,215,0,0.14)", textAlign: "center" }}>
            <p className="font-mono" style={{ fontSize: "10px", color: "rgba(248,250,252,0.45)", marginBottom: "8px" }}>
              ¿Ya tienes cuenta?
            </p>
            <Link to="/login" className="btn-outline" style={{ display: "inline-block", width: "auto", padding: "10px 28px" }}>
              ACCEDER AL TERMINAL →
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: "1px solid rgba(255,215,0,0.14)", padding: "40px 24px", textAlign: "center" }}>
        <div className="font-head" style={{ fontSize: "11px", letterSpacing: "3px", color: "#ffd700", marginBottom: "8px" }}>
          D.A.N.N.A.
        </div>
        <p className="font-mono" style={{ fontSize: "9px", letterSpacing: "2px", color: "rgba(248,250,252,0.45)" }}>
          MOTOR DE ANÁLISIS PROBABILÍSTICO · BOGOTÁ, COLOMBIA · 2026
        </p>
        <p className="font-mono" style={{ fontSize: "9px", color: "rgba(248,250,252,0.45)", marginTop: "6px", opacity: 0.6 }}>
          El uso de este sistema es estrictamente analítico. No garantiza resultados financieros.
        </p>
      </footer>
    </div>
  );
}