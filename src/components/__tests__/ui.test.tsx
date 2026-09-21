// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Alert, Badge, Button, EmptyState } from "@/components/ui";

describe("Button", () => {
  it("renders its label and fires onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Add to cart</Button>);

    await userEvent.click(screen.getByRole("button", { name: "Add to cart" }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("can be disabled", () => {
    render(<Button disabled>Pay now</Button>);
    expect(screen.getByRole("button", { name: "Pay now" })).toBeDisabled();
  });
});

describe("Badge", () => {
  it("renders its content", () => {
    render(<Badge tone="success">Delivered</Badge>);
    expect(screen.getByText("Delivered")).toBeInTheDocument();
  });
});

describe("Alert", () => {
  it("exposes a status role and its message", () => {
    render(<Alert tone="danger">Payment failed</Alert>);
    expect(screen.getByRole("status")).toHaveTextContent("Payment failed");
  });
});

describe("EmptyState", () => {
  it("renders a title, description and action", () => {
    render(
      <EmptyState
        title="No orders yet"
        description="Your orders will appear here."
        action={<Button>Start shopping</Button>}
      />
    );

    expect(screen.getByText("No orders yet")).toBeInTheDocument();
    expect(screen.getByText("Your orders will appear here.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start shopping" })).toBeInTheDocument();
  });
});
