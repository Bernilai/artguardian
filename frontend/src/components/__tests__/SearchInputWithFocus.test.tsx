import React, { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SearchInputWithFocus from "../SearchInputWithFocus";

const STORAGE_KEY = "test-search-focused";

function LoadingHarness({
  storageFocusedKey,
}: {
  storageFocusedKey?: string;
}) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <div>
      <button type="button" data-testid="other-focus-target">
        другой фокус
      </button>
      <SearchInputWithFocus
        value={value}
        onChange={setValue}
        loading={loading}
        storageFocusedKey={storageFocusedKey}
        placeholder="Search tickets"
      />
      <button type="button" data-testid="start-loading" onClick={() => setLoading(true)}>
        start loading
      </button>
      <button type="button" data-testid="end-loading" onClick={() => setLoading(false)}>
        end loading
      </button>
    </div>
  );
}

describe("SearchInputWithFocus", () => {
  let getItemSpy: jest.SpyInstance<string | null, [string]>;
  let setItemSpy: jest.SpyInstance<void, [string, string]>;
  let removeItemSpy: jest.SpyInstance<void, [string]>;

  beforeEach(() => {
    // В JSDOM spy на методах экземпляра localStorage часто не становится mock — используем прототип.
    getItemSpy = jest.spyOn(Storage.prototype, "getItem");
    setItemSpy = jest.spyOn(Storage.prototype, "setItem");
    removeItemSpy = jest.spyOn(Storage.prototype, "removeItem");
  });

  afterEach(() => {
    jest.clearAllMocks();
    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
    removeItemSpy.mockRestore();
  });

  describe("базовый рендер и ввод", () => {
    it("рендерит input с переданными value и placeholder", () => {
      const onChange = jest.fn();
      render(
        <SearchInputWithFocus
          value="alpha"
          onChange={onChange}
          placeholder="Find something"
        />
      );

      const input = screen.getByRole("textbox");
      expect(input).toHaveAttribute("placeholder", "Find something");
      expect(input).toHaveValue("alpha");
    });

    it("вызывает onChange с новым значением при вводе", async () => {
      const onChange = jest.fn();
      const Controlled = () => {
        const [v, setV] = useState("");
        return (
          <SearchInputWithFocus
            value={v}
            onChange={(next) => {
              onChange(next);
              setV(next);
            }}
          />
        );
      };
      render(<Controlled />);

      const input = screen.getByRole("textbox");
      await userEvent.type(input, "ticket");

      expect(onChange).toHaveBeenCalled();
      expect(onChange).toHaveBeenLastCalledWith("ticket");
      expect(input).toHaveValue("ticket");
    });
  });

  describe("localStorage: фокус-флаг (запись)", () => {
    it("при storageFocusedKey при фокусе вызывает setItem(key, 'true')", async () => {
      render(
        <SearchInputWithFocus
          value=""
          onChange={jest.fn()}
          storageFocusedKey={STORAGE_KEY}
        />
      );

      const input = screen.getByRole("textbox");
      await userEvent.click(input);

      expect(setItemSpy).toHaveBeenCalledWith(STORAGE_KEY, "true");
    });

    it("при blur без предварительного ввода вызывает removeItem(key)", async () => {
      render(
        <div>
          <button type="button" data-testid="outside">
            снаружи
          </button>
          <SearchInputWithFocus
            value=""
            onChange={jest.fn()}
            storageFocusedKey={STORAGE_KEY}
          />
        </div>
      );

      const input = screen.getByRole("textbox");
      await userEvent.click(input);
      await userEvent.click(screen.getByTestId("outside"));

      expect(removeItemSpy).toHaveBeenCalledWith(STORAGE_KEY);
    });

    it("без storageFocusedKey не обращается к localStorage", async () => {
      render(<SearchInputWithFocus value="" onChange={jest.fn()} />);

      const input = screen.getByRole("textbox");
      await userEvent.click(input);
      await userEvent.type(input, "a");

      expect(getItemSpy).not.toHaveBeenCalled();
      expect(setItemSpy).not.toHaveBeenCalled();
      expect(removeItemSpy).not.toHaveBeenCalled();
    });
  });

  describe("localStorage: восстановление фокуса при mount", () => {
    it("если getItem(key) === 'true' — фокусирует input и затем removeItem(key)", async () => {
      getItemSpy.mockReturnValue("true");

      render(
        <SearchInputWithFocus
          value=""
          onChange={jest.fn()}
          storageFocusedKey={STORAGE_KEY}
        />
      );

      const input = screen.getByRole("textbox");
      await waitFor(() => {
        expect(document.activeElement).toBe(input);
      });

      expect(removeItemSpy).toHaveBeenCalledWith(STORAGE_KEY);
    });

    it("если getItem(key) === null — не выставляет фокус на mount", () => {
      getItemSpy.mockReturnValue(null);

      render(
        <SearchInputWithFocus
          value=""
          onChange={jest.fn()}
          storageFocusedKey={STORAGE_KEY}
        />
      );

      const input = screen.getByRole("textbox");
      expect(document.activeElement).not.toBe(input);
    });
  });

  describe("восстановление фокуса после loading", () => {
    it("после ввода и потери фокуса во время loading — снова фокусирует input", async () => {
      render(<LoadingHarness storageFocusedKey={STORAGE_KEY} />);

      const input = screen.getByRole("textbox");
      await userEvent.click(input);
      await userEvent.type(input, "q");

      // Имитация потери фокуса до/во время загрузки (как при перерисовке родителя).
      input.blur();
      expect(document.activeElement).not.toBe(input);

      await userEvent.click(screen.getByTestId("start-loading"));
      await userEvent.click(screen.getByTestId("end-loading"));

      await waitFor(() => {
        expect(document.activeElement).toBe(input);
      });
    });

    it("если пользователь не печатал — не принудительно возвращает фокус", async () => {
      render(<LoadingHarness storageFocusedKey={STORAGE_KEY} />);

      const input = screen.getByRole("textbox");
      const other = screen.getByTestId("other-focus-target");

      await userEvent.click(input);
      await userEvent.click(other);
      expect(document.activeElement).toBe(other);

      await userEvent.click(screen.getByTestId("start-loading"));
      await userEvent.click(screen.getByTestId("end-loading"));

      expect(document.activeElement).not.toBe(input);
    });

    it("без storageFocusedKey — логика восстановления после loading не выполняется", async () => {
      render(<LoadingHarness />);

      const input = screen.getByRole("textbox");
      await userEvent.click(input);
      await userEvent.type(input, "z");
      input.blur();

      await userEvent.click(screen.getByTestId("start-loading"));
      await userEvent.click(screen.getByTestId("end-loading"));

      // При отсутствии ключа эффект сразу выходит: фокус не возвращают.
      expect(document.activeElement).not.toBe(input);
    });
  });
});
