"""
D.A.N.N.A. Authentication & Subscription Module
"""

import os
import sqlite3
import hashlib
import bcrypt
from datetime import datetime, timezone, timedelta

import streamlit as st

AUTH_DB_PATH = os.path.join(os.environ.get("DANNA_DATA_DIR", os.path.dirname(__file__)), "danna_users.db")

PLANS = {
    "trial": {"name":"Trial","price_usd":0,"description":"30 Spins totales","max_spins_total":30,"max_spins_per_day":30,"duration_days":365},
    "daily_pass": {"name":"Daily Pass","price_usd":10,"description":"24h ilimitado","max_spins_total":999999,"max_spins_per_day":999999,"duration_days":1},
    "weekly_pro": {"name":"Weekly Pro","price_usd":25,"description":"7 dias ilimitado","max_spins_total":999999,"max_spins_per_day":999999,"duration_days":7},
    "monthly": {"name":"Monthly Pro","price_usd":75,"description":"30 dias ilimitado","max_spins_total":999999,"max_spins_per_day":999999,"duration_days":30},
    "admin": {"name":"Admin","price_usd":0,"description":"Acceso total","max_spins_total":999999,"max_spins_per_day":999999,"duration_days":36500},
}

STATUS_PENDING   = "pending"
STATUS_ACTIVE    = "active"
STATUS_SUSPENDED = "suspended"


