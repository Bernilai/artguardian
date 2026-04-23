// До react-router-dom (на случай транзитивных импортов): TextEncoder в jsdom.
import "../../components/ProtectedRoute/__tests__/routerJestSetup";

jest.mock("../../contexts", () => ({
  useAuth: jest.fn(),
}));

jest.mock("../../services", () => ({
  artifactsAPI: {
    fetchArtifacts: jest.fn(),
    fetchArtifactById: jest.fn(),
  },
}));

import { act, renderHook, waitFor } from "@testing-library/react";
import type { Artifact, ArtifactsResponse, PaginationInfo } from "../../types";
import { useAuth } from "../../contexts";
import { artifactsAPI } from "../../services";
import { useApi } from "../useApi";

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedFetchArtifacts = artifactsAPI.fetchArtifacts as jest.MockedFunction<
  typeof artifactsAPI.fetchArtifacts
>;
const mockedFetchArtifactById = artifactsAPI.fetchArtifactById as jest.MockedFunction<
  typeof artifactsAPI.fetchArtifactById
>;

const mockPagination: PaginationInfo = {
  currentPage: 1,
  totalPages: 1,
  totalItems: 1,
  itemsPerPage: 20,
};

const mockArtifact = { id: "a1", title: "Vase" } as Artifact;

const successResponse: ArtifactsResponse = {
  artifacts: [mockArtifact],
  pagination: mockPagination,
};

const authStub = (accessToken: string | null) =>
  ({
    accessToken,
    user: null,
    login: jest.fn(),
    logout: jest.fn(),
    refreshTokens: jest.fn(),
    isLoading: false,
    isAuthenticated: !!accessToken,
  }) as ReturnType<typeof useAuth>;

describe("useApi", () => {
  let consoleErrorSpy: jest.SpyInstance<void, [message?: unknown, ...optionalParams: unknown[]]>;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe("автозагрузка при монтировании", () => {
    it("при заданном accessToken вызывает artifactsAPI.fetchArtifacts", async () => {
      mockedUseAuth.mockReturnValue(authStub("jwt-1"));
      mockedFetchArtifacts.mockResolvedValue(successResponse);

      renderHook(() => useApi());

      await waitFor(() => {
        expect(mockedFetchArtifacts).toHaveBeenCalledWith(
          undefined,
          "jwt-1",
          expect.any(AbortSignal)
        );
      });
    });

    it("при accessToken === null не вызывает fetchArtifacts", async () => {
      mockedUseAuth.mockReturnValue(authStub(null));
      mockedFetchArtifacts.mockResolvedValue(successResponse);

      renderHook(() => useApi());

      // Даём эффекту отработать: при отсутствии токена запроса быть не должно.
      await act(async () => {
        await Promise.resolve();
      });

      expect(mockedFetchArtifacts).not.toHaveBeenCalled();
    });
  });

  describe("состояние loading", () => {
    it("loading true во время запроса и false после успешного ответа", async () => {
      mockedUseAuth.mockReturnValue(authStub("tok"));
      let resolveFetch!: (v: ArtifactsResponse) => void;
      const deferred = new Promise<ArtifactsResponse>((res) => {
        resolveFetch = res;
      });
      mockedFetchArtifacts.mockReturnValue(deferred);

      const { result } = renderHook(() => useApi());

      expect(result.current.loading).toBe(true);

      await act(async () => {
        resolveFetch(successResponse);
        await deferred;
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it("loading становится false и после ошибки fetch", async () => {
      mockedUseAuth.mockReturnValue(authStub("tok"));
      mockedFetchArtifacts.mockRejectedValue(new Error("network down"));

      const { result } = renderHook(() => useApi());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });
  });

  describe("успешный fetch", () => {
    it("заполняет artifacts и оставляет error равным null", async () => {
      mockedUseAuth.mockReturnValue(authStub("tok"));
      mockedFetchArtifacts.mockResolvedValue(successResponse);

      const { result } = renderHook(() => useApi());

      await waitFor(() => {
        expect(result.current.artifacts).toEqual([mockArtifact]);
      });
      expect(result.current.error).toBeNull();
    });
  });

  describe("ошибка fetch", () => {
    it("artifacts остаётся [] и error — строка сообщения", async () => {
      mockedUseAuth.mockReturnValue(authStub("tok"));
      mockedFetchArtifacts.mockRejectedValue(new Error("boom"));

      const { result } = renderHook(() => useApi());

      await waitFor(() => {
        expect(result.current.error).toBe("boom");
      });
      expect(result.current.artifacts).toEqual([]);
    });
  });

  describe("refetch", () => {
    it("refetch() без аргумента передаёт undefined, токен и AbortSignal", async () => {
      const token = "pass-through";
      mockedUseAuth.mockReturnValue(authStub(token));
      mockedFetchArtifacts.mockResolvedValue(successResponse);

      const { result } = renderHook(() => useApi());

      await waitFor(() => expect(result.current.loading).toBe(false));
      mockedFetchArtifacts.mockClear();

      await act(async () => {
        await result.current.refetch();
      });

      expect(mockedFetchArtifacts).toHaveBeenCalledTimes(1);
      expect(mockedFetchArtifacts).toHaveBeenCalledWith(undefined, token, expect.any(AbortSignal));
    });

    it("refetch с поиском: API принимает объект параметров, не строку", async () => {
      const token = "t2";
      mockedUseAuth.mockReturnValue(authStub(token));
      mockedFetchArtifacts.mockResolvedValue(successResponse);

      const { result } = renderHook(() => useApi());

      await waitFor(() => expect(result.current.loading).toBe(false));
      mockedFetchArtifacts.mockClear();

      await act(async () => {
        // Вместо refetch('vase'): контракт — объект с полем q (как в artifactsAPI).
        await result.current.refetch({ q: "vase" });
      });

      expect(mockedFetchArtifacts).toHaveBeenCalledWith(
        { q: "vase" },
        token,
        expect.any(AbortSignal)
      );
    });
  });

  describe("fetchArtifactById", () => {
    it("вызывает artifactsAPI.fetchArtifactById(id, token) и возвращает артефакт", async () => {
      mockedUseAuth.mockReturnValue(authStub("tid"));
      mockedFetchArtifacts.mockResolvedValue(successResponse);
      mockedFetchArtifactById.mockResolvedValue(mockArtifact);

      const { result } = renderHook(() => useApi());

      await waitFor(() => expect(result.current.loading).toBe(false));

      let out: Artifact | null = null;
      await act(async () => {
        out = await result.current.fetchArtifactById("a1");
      });

      expect(mockedFetchArtifactById).toHaveBeenCalledWith("a1", "tid");
      expect(out).toEqual(mockArtifact);
    });

    it("при ошибке возвращает null и не пробрасывает исключение", async () => {
      mockedUseAuth.mockReturnValue(authStub("tid"));
      mockedFetchArtifacts.mockResolvedValue(successResponse);
      mockedFetchArtifactById.mockRejectedValue(new Error("missing"));

      const { result } = renderHook(() => useApi());

      await waitFor(() => expect(result.current.loading).toBe(false));

      let out: Artifact | null = null;
      await act(async () => {
        out = await result.current.fetchArtifactById("x");
      });

      expect(out).toBeNull();
    });
  });
});
