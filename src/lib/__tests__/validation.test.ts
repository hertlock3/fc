import { describe, expect, it } from "vitest";
import {
  addressSchema,
  categorySchema,
  checkoutSchema,
  loginSchema,
  phoneSchema,
  productSchema,
  productUpdateSchema,
  registerSchema,
} from "@/lib/validation";

describe("phoneSchema", () => {
  it("accepts common Kenyan formats", () => {
    for (const value of [
      "0712345678",
      "0112345678",
      "+254712345678",
      "254712345678",
      "0712 345 678",
    ]) {
      expect(phoneSchema.safeParse(value).success).toBe(true);
    }
  });

  it("rejects invalid numbers", () => {
    for (const value of ["12345", "0812345678", "07123", "071234567890"]) {
      expect(phoneSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe("registerSchema", () => {
  it("accepts a valid sign-up and lowercases the email", () => {
    const parsed = registerSchema.safeParse({
      fullName: "Jane Wanjiru",
      email: "Jane@Example.com",
      phone: "0712345678",
      password: "supersecret",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBe("jane@example.com");
  });

  it("rejects a too-short password", () => {
    expect(
      registerSchema.safeParse({
        fullName: "Jane",
        email: "a@b.com",
        phone: "0712345678",
        password: "short",
      }).success
    ).toBe(false);
  });
});

describe("loginSchema", () => {
  it("normalises the email to lowercase", () => {
    const parsed = loginSchema.parse({ email: "User@Example.com", password: "x" });
    expect(parsed.email).toBe("user@example.com");
  });
});

describe("addressSchema", () => {
  it("accepts valid Nairobi coordinates", () => {
    const parsed = addressSchema.safeParse({
      label: "Home",
      line1: "Kileleshwa Gardens Block B",
      city: "Nairobi",
      lat: -1.28,
      lng: 36.78,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects out-of-range coordinates", () => {
    expect(
      addressSchema.safeParse({
        label: "Home",
        line1: "Somewhere long enough",
        city: "Nairobi",
        lat: 100,
        lng: 36.78,
      }).success
    ).toBe(false);
  });

  it("rejects a too-short street address", () => {
    expect(
      addressSchema.safeParse({
        label: "Home",
        line1: "ab",
        city: "Nairobi",
        lat: -1,
        lng: 36,
      }).success
    ).toBe(false);
  });
});

describe("checkoutSchema", () => {
  it("requires a UUID delivery address", () => {
    expect(checkoutSchema.safeParse({ addressId: "not-a-uuid" }).success).toBe(false);
    expect(
      checkoutSchema.safeParse({
        addressId: "11111111-1111-4111-8111-111111111111",
      }).success
    ).toBe(true);
  });
});

describe("productSchema", () => {
  it("accepts a valid product and coerces the price", () => {
    const parsed = productSchema.safeParse({
      name: "Beef Ribeye Steak",
      categoryId: "11111111-1111-4111-8111-111111111111",
      price: "950.50",
      unit: "500g pack",
      inStock: "true",
      stockQty: "40",
      isActive: "on",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.price).toBe(950.5);
      expect(parsed.data.inStock).toBe(true);
      expect(parsed.data.stockQty).toBe(40);
      expect(parsed.data.categoryId).toBe("11111111-1111-4111-8111-111111111111");
    }
  });

  it("normalises an empty category to null", () => {
    const parsed = productSchema.safeParse({ name: "Mutton Chops", price: 800, categoryId: "" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.categoryId).toBeNull();
  });

  it("rejects a negative price", () => {
    expect(productSchema.safeParse({ name: "Bad Deal", price: -1 }).success).toBe(false);
  });

  it("rejects a too-short name", () => {
    expect(productSchema.safeParse({ name: "B", price: 10 }).success).toBe(false);
  });

  it("rejects a malformed image URL", () => {
    expect(
      productSchema.safeParse({ name: "Good Name", price: 10, imageUrl: "not-a-url" }).success
    ).toBe(false);
  });

  it("partial update only validates provided fields", () => {
    const parsed = productUpdateSchema.safeParse({ price: 120 });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual({ price: 120 });
  });
});

describe("categorySchema", () => {
  it("accepts a valid category", () => {
    const parsed = categorySchema.safeParse({ name: "Bacon & Ham", sortOrder: "5" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.sortOrder).toBe(5);
  });

  it("rejects a too-short name", () => {
    expect(categorySchema.safeParse({ name: "X" }).success).toBe(false);
  });
});
