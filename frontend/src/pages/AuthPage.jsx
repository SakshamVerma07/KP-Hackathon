import { useState } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../features/auth/AuthProvider.jsx";
import { validateAuth } from "../features/auth/validation.js";
import { BRAND } from "../lib/brand.js";

const EMPTY = { identifier: "", username: "", display_name: "", email: "", password: "" };

function Field({ id, label, error, hint, children }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? <p className="field-error" id={`${id}-err`} role="alert">{error}</p> : hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

export default function AuthPage({ mode }) {
  const { login, register } = useAuth();
  const [v, setV] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const isRegister = mode === "register";
  const set = (k) => (e) => setV((p) => ({ ...p, [k]: e.target.value }));
  const aria = (k) => ({ "aria-invalid": !!errors[k], "aria-describedby": errors[k] ? `${k}-err` : undefined });

  async function submit(e) {
    e.preventDefault();
    const found = validateAuth(mode, v);
    setErrors(found);
    setFormError("");
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      if (isRegister) await register({ username: v.username.trim(), display_name: v.display_name.trim(), email: v.email.trim(), password: v.password });
      else await login(v.identifier.trim(), v.password);
    } catch (err) {
      setErrors(err.fields || {});
      setFormError(err.message);
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <section className="auth-card" aria-labelledby="auth-title">
        <p className="wordmark">{BRAND.name}</p>
        <h1 id="auth-title">{isRegister ? "Create your account" : "Welcome back"}</h1>
        <p className="muted">{isRegister ? "Pick a username so people on campus can find you." : "Sign in to pick up your conversations."}</p>
        <form onSubmit={submit} noValidate>
          {formError && <p className="form-error" role="alert">{formError}</p>}
          {isRegister ? (
            <>
              <Field id="username" label="Username" error={errors.username} hint="Letters, numbers and underscores.">
                <input id="username" autoComplete="username" value={v.username} onChange={set("username")} {...aria("username")} />
              </Field>
              <Field id="display_name" label="Display name (optional)" error={errors.display_name}>
                <input id="display_name" autoComplete="name" value={v.display_name} onChange={set("display_name")} {...aria("display_name")} />
              </Field>
              <Field id="email" label="Email" error={errors.email}>
                <input id="email" type="email" autoComplete="email" value={v.email} onChange={set("email")} {...aria("email")} />
              </Field>
            </>
          ) : (
            <Field id="identifier" label="Username or email" error={errors.identifier}>
              <input id="identifier" autoComplete="username" value={v.identifier} onChange={set("identifier")} {...aria("identifier")} />
            </Field>
          )}
          <Field id="password" label="Password" error={errors.password} hint={isRegister ? "At least 8 characters." : undefined}>
            <div className="input-wrap">
              <input id="password" type={show ? "text" : "password"} autoComplete={isRegister ? "new-password" : "current-password"} value={v.password} onChange={set("password")} {...aria("password")} />
              <button type="button" className="icon-btn" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}>
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </Field>
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
          </button>
        </form>
        <p className="auth-switch">
          {isRegister ? <>Already have an account? <Link to="/login">Sign in</Link></> : <>New here? <Link to="/register">Create an account</Link></>}
        </p>
      </section>
    </main>
  );
}
