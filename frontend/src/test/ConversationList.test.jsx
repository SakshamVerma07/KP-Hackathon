import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ConversationList from "../components/ConversationList.jsx";

let chatState;
vi.mock("../features/conversations/ChatProvider.jsx", () => ({ useChat: () => ({ state: chatState, loadConversations: vi.fn(), openDirect: vi.fn() }) }));
vi.mock("../features/auth/AuthProvider.jsx", () => ({ useAuth: () => ({ logout: vi.fn() }) }));

const renderList = () => render(<MemoryRouter><ConversationList /></MemoryRouter>);
const base = { loaded: true, error: null, conversations: [] };

describe("ConversationList states", () => {
  it("shows loading", () => { chatState = { ...base, loaded: false }; renderList(); expect(screen.getByRole("status", { name: /loading/i })).toBeInTheDocument(); });
  it("shows empty state", () => { chatState = base; renderList(); expect(screen.getByText("No conversations yet")).toBeInTheDocument(); });
  it("shows error with retry", () => { chatState = { ...base, error: "Can't reach the server." }; renderList(); expect(screen.getByRole("alert")).toHaveTextContent("Can't reach the server."); expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument(); });
  it("renders conversations with preview and unread count", () => {
    chatState = { ...base, conversations: [{ id: 1, unread_count: 3, updated_at: "2026-01-01T00:00:00Z", participant: { id: 2, username: "bob", display_name: "Bob", online: true }, last_message: { id: 5, body: "see you at 6", created_at: "2026-01-01T10:00:00Z", sender_id: 2 } }] };
    renderList();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("see you at 6")).toBeInTheDocument();
    expect(screen.getByLabelText("3 unread")).toBeInTheDocument();
  });
});
