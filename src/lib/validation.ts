import { z } from "zod";

/** Reusable Kenyan phone validator (accepts 07..., 01..., +254..., 254...). */
export const phoneSchema = z
  .string()
  .trim()
  .min(9, "Enter a valid phone number")
  .transform((v) => v.replace(/\s+/g, ""))
  .refine((v) => /^(\+?254|0)(7|1)\d{8}$/.test(v), {
    message: "Enter a valid Kenyan phone number, e.g. 0712 345 678",
  });

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, "Please enter your full name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: phoneSchema,
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password is too long"),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export const addressSchema = z.object({
  label: z.string().trim().min(1, "Give this place a name").max(40).default("Home"),
  line1: z.string().trim().min(4, "Enter your street / building / house").max(160),
  area: z.string().trim().max(80).optional().or(z.literal("")),
  city: z.string().trim().min(2, "Enter your town or city").max(80).default("Nairobi"),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  deliveryNotes: z.string().trim().max(240).optional().or(z.literal("")),
  isDefault: z.boolean().optional().default(false),
});

export const addToCartSchema = z.object({
  productId: z.string().uuid("Invalid product"),
  quantity: z.coerce.number().int().min(1).max(99).default(1),
});

export const updateCartItemSchema = z.object({
  quantity: z.coerce.number().int().min(0).max(99),
});

export const checkoutSchema = z.object({
  addressId: z.string().uuid("Choose a delivery address"),
  customerNotes: z.string().trim().max(300).optional().or(z.literal("")),
});

/* ------------------------------------------------------------------------ */
/* Admin catalog: products & categories.                                    */
/* Field primitives are shared between the create and update schemas so a   */
/* partial update never applies create-time defaults (which would clobber   */
/* untouched columns on PATCH).                                             */
/* ------------------------------------------------------------------------ */

const productName = z.string().trim().min(2, "Give the product a name").max(120);
const productDescription = z.string().trim().max(1000);
const productPrice = z.coerce
  .number({ message: "Enter a price" })
  .min(0, "Price cannot be negative")
  .max(10_000_000, "Price is too large");
const productUnit = z.string().trim().min(1, "Enter the selling unit").max(40);
const productSku = z.string().trim().max(40);
const productImageUrl = z.string().trim().url("Enter a valid image URL").max(500);
const productCategoryId = z
  .union([z.string().uuid("Choose a valid category"), z.literal(""), z.null()])
  .transform((v) => (v ? v : null));
const productStockQty = z.coerce.number().int().min(0).max(1_000_000);
const productFlag = z.coerce.boolean();

/**
 * Create a product. `price` is in whole shillings from the form and is
 * stored as integer cents.
 */
export const productSchema = z.object({
  name: productName,
  categoryId: productCategoryId.optional(),
  description: productDescription.optional(),
  price: productPrice,
  unit: productUnit.default("each"),
  sku: productSku.optional(),
  imageUrl: productImageUrl.optional().or(z.literal("")),
  inStock: productFlag.default(true),
  stockQty: productStockQty.default(0),
  isActive: productFlag.default(true),
});

/** Partial update — absent fields are left unchanged. */
export const productUpdateSchema = z.object({
  name: productName.optional(),
  categoryId: productCategoryId.optional(),
  description: productDescription.optional(),
  price: productPrice.optional(),
  unit: productUnit.optional(),
  sku: productSku.optional(),
  imageUrl: productImageUrl.optional().or(z.literal("")),
  inStock: productFlag.optional(),
  stockQty: productStockQty.optional(),
  isActive: productFlag.optional(),
});

const categoryName = z.string().trim().min(2, "Give the category a name").max(60);
const categoryDescription = z.string().trim().max(300);
const categoryImageUrl = z.string().trim().url("Enter a valid image URL").max(500);
const categorySortOrder = z.coerce.number().int().min(0).max(9999);

/** Create a category. */
export const categorySchema = z.object({
  name: categoryName,
  description: categoryDescription.optional(),
  imageUrl: categoryImageUrl.optional().or(z.literal("")),
  sortOrder: categorySortOrder.default(0),
});

/** Partial update — absent fields are left unchanged. */
export const categoryUpdateSchema = z.object({
  name: categoryName.optional(),
  description: categoryDescription.optional(),
  imageUrl: categoryImageUrl.optional().or(z.literal("")),
  sortOrder: categorySortOrder.optional(),
});

export const dispatchSchema = z.object({
  orderId: z.string().uuid(),
});

export const orderActionSchema = z.object({
  orderId: z.string().uuid(),
  action: z.enum([
    "approve",
    "dispatch",
    "mark_delivered",
    "cancel",
    "assign_rider",
    "reassign_stockist",
  ]),
  courierName: z.string().trim().max(80).optional(),
  courierPhone: z.string().trim().max(20).optional(),
  /** profiles.id of a registered courier — enables chat + courier portal. */
  courierId: z.string().uuid().optional(),
  /** Override the auto-nearest fulfilment location (approve / reassign_stockist). */
  stockistId: z.string().uuid().optional(),
  reason: z.string().trim().max(200).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;

/* ------------------------------------------------------------------------ */
/* Partner registration (riders & stockists)                                */
/* ------------------------------------------------------------------------ */

export const partnerRoleSchema = z.enum(["courier", "stockist"]);

/**
 * Partner signup. Riders need just contact details; stockists additionally
 * provide their business/location info. The account is created with the
 * requested role, but a stockist location is only activated after an admin
 * verifies it in /admin/stockists.
 */
export const partnerRegisterSchema = registerSchema.extend({
  role: partnerRoleSchema,
  businessName: z.string().trim().max(120).optional(),
  businessAddress: z.string().trim().max(240).optional(),
  businessCity: z.string().trim().max(80).optional(),
});

export type PartnerRegisterInput = z.infer<typeof partnerRegisterSchema>;
