import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./features/auth/AuthProvider.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import ChatView from "./pages/ChatView.jsx";
import EmptyChat from "./pages/EmptyChat.jsx";
import Shell from "./components/Shell.jsx";
import { ChatProvider } from "./features/conversations/ChatProvider.jsx";

function Gate({ children, anonOnly = false }) {
  const { status, error, restore } = useAuth();
  if (status === "loading") return <div className="center-screen" role="status">Loading…</div>;
  if (status === "error")
    return (
      <div className="center-screen">
        <p>{error}</p>
        <button className="btn" onClick={restore}>Try again</button>
      </div>
    );
  if (anonOnly) return status === "authed" ? <Navigate to="/" replace /> : children;
  return status === "authed" ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Gate anonOnly><AuthPage mode="login" /></Gate>} />
      <Route path="/register" element={<Gate anonOnly><AuthPage mode="register" /></Gate>} />
      <Route path="/" element={<Gate><ChatProviderShell /></Gate>}>
        <Route index element={<EmptyChat />} />
        <Route path="c/:id" element={<ChatView />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function ChatProviderShell() {
  return (
    <ChatProvider>
      <Shell />
    </ChatProvider>
  );
}