def _get_db():
    conn = sqlite3.connect(AUTH_DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("""CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        email TEXT DEFAULT '',
        status TEXT DEFAULT 'pending',
        plan TEXT DEFAULT 'trial',
        plan_expires TEXT DEFAULT '',
        spins_used_total INTEGER DEFAULT 0,
        spins_today INTEGER DEFAULT 0,
        spins_today_date TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        last_login TEXT DEFAULT '',
        approved_at TEXT DEFAULT '',
        approved_by TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        is_active INTEGER DEFAULT 1
    )""")
    for col_sql in [
        "ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'pending'",
        "ALTER TABLE users ADD COLUMN spins_used_total INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN approved_at TEXT DEFAULT ''",
        "ALTER TABLE users ADD COLUMN approved_by TEXT DEFAULT ''",
        "ALTER TABLE users ADD COLUMN notes TEXT DEFAULT ''",
    ]:
        try:
            conn.execute(col_sql)
        except Exception:
            pass
    conn.commit()
    return conn


def _hash_password(password: str) -> str:
    """Hash password using bcrypt with auto-generated salt.

    bcrypt is designed for password hashing:
    - Slow (intentionally) to resist brute force
    - Unique salt per password
    - Industry standard since 1999
    """
    if not isinstance(password, str):
        password = str(password)
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def _verify_password(password: str, stored_hash: str) -> bool:
    """Verify a password against a bcrypt hash.

    Returns True if password matches, False otherwise.
    Safe to call with any string input - never raises.
    """
    try:
        if not isinstance(password, str):
            password = str(password)
        if not isinstance(stored_hash, str):
            return False
        return bcrypt.checkpw(password.encode("utf-8"), stored_hash.encode("utf-8"))
    except Exception:
        return False



# ── CRUD ──────────────────────────────────────────────────────────────────────

def create_user(username, password, email="", plan="trial", status=STATUS_PENDING):
    try:
        username = username.strip().lower()
        if len(username) < 3: return {"error": "Usuario debe tener minimo 3 caracteres"}
        if len(password) < 6: return {"error": "Contrasena debe tener minimo 6 caracteres"}
        conn    = _get_db()
        now     = datetime.now(timezone.utc).isoformat()
        expires = (datetime.now(timezone.utc) + timedelta(days=PLANS.get(plan, PLANS["trial"])["duration_days"])).isoformat()
        conn.execute("INSERT INTO users (username,password_hash,email,status,plan,plan_expires,created_at) VALUES (?,?,?,?,?,?,?)",
                     (username, _hash_password(password), email, status, plan, expires, now))
        conn.commit(); conn.close()
        return {"success": True, "username": username}
    except sqlite3.IntegrityError:
        return {"error": "Este usuario ya existe"}
    except Exception as e:
        return {"error": str(e)}


def verify_user(username, password):
    try:
        username = username.strip().lower()
        conn = _get_db()
        row  = conn.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
        if row is None or not _verify_password(password, row["password_hash"]):
            conn.close(); return None
        conn.execute("UPDATE users SET last_login=? WHERE id=?", (datetime.now(timezone.utc).isoformat(), row["id"]))
        conn.commit(); user = dict(row); conn.close()
        return user
    except Exception:
        return None


def get_user_info(username):
    try:
        conn = _get_db()
        row  = conn.execute("SELECT * FROM users WHERE username=?", (username.strip().lower(),)).fetchone()
        conn.close()
        return dict(row) if row else None
    except Exception:
        return None


def is_subscription_active(user):
    try:
        if user.get("plan") == "admin": return True
        if user.get("status") != STATUS_ACTIVE: return False
        expires = user.get("plan_expires","")
        if not expires: return False
        if datetime.now(timezone.utc) >= datetime.fromisoformat(expires.replace("Z","+00:00")): return False
        plan_info = PLANS.get(user.get("plan","trial"), PLANS["trial"])
        if int(user.get("spins_used_total",0)) >= plan_info.get("max_spins_total",999999): return False
        return True
    except Exception:
        return False


def get_spins_remaining(user):
    try:
        plan_info   = PLANS.get(user.get("plan","trial"), PLANS["trial"])
        used_total  = int(user.get("spins_used_total",0))
        today       = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        used_today  = int(user.get("spins_today",0)) if user.get("spins_today_date")==today else 0
        rem_daily   = max(0, plan_info.get("max_spins_per_day",999999) - used_today)
        rem_total   = max(0, plan_info.get("max_spins_total",999999) - used_total)
        return {"remaining":min(rem_daily,rem_total),"remaining_total":rem_total,"used_total":used_total,
                "max_total":plan_info.get("max_spins_total",999999),"is_trial":user.get("plan")=="trial"}
    except Exception:
        return {"remaining":0}


def increment_spin(username):
    try:
        conn  = _get_db()
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        row   = conn.execute("SELECT spins_today_date FROM users WHERE username=?", (username,)).fetchone()
        if row and row["spins_today_date"] == today:
            conn.execute("UPDATE users SET spins_today=spins_today+1,spins_used_total=spins_used_total+1 WHERE username=?", (username,))
        else:
            conn.execute("UPDATE users SET spins_today=1,spins_today_date=?,spins_used_total=spins_used_total+1 WHERE username=?", (today, username))
        conn.commit(); conn.close()
    except Exception:
        pass


# ── Admin helpers ─────────────────────────────────────────────────────────────

def admin_list_users():
    try:
        conn = _get_db()
        rows = conn.execute("SELECT * FROM users ORDER BY id").fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception:
        return []


def admin_approve_user(username, plan="trial", approved_by="admin", days=None):
    try:
        plan_info = PLANS.get(plan, PLANS["trial"])
        if days is None: days = plan_info["duration_days"]
        expires = (datetime.now(timezone.utc) + timedelta(days=int(days))).isoformat()
        now     = datetime.now(timezone.utc).isoformat()
        conn    = _get_db()
        conn.execute("UPDATE users SET status=?,plan=?,plan_expires=?,approved_at=?,approved_by=? WHERE username=?",
                     (STATUS_ACTIVE, plan, expires, now, approved_by, username.strip().lower()))
        conn.commit(); conn.close(); return True
    except Exception:
        return False


def admin_suspend_user(username):
    try:
        conn = _get_db()
        conn.execute("UPDATE users SET status=? WHERE username=?", (STATUS_SUSPENDED, username.strip().lower()))
        conn.commit(); conn.close(); return True
    except Exception:
        return False


def admin_reactivate_user(username):
    try:
        conn = _get_db()
        conn.execute("UPDATE users SET status=? WHERE username=?", (STATUS_ACTIVE, username.strip().lower()))
        conn.commit(); conn.close(); return True
    except Exception:
        return False


def admin_delete_user(username):
    try:
        conn = _get_db()
        conn.execute("DELETE FROM users WHERE username=?", (username.strip().lower(),))
        conn.commit(); conn.close(); return True
    except Exception:
        return False


def admin_reset_spins(username):
    try:
        conn = _get_db()
        conn.execute("UPDATE users SET spins_used_total=0,spins_today=0 WHERE username=?", (username.strip().lower(),))
        conn.commit(); conn.close(); return True
    except Exception:
        return False


def admin_update_notes(username, notes):
    try:
        conn = _get_db()
        conn.execute("UPDATE users SET notes=? WHERE username=?", (str(notes), username.strip().lower()))
        conn.commit(); conn.close(); return True
    except Exception:
        return False


def admin_set_expiry(username, days):
    try:
        expires = (datetime.now(timezone.utc) + timedelta(days=int(days))).isoformat()
        conn    = _get_db()
        conn.execute("UPDATE users SET plan_expires=? WHERE username=?", (expires, username.strip().lower()))
        conn.commit(); conn.close(); return True
    except Exception:
        return False


def admin_change_password(username, new_password):
    try:
        if len(new_password) < 6: return False
        conn = _get_db()
        conn.execute("UPDATE users SET password_hash=? WHERE username=?",
                     (_hash_password(new_password), username.strip().lower()))
        conn.commit(); conn.close(); return True
    except Exception:
        return False


def admin_set_plan(username, plan, days=None):
    return admin_approve_user(username, plan, "admin", days)


# ── Auth flow ─────────────────────────────────────────────────────────────────

def check_auth():
    if st.session_state.get("_auth_user") and isinstance(st.session_state["_auth_user"], dict):
        user  = st.session_state["_auth_user"]
        fresh = get_user_info(user.get("username",""))
        if fresh:
            if fresh.get("status") == STATUS_PENDING:   _render_pending_screen(fresh); return None
            if fresh.get("status") == STATUS_SUSPENDED: _render_suspended_screen(); return None
            if not is_subscription_active(fresh):       _render_expired_screen(fresh); return None
            st.session_state["_auth_user"] = fresh
            st.session_state["user_id"]    = fresh["username"]
            return fresh
        else:
            st.session_state["_auth_user"] = None
    _render_auth_form()
    return None


def _render_auth_form():
    st.markdown("""
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=JetBrains+Mono:wght@400;600&display=swap');
    section[data-testid="stSidebar"]{display:none!important;}
    header[data-testid="stHeader"]{display:none!important;}
    footer{display:none!important;}
    #MainMenu{display:none!important;}
    .block-container{padding:2rem 1rem!important;max-width:420px!important;margin:0 auto!important;}
    [data-testid="stAppViewContainer"]{background:#03050a!important;}

    /* Canvas neural background */
    #dn-bg{position:fixed;inset:0;z-index:0;pointer-events:none;}

    /* Logo */
    .dn-logo{font-family:'Orbitron',monospace;font-size:28px;font-weight:900;letter-spacing:4px;
      background:linear-gradient(90deg,#00c8dc,#0080ff,#1ed97a,#00c8dc);background-size:300%;
      -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
      animation:dnsh 4s linear infinite;text-align:center;margin-bottom:4px;margin-top:20px;}
    @keyframes dnsh{from{background-position:0%;}to{background-position:300%;}}
    .dn-sub{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:2px;
      color:rgba(0,200,220,0.40);text-align:center;margin-bottom:28px;text-transform:uppercase;}
    .dn-status{font-family:'JetBrains Mono',monospace;font-size:9px;color:rgba(30,217,122,0.50);
      letter-spacing:1px;text-align:center;margin-top:16px;
      display:flex;align-items:center;justify-content:center;gap:6px;}
    .dn-dot{width:5px;height:5px;border-radius:50%;background:#1ed97a;
      animation:dndp 1.8s ease-in-out infinite;flex-shrink:0;}
    @keyframes dndp{0%,100%{opacity:1;}50%{opacity:0.2;}}
    .dn-rmsg{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:1.5px;
      color:rgba(0,200,220,0.32);text-align:center;margin-top:8px;
      text-transform:uppercase;height:14px;transition:opacity 0.4s;}
    .dn-rmsg.fade{opacity:0;}

    /* Override Streamlit inputs */
    .stTextInput input{
      background:rgba(2,4,10,0.92)!important;
      border:1px solid rgba(0,200,220,0.18)!important;
      border-radius:4px!important;color:#c8e0ea!important;
      font-family:'JetBrains Mono',monospace!important;font-size:13px!important;
    }
    .stTextInput input:focus{
      border-color:rgba(0,200,220,0.55)!important;
      box-shadow:0 0 10px rgba(0,200,220,0.07)!important;
    }
    .stTextInput label{
      font-family:'JetBrains Mono',monospace!important;font-size:10px!important;
      letter-spacing:1.5px!important;color:rgba(0,200,220,0.50)!important;
      text-transform:uppercase!important;
    }
    /* Tabs */
    .stTabs [data-baseweb="tab"]{
      font-family:'JetBrains Mono',monospace!important;font-size:10px!important;
      letter-spacing:1.5px!important;text-transform:uppercase!important;
      color:rgba(0,200,220,0.40)!important;
    }
    .stTabs [aria-selected="true"]{color:#00c8dc!important;}
    .stTabs [data-baseweb="tab-highlight"]{background:#00c8dc!important;}
    .stTabs [data-baseweb="tab-border"]{background:rgba(0,200,220,0.10)!important;}
    /* Botón */
    .stButton>button{
      background:rgba(0,200,220,0.07)!important;
      border:1px solid rgba(0,200,220,0.42)!important;
      border-radius:4px!important;
      font-family:'Orbitron',monospace!important;font-size:11px!important;
      font-weight:700!important;letter-spacing:3px!important;
      color:#00c8dc!important;text-transform:uppercase!important;
    }
    .stButton>button:hover{
      background:rgba(0,200,220,0.15)!important;
      box-shadow:0 0 18px rgba(0,200,220,0.15)!important;
      border-color:rgba(0,200,220,0.65)!important;
    }
    /* Alerts */
    .stAlert{border-radius:4px!important;font-family:'JetBrains Mono',monospace!important;font-size:12px!important;}
    </style>

    <canvas id="dn-bg"></canvas>
    <div class="dn-logo">D.A.N.N.A.</div>
    <div class="dn-sub">Adaptive Neural Network Analysis Engine</div>

    <script>
    (function(){
      var cv=document.getElementById('dn-bg');
      if(!cv)return;
      var ctx=cv.getContext('2d'),W,H,nodes=[],pulses=[],tick=0;
      function resize(){W=cv.width=window.innerWidth;H=cv.height=window.innerHeight;build();}
      function build(){
        nodes=[];var rx=W*.5,ry=H*.5,rr=Math.min(W,H)*.42;
        for(var i=0;i<40;i++){var a=(i/40)*Math.PI*2,j=(Math.random()-.5)*20;nodes.push({x:rx+(rr+j)*Math.cos(a),y:ry+(rr+j)*Math.sin(a),vx:(Math.random()-.5)*.12,vy:(Math.random()-.5)*.12,ba:a,ring:true,ly:0,ph:Math.random()*Math.PI*2,r:1.4+Math.random()*.8});}
        for(var i=0;i<20;i++){var a=(i/20)*Math.PI*2,d=rr*.55;nodes.push({x:rx+d*Math.cos(a),y:ry+d*Math.sin(a),vx:(Math.random()-.5)*.18,vy:(Math.random()-.5)*.18,ba:a,ring:true,ly:1,ph:Math.random()*Math.PI*2,r:.9+Math.random()*.6});}
        for(var i=0;i<80;i++)nodes.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.35,vy:(Math.random()-.5)*.35,ring:false,ph:Math.random()*Math.PI*2,r:.5+Math.random()*.9});
      }
      resize();window.addEventListener('resize',resize);
      function sp(){
        if(pulses.length>22)return;
        var a=Math.floor(Math.random()*nodes.length),b,t=0;
        do{b=Math.floor(Math.random()*nodes.length);t++;}while(b===a&&t<10);
        var dx=nodes[a].x-nodes[b].x,dy=nodes[a].y-nodes[b].y;
        if(Math.sqrt(dx*dx+dy*dy)>200)return;
        pulses.push({a:a,b:b,t:0,spd:.007+Math.random()*.013});
      }
      setInterval(sp,180);
      function draw(){
        tick++;ctx.clearRect(0,0,W,H);
        var rx=W*.5,ry=H*.5,rr=Math.min(W,H)*.42;
        [[rr,.038],[rr*.55,.03],[rr*.22,.025]].forEach(function(v){ctx.strokeStyle='rgba(0,160,200,'+v[1]+')';ctx.lineWidth=.6;ctx.beginPath();ctx.arc(rx,ry,v[0],0,Math.PI*2);ctx.stroke();});
        for(var i=0;i<36;i++){var a=(i/36)*Math.PI*2;ctx.strokeStyle='rgba(0,140,180,0.02)';ctx.lineWidth=.4;ctx.beginPath();ctx.moveTo(rx,ry);ctx.lineTo(rx+rr*Math.cos(a),ry+rr*Math.sin(a));ctx.stroke();}
        for(var i=0;i<nodes.length;i++){
          var n=nodes[i];
          if(n.ring){n.ba+=(n.ly===0?1:-1)*.00028;var tR=n.ly===0?rr:rr*.55,tx=rx+tR*Math.cos(n.ba),ty=ry+tR*Math.sin(n.ba);n.x+=(tx-n.x)*.006;n.y+=(ty-n.y)*.006;n.x+=n.vx*.25;n.y+=n.vy*.25;}
          else{n.x+=n.vx;n.y+=n.vy;if(n.x<0||n.x>W)n.vx*=-1;if(n.y<0||n.y>H)n.vy*=-1;}
        }
        for(var i=0;i<nodes.length;i++)for(var j=i+1;j<nodes.length;j++){
          var dx=nodes[i].x-nodes[j].x,dy=nodes[i].y-nodes[j].y,d=Math.sqrt(dx*dx+dy*dy);
          if(d<110){ctx.strokeStyle='rgba(190,215,245,'+((1-d/110)*.17)+')';ctx.lineWidth=.35;ctx.beginPath();ctx.moveTo(nodes[i].x,nodes[i].y);ctx.lineTo(nodes[j].x,nodes[j].y);ctx.stroke();}
        }
        for(var i=pulses.length-1;i>=0;i--){
          var p=pulses[i];p.t+=p.spd;if(p.t>=1){pulses.splice(i,1);continue;}
          var na=nodes[p.a],nb=nodes[p.b],px=na.x+(nb.x-na.x)*p.t,py=na.y+(nb.y-na.y)*p.t;
          var g=ctx.createRadialGradient(px,py,0,px,py,3);g.addColorStop(0,'rgba(0,190,255,0.9)');g.addColorStop(1,'rgba(0,190,255,0)');
          ctx.fillStyle=g;ctx.beginPath();ctx.arc(px,py,3,0,Math.PI*2);ctx.fill();
          var tx2=na.x+(nb.x-na.x)*Math.max(0,p.t-.15),ty2=na.y+(nb.y-na.y)*Math.max(0,p.t-.15);
          var lg=ctx.createLinearGradient(tx2,ty2,px,py);lg.addColorStop(0,'rgba(0,190,255,0)');lg.addColorStop(1,'rgba(0,190,255,0.25)');
          ctx.strokeStyle=lg;ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(tx2,ty2);ctx.lineTo(px,py);ctx.stroke();
        }
        for(var i=0;i<nodes.length;i++){
          var n=nodes[i],pulse=.5+.5*Math.sin(tick*.025+n.ph),al=n.ring?.5+pulse*.4:.18+pulse*.18;
          ctx.beginPath();ctx.arc(n.x,n.y,n.r*(n.ring?1.5:1),0,Math.PI*2);
          ctx.fillStyle=n.ring?'rgba(0,210,230,'+al+')':'rgba(40,130,220,'+al+')';ctx.fill();
          if(n.ring&&n.ly===0){ctx.beginPath();ctx.arc(n.x,n.y,n.r*2.8,0,Math.PI*2);ctx.strokeStyle='rgba(0,210,230,'+(al*.22)+')';ctx.lineWidth=.5;ctx.stroke();}
        }
        requestAnimationFrame(draw);
      }
      draw();

      // Rotating messages
      var msgs=['Analizando patrones...','Calibrando vectores...','Red adaptativa activa...','Procesando secuencias...','Optimizando pesos...','Motor neuronal en linea...','Detectando señales...'];
      var mi=0;
      function updateMsg(){
        var rm=document.getElementById('dn-rmsg');
        if(!rm)return;
        rm.classList.add('fade');
        setTimeout(function(){mi=(mi+1)%msgs.length;rm.textContent=msgs[mi];rm.classList.remove('fade');},400);
      }
      setInterval(updateMsg,3000);
    })();
    </script>
    """, unsafe_allow_html=True)

    # ── Formulario nativo Streamlit (funcional) ──
    tab_login, tab_register = st.tabs(["Acceder", "Registrarse"])
    with tab_login:
        username = st.text_input("Identificador", key="login_user", placeholder="usuario")
        password = st.text_input("Clave de acceso", type="password", key="login_pass", placeholder="••••••••")
        if st.button("INICIAR SESIÓN", key="btn_login", use_container_width=True):
            if username and password:
                user = verify_user(username, password)
                if user:
                    st.session_state["_auth_user"] = user
                    st.session_state["user_id"]    = user["username"]
                    st.rerun()
                else:
                    st.error("Identificador o clave incorrectos.")
            else:
                st.warning("Completa todos los campos.")

    with tab_register:
        nu  = st.text_input("Identificador",         key="reg_user",  placeholder="usuario")
        ne  = st.text_input("Contacto (Email / WA)", key="reg_email", placeholder="para activar tu acceso")
        np  = st.text_input("Clave de acceso",        key="reg_pass",  placeholder="••••••••", type="password")
        np2 = st.text_input("Confirmar clave",        key="reg_pass2", placeholder="••••••••", type="password")
        if st.button("SOLICITAR ACCESO", key="btn_register", use_container_width=True):
            if np != np2:
                st.error("Las claves no coinciden.")
            elif nu and np:
                r = create_user(nu, np, ne)
                if r.get("success"):
                    st.success("Solicitud enviada. Te contactaremos para activar tu acceso.")
                else:
                    st.error(r.get("error", "Error al crear cuenta."))
            else:
                st.warning("Completa usuario y clave.")

    st.markdown("""
    <div class="dn-status"><div class="dn-dot"></div>SISTEMA OPERATIVO · v2026.1</div>
    <div class="dn-rmsg" id="dn-rmsg">Analizando patrones...</div>
    """, unsafe_allow_html=True)




def _render_pending_screen(user):
    st.markdown("""<div style="max-width:500px;margin:80px auto;text-align:center;padding:40px;
        background:rgba(13,17,23,0.95);border-radius:20px;border:1px solid rgba(255,183,0,0.3);">
        <div style="font-size:48px;">&#9203;</div>
        <div style="font-size:24px;font-weight:700;color:#FFB800;margin:12px 0;">Cuenta en Revision</div>
        <div style="font-size:15px;color:rgba(255,255,255,0.7);line-height:1.6;">
            Tu cuenta esta siendo revisada.<br>Te contactaremos para activar tu acceso.
        </div></div>""", unsafe_allow_html=True)
    if st.button("Cerrar Sesion", key="btn_logout_pending"):
        logout(); st.rerun()


def _render_suspended_screen():
    st.markdown("""<div style="max-width:500px;margin:80px auto;text-align:center;padding:40px;
        background:rgba(13,17,23,0.95);border-radius:20px;border:1px solid rgba(255,0,0,0.3);">
        <div style="font-size:48px;">&#128683;</div>
        <div style="font-size:24px;font-weight:700;color:#FF4444;margin:12px 0;">Cuenta Suspendida</div>
        <div style="font-size:15px;color:rgba(255,255,255,0.7);">Contacta al administrador.</div>
        </div>""", unsafe_allow_html=True)
    if st.button("Cerrar Sesion", key="btn_logout_suspended"):
        logout(); st.rerun()


def _render_expired_screen(user):
    si  = get_spins_remaining(user)
    msg = "Has agotado tus 30 Spins de Trial." if (si.get("is_trial") and si.get("remaining_total",0)<=0) else "Tu plan ha expirado."
    st.markdown(f"""<div style="max-width:500px;margin:80px auto;text-align:center;padding:40px;
        background:rgba(13,17,23,0.95);border-radius:20px;border:1px solid rgba(124,58,237,0.3);">
        <div style="font-size:48px;">&#9200;</div>
        <div style="font-size:24px;font-weight:700;color:#7C3AED;margin:12px 0;">{msg}</div>
        <div style="font-size:15px;color:rgba(255,255,255,0.7);margin-bottom:20px;">Renueva tu plan para seguir operando.</div>
        <div style="text-align:left;padding:16px;background:rgba(255,255,255,0.05);border-radius:12px;">
            <div style="font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:8px;">PLANES:</div>
            <div style="font-size:14px;color:rgba(255,255,255,0.8);line-height:2;">
                Daily Pass — $10 USD (24h)<br>Weekly Pro — $25 USD (7 dias)<br>Monthly Pro — $75 USD (30 dias)
            </div></div>
        <div style="margin-top:16px;font-size:13px;color:rgba(255,255,255,0.5);">Contacta al administrador para renovar.</div>
        </div>""", unsafe_allow_html=True)
    if st.button("Cerrar Sesion", key="btn_logout_expired"):
        logout(); st.rerun()


# ── Admin Panel completo ───────────────────────────────────────────────────────

def render_admin_panel():
    admin_user = st.session_state.get("_auth_user", {})
    if not isinstance(admin_user, dict) or admin_user.get("plan") != "admin":
        return

    with st.expander("🔴 ADMIN PANEL", expanded=False):

        all_users = admin_list_users()
        total     = len(all_users)
        n_pending  = sum(1 for u in all_users if u.get("status") == STATUS_PENDING)
        n_active   = sum(1 for u in all_users if u.get("status") == STATUS_ACTIVE)
        n_suspended= sum(1 for u in all_users if u.get("status") == STATUS_SUSPENDED)

        k1,k2,k3,k4 = st.columns(4)
        k1.metric("Total", total)
        k2.metric("Activos", n_active)
        k3.metric("Pendientes", n_pending)
        k4.metric("Suspendidos", n_suspended)

        st.markdown("---")

        tab_pend, tab_all, tab_create = st.tabs([
            f"⏳ Pendientes ({n_pending})",
            f"👥 Todos ({total})",
            "➕ Crear Usuario",
        ])

        # ── Pendientes ────────────────────────────────────────────────────────
        with tab_pend:
            pend_list = [u for u in all_users if u.get("status") == STATUS_PENDING]
            if not pend_list:
                st.info("No hay usuarios pendientes.")
            for u in pend_list:
                uname = u["username"]
                st.markdown(f"**{uname}** · {u.get('email','—')} · {u.get('created_at','')[:10]}")
                c1,c2,c3,c4 = st.columns([2,1,1,1])
                with c1:
                    plan_sel = st.selectbox("Plan", list(PLANS.keys()), key=f"pp_{uname}")
                with c2:
                    days_sel = st.number_input("Días", min_value=1,
                        value=int(PLANS[plan_sel]["duration_days"]), key=f"pd_{uname}")
                with c3:
                    if st.button("✅ Aprobar", key=f"pa_{uname}", use_container_width=True):
                        admin_approve_user(uname, plan_sel, admin_user.get("username","admin"), int(days_sel))
                        st.success(f"{uname} aprobado."); st.rerun()
                with c4:
                    if st.button("🗑️ Eliminar", key=f"pe_{uname}", use_container_width=True):
                        admin_delete_user(uname)
                        st.warning(f"{uname} eliminado."); st.rerun()
                st.markdown("---")

        # ── Todos ─────────────────────────────────────────────────────────────
        with tab_all:
            filt = st.radio("Estado", ["Todos","Activos","Pendientes","Suspendidos"],
                            horizontal=True, key="adm_filt")
            fmap = {"Todos":None,"Activos":STATUS_ACTIVE,"Pendientes":STATUS_PENDING,"Suspendidos":STATUS_SUSPENDED}
            filtered = all_users if not fmap[filt] else [u for u in all_users if u.get("status")==fmap[filt]]

            if not filtered:
                st.info("No hay usuarios en esta categoría.")

            for u in filtered:
                uname  = u["username"]
                status = u.get("status","?")
                plan   = u.get("plan","trial")
                spins  = int(u.get("spins_used_total",0))
                exp    = u.get("plan_expires","")[:10] if u.get("plan_expires") else "—"
                notes  = u.get("notes","") or ""
                icon   = {"active":"🟢","pending":"🟡","suspended":"🔴"}.get(status,"⚪")
                pname  = PLANS.get(plan,{}).get("name",plan)

                with st.expander(f"{icon} {uname}  ·  {pname}  ·  {spins} spins  ·  exp: {exp}"):
                    st.caption(f"Email: {u.get('email','—')}  |  Último login: {u.get('last_login','')[:10] or '—'}  |  Registro: {u.get('created_at','')[:10]}")

                    # Cambiar plan
                    st.markdown("**Plan / expiración**")
                    p1,p2,p3 = st.columns([2,1,1])
                    with p1:
                        np = st.selectbox("Plan", list(PLANS.keys()),
                            index=list(PLANS.keys()).index(plan) if plan in PLANS else 0,
                            key=f"ap_{uname}")
                    with p2:
                        nd = st.number_input("Días", min_value=1,
                            value=int(PLANS.get(np,PLANS["trial"])["duration_days"]),
                            key=f"ad_{uname}")
                    with p3:
                        st.markdown("<br>", unsafe_allow_html=True)
                        if st.button("Aplicar", key=f"aap_{uname}", use_container_width=True):
                            admin_approve_user(uname, np, admin_user.get("username","admin"), int(nd))
                            st.success("Plan actualizado."); st.rerun()

                    # Acciones rápidas
                    st.markdown("**Acciones**")
                    a1,a2,a3,a4,a5 = st.columns(5)
                    with a1:
                        if status != STATUS_ACTIVE:
                            if st.button("✅ Reactivar", key=f"ar_{uname}", use_container_width=True):
                                admin_reactivate_user(uname); st.success("Reactivado."); st.rerun()
                    with a2:
                        if status == STATUS_ACTIVE and plan != "admin":
                            if st.button("⏸ Suspender", key=f"as_{uname}", use_container_width=True):
                                admin_suspend_user(uname); st.warning("Suspendido."); st.rerun()
                    with a3:
                        if st.button("🔄 Reset spins", key=f"ars_{uname}", use_container_width=True):
                            admin_reset_spins(uname); st.success("Spins reseteados."); st.rerun()
                    with a4:
                        if plan != "admin":
                            if st.button("🗑️ Eliminar", key=f"ade_{uname}", use_container_width=True):
                                st.session_state[f"_cdel_{uname}"] = True
                    with a5:
                        if st.button("🔑 Clave", key=f"apw_{uname}", use_container_width=True):
                            st.session_state[f"_spw_{uname}"] = True

                    # Confirmar eliminación
                    if st.session_state.get(f"_cdel_{uname}"):
                        st.error(f"¿Eliminar permanentemente a **{uname}**?")
                        cd1,cd2 = st.columns(2)
                        with cd1:
                            if st.button("Sí, eliminar", key=f"adc_{uname}", use_container_width=True):
                                admin_delete_user(uname)
                                st.session_state.pop(f"_cdel_{uname}",None)
                                st.warning(f"{uname} eliminado."); st.rerun()
                        with cd2:
                            if st.button("Cancelar", key=f"adcc_{uname}", use_container_width=True):
                                st.session_state.pop(f"_cdel_{uname}",None); st.rerun()

                    # Cambiar contraseña
                    if st.session_state.get(f"_spw_{uname}"):
                        npw = st.text_input("Nueva contraseña", type="password", key=f"npw_{uname}")
                        if st.button("Guardar contraseña", key=f"spw_{uname}"):
                            if npw and len(npw) >= 6:
                                admin_change_password(uname, npw)
                                st.session_state.pop(f"_spw_{uname}",None)
                                st.success("Contraseña actualizada."); st.rerun()
                            else:
                                st.error("Mínimo 6 caracteres.")

                    # Notas
                    st.markdown("**Notas internas**")
                    nn = st.text_area("Notas", value=notes, key=f"an_{uname}", height=60)
                    if st.button("Guardar notas", key=f"asn_{uname}"):
                        admin_update_notes(uname, nn); st.success("Notas guardadas."); st.rerun()

        # ── Crear usuario ─────────────────────────────────────────────────────
        with tab_create:
            st.markdown("**Crear usuario manualmente**")
            cr1,cr2 = st.columns(2)
            with cr1:
                cru  = st.text_input("Usuario",    key="cr_user")
                cre  = st.text_input("Email / WA", key="cr_email")
                crpl = st.selectbox("Plan", list(PLANS.keys()), key="cr_plan")
            with cr2:
                crp  = st.text_input("Contraseña", type="password", key="cr_pass")
                crp2 = st.text_input("Confirmar",  type="password", key="cr_pass2")
                crd  = st.number_input("Días de acceso", min_value=1,
                       value=int(PLANS.get(crpl, PLANS["trial"])["duration_days"]), key="cr_days")
                crst = st.selectbox("Estado inicial", [STATUS_ACTIVE, STATUS_PENDING], key="cr_status")

            if st.button("Crear usuario", key="cr_submit", type="primary", use_container_width=True):
                if crp != crp2:
                    st.error("Las contraseñas no coinciden.")
                elif cru and crp:
                    r = create_user(cru, crp, cre, crpl, crst)
                    if r.get("success"):
                        if crst == STATUS_ACTIVE:
                            admin_approve_user(cru, crpl, admin_user.get("username","admin"), int(crd))
                        st.success(f"Usuario **{cru}** creado."); st.rerun()
                    else:
                        st.error(r.get("error","Error al crear."))
                else:
                    st.warning("Completa usuario y contraseña.")


def logout():
    st.session_state["_auth_user"]    = None
    st.session_state["_auth_expired"] = False
