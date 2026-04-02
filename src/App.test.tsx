import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import App from "./App";

vi.mock("./App.css", () => ({}));

describe("App", () => {
  it("renders the shell layout with sidebar and main split", () => {
    render(<App />);

    const shell = screen.getByRole("main", { name: "Application shell" });
    const sidebar = screen.getByLabelText("Workspace sidebar");
    const panel = screen.getByLabelText("Workspace panel");
    const dragRegion = screen.getByLabelText("Top window drag region");
    const viewport = screen.getByLabelText("Workspace viewport");

    expect(shell).toHaveAttribute("data-theme", "railway-dark");
    expect(shell).toHaveClass("bg-app-base");
    expect(shell).toHaveClass("relative");
    expect(sidebar).toHaveClass("w-72");
    expect(sidebar).toHaveClass("border-r");
    expect(sidebar).toHaveClass("border-app-border");
    expect(sidebar).toHaveClass("bg-app-sidebar");
    expect(panel).toHaveClass("flex-1");
    expect(panel).toHaveClass("flex-col");
    expect(panel).toHaveClass("bg-app-canvas");
    expect(dragRegion).toHaveClass("absolute");
    expect(dragRegion).toHaveClass("h-12");
    expect(dragRegion).toHaveClass("bg-transparent");
    expect(dragRegion).toHaveAttribute("data-tauri-drag-region");
    expect(viewport).toHaveClass("flex-1");
    expect(viewport).toHaveClass("bg-app-elevated");
  });
});
