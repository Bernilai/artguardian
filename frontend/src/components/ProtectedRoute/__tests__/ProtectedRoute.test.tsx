import "./routerJestSetup";
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "../ProtectedRoute";
import { useAuth } from "../../../contexts";
import type { User } from "../../../types";

// jest.mock считается от этого файла. У компонента пути `../../contexts` и `../ui`, из __tests__ — на один `../` больше: `../../../contexts`, `../../ui`.
jest.mock("../../../contexts", () => ({
  useAuth: jest.fn(),
}));

jest.mock("../../ui", () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner" />,
}));

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

const baseAuth = () => ({
  user: null as User | null,
  accessToken: null as string | null,
  login: jest.fn(),
  logout: jest.fn(),
  refreshTokens: jest.fn(),
  isLoading: false,
  isAuthenticated: false,
});

function renderProtectedRoute(
  element: React.ReactElement,
  authOverrides: Partial<ReturnType<typeof baseAuth>> = {},
  initialEntries: string[] = ["/protected"]
) {
  mockedUseAuth.mockReturnValue({ ...baseAuth(), ...authOverrides });
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/protected" element={element} />
        <Route path="/login" element={<div data-testid="login-page" />} />
        <Route path="/dashboard" element={<div data-testid="dashboard-page" />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ProtectedRoute", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("пока isLoading: true — показывает LoadingSpinner и не рендерит children", () => {
    renderProtectedRoute(
      <ProtectedRoute>
        <div data-testid="protected-children">secret</div>
      </ProtectedRoute>,
      { isLoading: true }
    );

    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
    expect(screen.queryByTestId("protected-children")).not.toBeInTheDocument();
  });

  it("неаутентифицирован: редирект на /login (sentinel), children не видны", async () => {
    renderProtectedRoute(
      <ProtectedRoute>
        <div data-testid="protected-children">secret</div>
      </ProtectedRoute>,
      { isLoading: false, isAuthenticated: false }
    );

    expect(await screen.findByTestId("login-page")).toBeInTheDocument();
    expect(screen.queryByTestId("protected-children")).not.toBeInTheDocument();
  });

  it("аутентифицирован без requiredRole — рендерит children", async () => {
    const viewer: User = {
      id: "1",
      email: "v@example.com",
      role: "viewer",
      name: "Viewer",
    };
    renderProtectedRoute(
      <ProtectedRoute>
        <div data-testid="protected-children">ok</div>
      </ProtectedRoute>,
      {
        isLoading: false,
        isAuthenticated: true,
        user: viewer,
        accessToken: "tok",
      }
    );

    expect(await screen.findByTestId("protected-children")).toBeInTheDocument();
    expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument();
  });

  it("requiredRole=admin и user.role=viewer — редирект на /dashboard", async () => {
    const viewer: User = {
      id: "1",
      email: "v@example.com",
      role: "viewer",
      name: "Viewer",
    };
    renderProtectedRoute(
      <ProtectedRoute requiredRole="admin">
        <div data-testid="protected-children">secret</div>
      </ProtectedRoute>,
      {
        isLoading: false,
        isAuthenticated: true,
        user: viewer,
        accessToken: "tok",
      }
    );

    expect(await screen.findByTestId("dashboard-page")).toBeInTheDocument();
    expect(screen.queryByTestId("protected-children")).not.toBeInTheDocument();
  });

  it("requiredRole=admin и user.role=admin — рендерит children", async () => {
    const admin: User = {
      id: "2",
      email: "a@example.com",
      role: "admin",
      name: "Admin",
    };
    renderProtectedRoute(
      <ProtectedRoute requiredRole="admin">
        <div data-testid="protected-children">ok</div>
      </ProtectedRoute>,
      {
        isLoading: false,
        isAuthenticated: true,
        user: admin,
        accessToken: "tok",
      }
    );

    expect(await screen.findByTestId("protected-children")).toBeInTheDocument();
  });

  it("requiredRole=manager и user.role=admin — рендерит children (admin обходит проверку роли)", async () => {
    const admin: User = {
      id: "2",
      email: "a@example.com",
      role: "admin",
      name: "Admin",
    };
    renderProtectedRoute(
      <ProtectedRoute requiredRole="manager">
        <div data-testid="protected-children">ok</div>
      </ProtectedRoute>,
      {
        isLoading: false,
        isAuthenticated: true,
        user: admin,
        accessToken: "tok",
      }
    );

    expect(await screen.findByTestId("protected-children")).toBeInTheDocument();
  });

  it("requiredRole=manager и user.role=manager — рендерит children", async () => {
    const manager: User = {
      id: "3",
      email: "m@example.com",
      role: "manager",
      name: "Manager",
    };
    renderProtectedRoute(
      <ProtectedRoute requiredRole="manager">
        <div data-testid="protected-children">ok</div>
      </ProtectedRoute>,
      {
        isLoading: false,
        isAuthenticated: true,
        user: manager,
        accessToken: "tok",
      }
    );

    expect(await screen.findByTestId("protected-children")).toBeInTheDocument();
  });
});
