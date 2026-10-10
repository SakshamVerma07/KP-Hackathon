import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthPage from "../pages/AuthPage.jsx";

const login = vi.fn();
const register = vi.fn();
vi.mock("../features/auth/AuthProvider.jsx", () => ({ useAuth: () => ({ login, register }) }));

const setup = (mode) => render(<MemoryRouter><AuthPage mode={mode} /></MemoryRouter>);

describe("AuthPage", () => {
  beforeEach(() => { login.mockReset(); register.mockReset(); });

  it("validates login fields before calling the API", async () => {
    setup("login");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByText("Enter your username or email.")).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it("validates registration fields", async () => {
    setup("register");
    await userEvent.type(screen.getByLabelText("Username"), "a!");
    await userEvent.type(screen.getByLabelText("Email"), "nope");
    await userEvent.type(screen.getByLabelText("Password"), "short");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByText(/3–24 letters/)).toBeInTheDocument();
    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText("Use at least 8 characters.")).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it("shows the server error and toggles password visibility", async () => {
    login.mockRejectedValue(Object.assign(new Error("Incorrect username/email or password."), { fields: {} }));
    setup("login");
    await userEvent.type(screen.getByLabelText("Username or email"), "alice");
    await userEvent.type(screen.getByLabelText("Password"), "whatever1");
    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect username/email or password.");
  });
});
