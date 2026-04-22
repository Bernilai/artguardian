import { render, screen } from "@testing-library/react";

describe("frontend smoke", () => {
  it("renders test markup", () => {
    render(<div>Smoke test</div>);
    expect(screen.getByText("Smoke test")).toBeInTheDocument();
  });
});
