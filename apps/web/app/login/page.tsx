"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { authApi, getToken, setToken } from "@/lib/auth-api"

type Lang = "zh" | "en"

const I18N = {
  zh: {
    brandSub: "企业级数据智能核心平台",
    heroTitle: "从数据接入到智能决策\n一套底座贯通企业数据资产",
    heroDesc:
      "以语义本体为核心，串联指标分析与数据治理，构建可信、可用、可复用的企业数据智能底座。",
    capLabel: "平台核心能力",
    caps: ["数据接入", "数据管道", "语义本体", "数据治理", "数据分析", "智能应用"],
    formTitle: "欢迎回来",
    formSub: "登录以进入你的数据智能工作台",
    userLabel: "用户名",
    userPh: "请输入用户名",
    passLabel: "密码",
    passPh: "请输入密码",
    rememberLabel: "记住我",
    signIn: "登录",
    signingIn: "登录中…",
    errUserReq: "请输入用户名",
    errPassReq: "请输入密码",
    errInvalid: "用户名或密码错误，请重试",
    successMsg: "登录成功，正在进入工作台…",
    footer: "© 2026 HerosOne · 企业数据智能核心平台",
  },
  en: {
    brandSub: "Enterprise Data Intelligence Core Platform",
    heroTitle: "From data ingestion to intelligent decisions\none foundation across your data assets",
    heroDesc:
      "Built around a semantic ontology, connecting metric analytics and data governance into a trusted, usable and reusable intelligence core.",
    capLabel: "Core Capabilities",
    caps: ["Data Ingestion", "Data Pipeline", "Semantic Ontology", "Data Governance", "Data Analytics", "Intelligent Apps"],
    formTitle: "Welcome back",
    formSub: "Sign in to enter your data intelligence workspace",
    userLabel: "Username",
    userPh: "Enter your username",
    passLabel: "Password",
    passPh: "Enter your password",
    rememberLabel: "Remember me",
    signIn: "Sign in",
    signingIn: "Signing in…",
    errUserReq: "Username is required",
    errPassReq: "Password is required",
    errInvalid: "Incorrect username or password. Please try again.",
    successMsg: "Signed in. Redirecting to your workspace…",
    footer: "© 2026 HerosOne · Enterprise Data Intelligence Core",
  },
} as const

const ACCENT = "#2952E3"

