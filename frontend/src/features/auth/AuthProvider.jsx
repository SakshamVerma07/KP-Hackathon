import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, setCsrf, setUnauthorizedHandler } from "../../lib/api";
import { disconnectSocket } from "../../lib/socket";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: "loading", user: null, error: null });

  const accept = useCallback((d) => {
    setCsrf(d.csrf_token);
    setState({ status: "authed", user: d.user, error: null });
  }, []);

  const restore = useCallback(() => {
    setState((s) => ({ ...s, status: "loading", error: null }));
    api.get("/auth/me").then(accept).catch((e) => {
      setState({ status: e.status === 0 ? "error" : "anon", user: null, error: e.status === 0 ? e.message : null });
    });
  }, [accept]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setCsrf(null);
      disconnectSocket();
      setState({ status: "anon", user: null, error: null });
    });
    restore();
  }, [restore]);

  const value = useMemo(() => ({
    ...state,
    restore,
    login: async (identifier, password) => accept(await api.post("/auth/login", { identifier, password })),
    register: async (v) => accept(await api.post("/auth/register", v)),
    logout: async () => {
      try { await api.post("/auth/logout"); } catch { /* session may already be gone */ }
      setCsrf(null);
      disconnectSocket();
      setState({ status: "anon", user: null, error: null });
    },
  }), [state, accept, restore]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
