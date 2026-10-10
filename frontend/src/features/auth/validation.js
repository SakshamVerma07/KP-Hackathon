export function validateAuth(mode, v) {
  const e = {};
  if (mode === "register") {
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(v.username.trim())) e.username = "Use 3–24 letters, numbers or underscores.";
    if (!/^\S+@\S+\.\S+$/.test(v.email.trim())) e.email = "Enter a valid email address.";
    if (v.display_name.trim().length > 50) e.display_name = "Keep it under 50 characters.";
    if (v.password.length < 8) e.password = "Use at least 8 characters.";
  } else {
    if (!v.identifier.trim()) e.identifier = "Enter your username or email.";
    if (!v.password) e.password = "Enter your password.";
  }
  return e;
}
