import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "../AuthContext";
import { authAPI, setRefreshCallback } from "../../services/authAPI";
import type { AuthResponse, User } from "../../types";

// Jest разрешает путь относительно теста (из __tests__ нужен ../../, не ../ как в AuthContext).
jest.mock("../../services/authAPI", () => ({
  authAPI: {
    refresh: jest.fn(),
    login: jest.fn(),
    logout: jest.fn(),
    getCurrentUser: jest.fn(),
  },
  setRefreshCallback: jest.fn(),
}));

const mockedAuthAPI = authAPI as jest.Mocked<typeof authAPI>;
const mockedSetRefreshCallback = setRefreshCallback as jest.MockedFunction<
  typeof setRefreshCallback
>;

const mockUser: User = {
  id: "u1",
  email: "a@b.c",
  role: "user",
  name: "Test User",
};

const authResponse = (access_token: string, user: User = mockUser): AuthResponse => ({
  access_token,
  refresh_token: "rt",
  token_type: "bearer",
  user,
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

describe("AuthProvider / useAuth", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("initializeAuth", () => {
    it("on mount calls authAPI.refresh to restore session", async () => {
      mockedAuthAPI.refresh.mockResolvedValue(authResponse("tok"));
      mockedAuthAPI.getCurrentUser.mockResolvedValue(mockUser);

      renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(mockedAuthAPI.refresh).toHaveBeenCalledTimes(1);
      });
    });

    it("when refresh succeeds loads user and token; isAuthenticated becomes true", async () => {
      mockedAuthAPI.refresh.mockResolvedValue(authResponse("access-1"));
      mockedAuthAPI.getCurrentUser.mockResolvedValue(mockUser);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockedAuthAPI.getCurrentUser).toHaveBeenCalledWith("access-1");
      expect(result.current.user).toEqual(mockUser);
      expect(result.current.accessToken).toBe("access-1");
      expect(result.current.isAuthenticated).toBe(true);
    });

    it("when refresh fails: not authenticated, not loading, no error escapes the hook", async () => {
      mockedAuthAPI.refresh.mockRejectedValue(new Error("no session"));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
      expect(result.current.accessToken).toBeNull();
      expect(mockedAuthAPI.getCurrentUser).not.toHaveBeenCalled();
    });

    it("while refresh is in flight isLoading stays true", async () => {
      let resolveRefresh!: (value: AuthResponse) => void;
      const refreshPending = new Promise<AuthResponse>((resolve) => {
        resolveRefresh = resolve;
      });
      mockedAuthAPI.refresh.mockReturnValue(refreshPending);
      mockedAuthAPI.getCurrentUser.mockResolvedValue(mockUser);

      const { result } = renderHook(() => useAuth(), { wrapper });

      // До завершения refresh хук должен оставаться в состоянии загрузки
      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolveRefresh(authResponse("late-token"));
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  describe("login", () => {
    it("calls authAPI.login with email and password", async () => {
      mockedAuthAPI.refresh.mockResolvedValue(authResponse("init"));
      mockedAuthAPI.getCurrentUser.mockResolvedValue(mockUser);
      mockedAuthAPI.login.mockResolvedValue(authResponse("login-tok"));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.login("x@y.z", "secret");
      });

      expect(mockedAuthAPI.login).toHaveBeenCalledWith({
        email: "x@y.z",
        password: "secret",
      });
    });

    it("on success sets user, accessToken and isAuthenticated", async () => {
      mockedAuthAPI.refresh.mockResolvedValue(authResponse("init"));
      mockedAuthAPI.getCurrentUser.mockResolvedValue(mockUser);
      const loginUser: User = { ...mockUser, id: "u2", email: "logged@in" };
      mockedAuthAPI.login.mockResolvedValue(authResponse("login-tok", loginUser));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.login("logged@in", "pw");
      });

      expect(result.current.accessToken).toBe("login-tok");
      expect(result.current.user).toEqual(loginUser);
      expect(result.current.isAuthenticated).toBe(true);
    });

    it("on failure rethrows and user stays null", async () => {
      mockedAuthAPI.refresh.mockRejectedValue(new Error("Refresh token missing"));
      mockedAuthAPI.login.mockRejectedValue(new Error("bad creds"));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.user).toBeNull();

      await act(async () => {
        await expect(result.current.login("a@b.c", "wrong")).rejects.toThrow("bad creds");
      });

      expect(result.current.user).toBeNull();
    });
  });

  describe("logout", () => {
    it("calls authAPI.logout and clears session", async () => {
      mockedAuthAPI.refresh.mockResolvedValue(authResponse("tok"));
      mockedAuthAPI.getCurrentUser.mockResolvedValue(mockUser);
      mockedAuthAPI.logout.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

      await act(async () => {
        await result.current.logout();
      });

      expect(mockedAuthAPI.logout).toHaveBeenCalled();
      expect(result.current.user).toBeNull();
      expect(result.current.accessToken).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });

    it("if authAPI.logout throws, state is still cleared in finally", async () => {
      mockedAuthAPI.refresh.mockResolvedValue(authResponse("tok"));
      mockedAuthAPI.getCurrentUser.mockResolvedValue(mockUser);
      mockedAuthAPI.logout.mockRejectedValue(new Error("network"));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

      await act(async () => {
        await result.current.logout();
      });

      expect(result.current.user).toBeNull();
      expect(result.current.accessToken).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  // refreshPromiseRef: второй вызов ждёт тот же Promise, не создавая новый refresh.
  describe("refreshTokens deduplication", () => {
    it("concurrent refreshTokens calls authAPI.refresh once; both get the same token", async () => {
      mockedAuthAPI.refresh.mockResolvedValueOnce(authResponse("init"));
      mockedAuthAPI.getCurrentUser.mockResolvedValue(mockUser);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      mockedAuthAPI.refresh.mockClear();

      let resolveConcurrent!: (value: AuthResponse) => void;
      const concurrentRefresh = new Promise<AuthResponse>((resolve) => {
        resolveConcurrent = resolve;
      });
      mockedAuthAPI.refresh.mockReturnValue(concurrentRefresh);

      let first: Promise<string>;
      let second: Promise<string>;
      await act(async () => {
        first = result.current.refreshTokens();
        second = result.current.refreshTokens();
      });

      // Параллельные вызовы не должны породить второй HTTP-refresh
      expect(mockedAuthAPI.refresh).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveConcurrent(authResponse("shared-token"));
      });

      const [a, b] = await Promise.all([first!, second!]);
      expect(a).toBe("shared-token");
      expect(b).toBe("shared-token");
    });
  });

  describe("useAuth without provider", () => {
    it("throws when used outside AuthProvider", () => {
      expect(() => {
        renderHook(() => useAuth());
      }).toThrow("useAuth must be used within an AuthProvider");
    });
  });

  describe("setRefreshCallback", () => {
    it("registers refreshTokens with authAPI.setRefreshCallback after mount", async () => {
      mockedAuthAPI.refresh.mockResolvedValue(authResponse("t"));
      mockedAuthAPI.getCurrentUser.mockResolvedValue(mockUser);

      renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(mockedSetRefreshCallback).toHaveBeenCalled();
      });

      const cb = mockedSetRefreshCallback.mock.calls[0][0];
      expect(typeof cb).toBe("function");
    });
  });
});
