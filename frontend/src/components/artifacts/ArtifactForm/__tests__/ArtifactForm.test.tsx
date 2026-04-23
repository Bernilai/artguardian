import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ArtifactForm, { ArtifactFormProps } from "../ArtifactForm";
import { useAuth } from "../../../../contexts/AuthContext";
import { imagesAPI } from "../../../../services/imagesAPI";
import { artifactsAPI } from "../../../../services/artifactsAPI";

jest.mock("../../../../contexts/AuthContext", () => ({
  useAuth: jest.fn(),
}));

jest.mock("../../../../services/imagesAPI", () => ({
  imagesAPI: {
    uploadImage: jest.fn().mockResolvedValue({ object_path: "uploaded/img.jpg" }),
  },
}));

jest.mock("../../../../services/artifactsAPI", () => ({
  artifactsAPI: {
    createArtifact: jest.fn().mockResolvedValue({}),
    updateArtifact: jest.fn().mockResolvedValue({}),
  },
}));

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUploadImage = imagesAPI.uploadImage as jest.MockedFunction<typeof imagesAPI.uploadImage>;
const mockedCreateArtifact = artifactsAPI.createArtifact as jest.MockedFunction<typeof artifactsAPI.createArtifact>;
const mockedUpdateArtifact = artifactsAPI.updateArtifact as jest.MockedFunction<typeof artifactsAPI.updateArtifact>;

let onCloseMock: jest.Mock;
let onSuccessMock: jest.Mock;

const renderForm = (props?: Partial<ArtifactFormProps>) =>
  render(<ArtifactForm onClose={onCloseMock} onSuccess={onSuccessMock} {...props} />);

const fillRequiredFields = async () => {
  await userEvent.type(screen.getByLabelText("Название *"), "Artifact title");
  await userEvent.type(screen.getByLabelText("Инвентарный номер *"), "INV-001");
  await userEvent.type(screen.getByLabelText("Коллекция *"), "Main collection");
};

const getImageInput = () => document.getElementById("image") as HTMLInputElement;

