import "@testing-library/jest-dom";

const defaultFetchResponse = {
  ok: true,
  status: 200,
  json: async () => ({}),
  text: async () => "",
} as Response;

Object.defineProperty(global, "fetch", {
  writable: true,
  value: jest.fn(async () => defaultFetchResponse),
});