export default function LoginPage() {
  const router = useRouter()
  const [lang, setLang] = React.useState<Lang>("zh")
  const [username, setUsername] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [showPassword, setShowPassword] = React.useState(false)
  const [remember, setRemember] = React.useState(true)
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState("")
  const [errors, setErrors] = React.useState({ username: "", password: "" })

  const t = I18N[lang]

  // Load IBM Plex to match the design (best-effort; falls back to system fonts).
  React.useEffect(() => {
    const l = document.createElement("link")
    l.rel = "stylesheet"
    l.href =
      "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Sans+SC:wght@400;500;600;700&display=swap"
    document.head.appendChild(l)
    return () => {
      document.head.removeChild(l)
    }
  }, [])

  React.useEffect(() => {
    if (getToken()) router.replace("/")
  }, [router])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    const errs = { username: "", password: "" }
    if (!username.trim()) errs.username = t.errUserReq
    if (!password) errs.password = t.errPassReq
    if (errs.username || errs.password) {
      setErrors(errs)
      setFormError("")
      return
    }
    setSubmitting(true)
    setErrors({ username: "", password: "" })
    setFormError("")
    try {
      const token = await authApi.login(username.trim(), password)
      setToken(token)
      router.replace("/")
    } catch {
      setSubmitting(false)
      setFormError(t.errInvalid)
    }
  }

  const inputStyle = (hasErr: boolean): React.CSSProperties => ({
    width: "100%",
    height: 46,
    padding: showPassword || true ? "0 14px" : "0 14px",
    fontSize: "14.5px",
    color: "#0F1115",
    background: "#FFFFFF",
    border: `1px solid ${hasErr ? "#F04438" : "#E4E7EC"}`,
    borderRadius: 10,
    outline: "none",
  })

  const langBtn = (active: boolean): React.CSSProperties => ({
    padding: "6px 14px",
    fontSize: 13,
    fontWeight: 600,
    border: "none",
    cursor: "pointer",
    borderRadius: 7,
    background: active ? "#FFFFFF" : "transparent",
    color: active ? "#0F1115" : "#8A909C",
    boxShadow: active ? "0 1px 2px rgba(15,17,21,.08)" : "none",
  })

  return (
    <div className="ho-login" style={{ display: "flex", minHeight: "100vh", width: "100%", background: "#FFFFFF", color: "#0F1115" }}>
      <style>{CSS}</style>

      {/* LEFT: brand visual */}
      <div
        className="ho-brand"
        style={{
          position: "relative",
          flex: "1 1 50%",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px 64px",
          background: "#F5F6F8",
          backgroundImage: "radial-gradient(#E1E4EA 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          overflow: "hidden",
        }}
      >
        {/* decorative ontology node graph */}
        <svg
          viewBox="0 0 520 460"
          style={{ position: "absolute", right: -40, top: 90, width: 620, height: "auto", opacity: 0.9, pointerEvents: "none" }}
          aria-hidden="true"
        >
          <g stroke="#C7CEDB" strokeWidth="1.5" fill="none" strokeDasharray="4 8" style={{ animation: "ho-dash 2.4s linear infinite" }}>
            <line x1="120" y1="90" x2="300" y2="70" />
            <line x1="300" y1="70" x2="430" y2="160" />
            <line x1="120" y1="90" x2="180" y2="250" />
            <line x1="180" y1="250" x2="300" y2="70" />
            <line x1="180" y1="250" x2="360" y2="320" />
            <line x1="360" y1="320" x2="430" y2="160" />
            <line x1="360" y1="320" x2="240" y2="400" />
            <line x1="180" y1="250" x2="240" y2="400" />
          </g>
          <g fill={ACCENT}>
            <circle cx="300" cy="70" r="7" style={{ animation: "ho-pulse 3s ease-in-out infinite" }} />
            <circle cx="430" cy="160" r="5" style={{ animation: "ho-pulse 3s ease-in-out .4s infinite" }} />
            <circle cx="120" cy="90" r="6" style={{ animation: "ho-pulse 3s ease-in-out .8s infinite" }} />
            <circle cx="180" cy="250" r="9" fill="#0F1115" style={{ animation: "ho-pulse 3.4s ease-in-out .2s infinite" }} />
            <circle cx="360" cy="320" r="6" style={{ animation: "ho-pulse 3s ease-in-out 1.1s infinite" }} />
            <circle cx="240" cy="400" r="5" style={{ animation: "ho-pulse 3s ease-in-out 1.5s infinite" }} />
          </g>
        </svg>

        {/* brand header */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, zIndex: 2 }}>
          <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden="true">
            <rect x="1.5" y="1.5" width="31" height="31" rx="8" fill="#0F1115" />
            <circle cx="17" cy="10.5" r="2.6" fill="#fff" />
            <circle cx="10.5" cy="21" r="2.6" fill="#5B7BFF" />
            <circle cx="23.5" cy="21" r="2.6" fill="#5B7BFF" />
            <path d="M17 10.5 L10.5 21 M17 10.5 L23.5 21 M10.5 21 L23.5 21" stroke="#fff" strokeWidth="1.3" opacity="0.8" />
          </svg>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
            <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-.01em" }}>HerosOne Core</span>
            <span style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{t.brandSub}</span>
          </div>
        </div>

        {/* hero title */}
        <div style={{ position: "relative", zIndex: 2 }}>
          <div style={{ width: 44, height: 3, borderRadius: 2, background: ACCENT, marginBottom: 22 }} />
          <h1 style={{ fontSize: 28, lineHeight: 1.5, fontWeight: 700, letterSpacing: "-.01em", margin: 0, whiteSpace: "pre-line" }}>{t.heroTitle}</h1>
        </div>

        {/* subtitle + capabilities */}
        <div style={{ position: "relative", zIndex: 2 }}>
          <p style={{ fontSize: 15, lineHeight: 1.7, color: "#565D6B", margin: "0 0 24px", maxWidth: 430 }}>{t.heroDesc}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <span style={{ width: 24, height: 1, background: "#C7CEDB" }} />
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", color: "#8A909C" }}>{t.capLabel}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 10px", maxWidth: 480 }}>
            {t.caps.map((cap) => (
              <span
                key={cap}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "7px 13px",
                  background: "#FFFFFF",
                  border: "1px solid #E4E7EC",
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#3A414E",
                }}
              >
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: ACCENT }} />
                {cap}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT: form */}
      <div style={{ position: "relative", flex: "1 1 50%", minWidth: 380, display: "flex", flexDirection: "column", padding: "40px 56px", background: "#FFFFFF" }}>
        {/* language toggle */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <div style={{ display: "inline-flex", padding: 3, background: "#F2F3F5", borderRadius: 9, gap: 2 }}>
            <button type="button" className="ho-lang" onClick={() => setLang("zh")} style={langBtn(lang === "zh")}>中文</button>
            <button type="button" className="ho-lang" onClick={() => setLang("en")} style={langBtn(lang === "en")}>EN</button>
          </div>
        </div>

        {/* form body */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 388, width: "100%", margin: "0 auto" }}>
          <h2 style={{ fontSize: 27, fontWeight: 700, letterSpacing: "-.01em", margin: "0 0 8px" }}>{t.formTitle}</h2>
          <p style={{ fontSize: "14.5px", color: "#6B7280", margin: "0 0 30px", lineHeight: 1.5 }}>{t.formSub}</p>

          {formError && (
            <div className="ho-float" style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 14px", background: "#FEF3F2", border: "1px solid #FDA29B", borderRadius: 10, marginBottom: 18 }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#D92D20" strokeWidth="1.4" /><path d="M8 4.5v4M8 11h.01" stroke="#D92D20" strokeWidth="1.6" strokeLinecap="round" /></svg>
              <span style={{ fontSize: "13.5px", color: "#B42318", fontWeight: 500 }}>{formError}</span>
            </div>
          )}

          <form onSubmit={submit} noValidate>
            {/* username */}
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#3A414E", marginBottom: 7 }}>{t.userLabel}</label>
            <div style={{ position: "relative", marginBottom: 18 }}>
              <input
                className="ho-input"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setFormError(""); setErrors((s) => ({ ...s, username: "" })) }}
                placeholder={t.userPh}
                autoComplete="username"
                autoFocus
                style={inputStyle(!!errors.username)}
              />
              {errors.username && <span style={{ display: "block", fontSize: "12.5px", color: "#D92D20", marginTop: 6 }}>{errors.username}</span>}
            </div>

            {/* password */}
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#3A414E", marginBottom: 7 }}>{t.passLabel}</label>
            <div style={{ position: "relative", marginBottom: 18 }}>
              <input
                className="ho-input"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setFormError(""); setErrors((s) => ({ ...s, password: "" })) }}
                placeholder={t.passPh}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                style={{ ...inputStyle(!!errors.password), padding: "0 46px 0 14px" }}
              />
              <button
                type="button"
                className="ho-eye"
                onClick={() => setShowPassword((v) => !v)}
                aria-label="toggle password"
                style={{ position: "absolute", right: 6, top: 6, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer", color: "#8A909C", borderRadius: 7 }}
              >
                {showPassword ? (
                  <svg width="19" height="19" viewBox="0 0 20 20" fill="none"><path d="M1.5 10S4.5 4.5 10 4.5c1.5 0 2.8.4 3.9 1M18.5 10s-3 5.5-8.5 5.5c-1.5 0-2.8-.4-3.9-1M3 3l14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                ) : (
                  <svg width="19" height="19" viewBox="0 0 20 20" fill="none"><path d="M1.5 10S4.5 4.5 10 4.5 18.5 10 18.5 10 15.5 15.5 10 15.5 1.5 10 1.5 10Z" stroke="currentColor" strokeWidth="1.5" /><circle cx="10" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.5" /></svg>
                )}
              </button>
              {errors.password && <span style={{ display: "block", fontSize: "12.5px", color: "#D92D20", marginTop: 6 }}>{errors.password}</span>}
            </div>

            {/* remember row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
                <button
                  type="button"
                  onClick={() => setRemember((v) => !v)}
                  style={{
                    width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center",
                    border: `1px solid ${remember ? ACCENT : "#C7CEDB"}`, background: remember ? ACCENT : "#FFFFFF",
                    borderRadius: 5, cursor: "pointer", padding: 0, flexShrink: 0,
                  }}
                >
                  {remember && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.2l2.2 2.2 4.6-4.8" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </button>
                <span style={{ fontSize: "13.5px", color: "#3A414E" }}>{t.rememberLabel}</span>
              </label>
            </div>

            {/* submit */}
            <button
              type="submit"
              className="ho-submit"
              disabled={submitting}
              style={{
                width: "100%", height: 48, display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                fontSize: 15, fontWeight: 600, color: "#fff",
                background: submitting ? "#5B7BFF" : ACCENT, border: "none", borderRadius: 10,
                cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.9 : 1,
              }}
            >
              {submitting && <span className="ho-spin" style={{ display: "inline-block", width: 16, height: 16, border: "2px solid rgba(255,255,255,.4)", borderTopColor: "#fff", borderRadius: "50%" }} />}
              <span>{submitting ? t.signingIn : t.signIn}</span>
            </button>
          </form>
        </div>

        {/* footer */}
        <div style={{ textAlign: "center", fontSize: 12, color: "#A2A8B4", paddingTop: 20 }}>{t.footer}</div>
      </div>
    </div>
  )
}

const CSS = `
.ho-login { font-family: "IBM Plex Sans", "IBM Plex Sans SC", -apple-system, "PingFang SC", sans-serif; -webkit-font-smoothing: antialiased; }
.ho-input::placeholder { color: #A2A8B4; }
.ho-input { transition: border-color .15s, box-shadow .15s; }
.ho-input:focus { border-color: #2952E3 !important; box-shadow: 0 0 0 3px rgba(41,82,227,.12); }
.ho-eye:hover { color: #3A414E !important; background: #F2F3F5 !important; }
.ho-lang:hover { opacity: .85; }
.ho-submit:hover:not(:disabled) { background: #1E42C4 !important; }
.ho-float { animation: ho-float .25s ease; }
@keyframes ho-spin { to { transform: rotate(360deg); } }
@keyframes ho-pulse { 0%,100% { opacity: .35; } 50% { opacity: 1; } }
@keyframes ho-dash { to { stroke-dashoffset: -24; } }
@keyframes ho-float { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.ho-spin { animation: ho-spin .7s linear infinite; }
@media (max-width: 900px) { .ho-brand { display: none !important; } }
`