const createImageFile = (options?: { type?: string; size?: number }) => {
  const type = options?.type ?? "image/jpeg";
  const size = options?.size ?? 1024;
  const file = new File(["img"], "artifact.jpg", { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
};

const mockFileReader = (result = "data:image/jpeg;base64,mock-preview") => {
  class MockFileReader {
    result: string | ArrayBuffer | null = null;

    onloadend: (() => void) | null = null;

    readAsDataURL() {
      this.result = result;
      this.onloadend?.();
    }
  }

  Object.defineProperty(window, "FileReader", {
    writable: true,
    configurable: true,
    value: MockFileReader,
  });
};

beforeEach(() => {
  onCloseMock = jest.fn();
  onSuccessMock = jest.fn();
  mockedUseAuth.mockReturnValue({
    accessToken: "test-token",
  } as ReturnType<typeof useAuth>);
  mockedUploadImage.mockResolvedValue({ object_path: "uploaded/img.jpg" } as Awaited<ReturnType<typeof imagesAPI.uploadImage>>);
  mockedCreateArtifact.mockResolvedValue({} as Awaited<ReturnType<typeof artifactsAPI.createArtifact>>);
  mockedUpdateArtifact.mockResolvedValue({} as Awaited<ReturnType<typeof artifactsAPI.updateArtifact>>);
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("ArtifactForm", () => {
  describe("rendering", () => {
    it("shows create mode heading and submit button by default", () => {
      renderForm();

      expect(screen.getByRole("heading", { name: "Добавить артефакт" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Создать" })).toBeInTheDocument();
    });

    it("shows edit mode heading and submit button text", () => {
      renderForm({ mode: "edit", artifactId: "artifact-1" });

      expect(screen.getByRole("heading", { name: "Редактировать артефакт" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Сохранить" })).toBeInTheDocument();
    });

    it("renders expected fields", () => {
      renderForm();

      expect(screen.getByLabelText("Название *")).toBeInTheDocument();
      expect(screen.getByLabelText("Описание")).toBeInTheDocument();
      expect(screen.getByLabelText("Инвентарный номер *")).toBeInTheDocument();
      expect(screen.getByLabelText("Коллекция *")).toBeInTheDocument();
      expect(screen.getByLabelText("Местонахождение")).toBeInTheDocument();
      expect(screen.getByLabelText("Ширина (см) *")).toBeInTheDocument();
      expect(screen.getByLabelText("Высота (см) *")).toBeInTheDocument();
      expect(screen.getByLabelText("Единица измерения")).toBeInTheDocument();
      expect(screen.getByLabelText("Статус")).toBeInTheDocument();
    });

    it("prefills fields from initialData", () => {
      renderForm({
        initialData: {
          title: "Mona Lisa",
          inventoryNumber: "INV-777",
          collection: "Renaissance",
        },
      });

      expect(screen.getByLabelText("Название *")).toHaveValue("Mona Lisa");
      expect(screen.getByLabelText("Инвентарный номер *")).toHaveValue("INV-777");
      expect(screen.getByLabelText("Коллекция *")).toHaveValue("Renaissance");
    });
  });

  describe("close/cancel", () => {
    it("calls onClose when close button clicked", () => {
      renderForm();

      fireEvent.click(screen.getByRole("button", { name: "×" }));

      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when cancel button clicked", () => {
      renderForm();

      fireEvent.click(screen.getByRole("button", { name: "Отмена" }));

      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when clicking overlay", () => {
      const { container } = renderForm();
      const overlay = container.querySelector(".artifact-form-overlay");

      expect(overlay).toBeTruthy();
      fireEvent.click(overlay as Element);

      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });

    it("does not call onClose when clicking inside container", () => {
      const { container } = renderForm();
      const formContainer = container.querySelector(".artifact-form-container");

      expect(formContainer).toBeTruthy();
      fireEvent.click(formContainer as Element);

      expect(onCloseMock).not.toHaveBeenCalled();
    });
  });

  describe("field changes", () => {
    it("updates title when typing", async () => {
      renderForm();

      await userEvent.type(screen.getByLabelText("Название *"), "New title");

      expect(screen.getByLabelText("Название *")).toHaveValue("New title");
    });

    it("updates inventoryNumber when typing", async () => {
      renderForm();

      await userEvent.type(screen.getByLabelText("Инвентарный номер *"), "INV-42");

      expect(screen.getByLabelText("Инвентарный номер *")).toHaveValue("INV-42");
    });

    it("updates dimensions width with numeric value", () => {
      renderForm();

      fireEvent.change(screen.getByLabelText("Ширина (см) *"), {
        target: { value: "25.5" },
      });

      expect(screen.getByLabelText("Ширина (см) *")).toHaveValue(25.5);
    });

    it("updates dimensions unit to mm", () => {
      renderForm();

      fireEvent.change(screen.getByLabelText("Единица измерения"), {
        target: { value: "mm" },
      });

      expect(screen.getByLabelText("Единица измерения")).toHaveValue("mm");
    });

    it("toggles oil_paint material on and off", () => {
      renderForm();
      const materialCheckbox = screen.getByLabelText("Масляная краска");

      fireEvent.click(materialCheckbox);
      expect(materialCheckbox).toBeChecked();

      fireEvent.click(materialCheckbox);
      expect(materialCheckbox).not.toBeChecked();
    });
  });

  describe("submit", () => {
    it("creates artifact without image", async () => {
      renderForm();
      await fillRequiredFields();

      fireEvent.click(screen.getByRole("button", { name: "Создать" }));

      // Ждём завершения submit-пайплайна, чтобы корректно проверить вызовы API.
      await waitFor(() => {
        expect(mockedCreateArtifact).toHaveBeenCalledTimes(1);
      });

      expect(mockedUploadImage).not.toHaveBeenCalled();
      const [payload, token] = mockedCreateArtifact.mock.calls[0];
      expect(payload).toMatchObject({
        title: "Artifact title",
        inventory_number: "INV-001",
        collection: "Main collection",
        status: "good",
      });
      expect(payload.image_path).toBeUndefined();
      expect(token).toBe("test-token");
      expect(onSuccessMock).toHaveBeenCalledTimes(1);
      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });

    it("creates artifact with uploaded image", async () => {
      mockFileReader();
      renderForm();
      await fillRequiredFields();

      const imageInput = getImageInput();
      const file = createImageFile({ type: "image/png" });

      fireEvent.change(imageInput, { target: { files: [file] } });
      fireEvent.click(screen.getByRole("button", { name: "Создать" }));

      // Сначала убеждаемся, что загрузка получила токен и файл из useAuth.
      await waitFor(() => {
        expect(mockedUploadImage).toHaveBeenCalledWith(file, "artifacts", "test-token");
      });

      await waitFor(() => {
        expect(mockedCreateArtifact).toHaveBeenCalledTimes(1);
      });

      const [payload] = mockedCreateArtifact.mock.calls[0];
      expect(payload.image_path).toBe("uploaded/img.jpg");
      expect(onSuccessMock).toHaveBeenCalledTimes(1);
      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });

    it("updates artifact in edit mode", async () => {
      renderForm({ mode: "edit", artifactId: "artifact-123" });
      await fillRequiredFields();

      fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

      await waitFor(() => {
        expect(mockedUpdateArtifact).toHaveBeenCalledTimes(1);
      });

      const [id, payload, token] = mockedUpdateArtifact.mock.calls[0];
      expect(id).toBe("artifact-123");
      expect(payload).toMatchObject({
        title: "Artifact title",
        inventory_number: "INV-001",
        collection: "Main collection",
      });
      expect(token).toBe("test-token");
      expect(mockedCreateArtifact).not.toHaveBeenCalled();
    });
  });

  describe("loading state", () => {
    it("disables submit and cancel while request is pending", async () => {
      let resolveCreate!: (value: {}) => void;
      mockedCreateArtifact.mockReturnValue(
        new Promise((resolve) => {
          resolveCreate = resolve;
        }) as ReturnType<typeof artifactsAPI.createArtifact>
      );

      renderForm();
      await fillRequiredFields();
      fireEvent.click(screen.getByRole("button", { name: "Создать" }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Сохранение..." })).toBeDisabled();
      });
      expect(screen.getByRole("button", { name: "Отмена" })).toBeDisabled();

      resolveCreate({});
      await waitFor(() => {
        expect(mockedCreateArtifact).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("error handling", () => {
    it("shows createArtifact server error", async () => {
      mockedCreateArtifact.mockRejectedValue(new Error("Server error"));
      renderForm();
      await fillRequiredFields();

      fireEvent.click(screen.getByRole("button", { name: "Создать" }));

      await waitFor(() => {
        expect(screen.getByText("Server error")).toBeInTheDocument();
      });
    });

    it("shows image upload error and does not call createArtifact", async () => {
      mockFileReader();
      mockedUploadImage.mockRejectedValue(new Error("Upload failed"));
      renderForm();
      await fillRequiredFields();

      const imageInput = getImageInput();
      fireEvent.change(imageInput, { target: { files: [createImageFile()] } });
      fireEvent.click(screen.getByRole("button", { name: "Создать" }));

      // При падении uploadImage форма должна завершиться ошибкой до createArtifact.
      await waitFor(() => {
        expect(screen.getByText(/Ошибка загрузки изображения/)).toBeInTheDocument();
      });
      expect(mockedCreateArtifact).not.toHaveBeenCalled();
    });

    it("shows authorization error when accessToken is null", async () => {
      mockedUseAuth.mockReturnValue({
        accessToken: null,
      } as ReturnType<typeof useAuth>);

      renderForm();
      await fillRequiredFields();
      fireEvent.click(screen.getByRole("button", { name: "Создать" }));

      await waitFor(() => {
        expect(screen.getByText("Необходима авторизация")).toBeInTheDocument();
      });
    });
  });

  describe("image handling", () => {
    it("shows error for non-image file type", () => {
      renderForm();

      const imageInput = getImageInput();
      fireEvent.change(imageInput, {
        target: { files: [createImageFile({ type: "application/pdf" })] },
      });

      expect(screen.getByText("Пожалуйста, выберите файл изображения")).toBeInTheDocument();
    });

    it("shows error for file larger than 10MB", () => {
      renderForm();

      const imageInput = getImageInput();
      fireEvent.change(imageInput, {
        target: { files: [createImageFile({ size: 10 * 1024 * 1024 + 1 })] },
      });

      expect(screen.getByText("Размер файла не должен превышать 10MB")).toBeInTheDocument();
    });

    it("shows preview for valid image and removes it", async () => {
      mockFileReader("data:image/png;base64,preview-data");
      renderForm();

      const imageInput = getImageInput();
      fireEvent.change(imageInput, {
        target: { files: [createImageFile({ type: "image/png" })] },
      });

      await waitFor(() => {
        expect(screen.getByRole("img", { name: "Preview" })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Удалить" }));

      await waitFor(() => {
        expect(screen.queryByRole("img", { name: "Preview" })).not.toBeInTheDocument();
      });
    });
  });
});
