"use client";

import { useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Pencil,
  Plus,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Input,
  Label,
  Select,
  Spinner,
  Textarea,
} from "@/components/ui";
import { formatMoney } from "@/lib/money";
import type { Category, Product } from "@/lib/types";

/* ------------------------------------------------------------------ types -- */

interface CategoryForm {
  name: string;
  description: string;
  imageUrl: string;
  sortOrder: string;
}

interface ProductForm {
  name: string;
  categoryId: string;
  description: string;
  price: string;
  unit: string;
  sku: string;
  imageUrl: string;
  inStock: boolean;
  stockQty: string;
  isActive: boolean;
}

const emptyCategory: CategoryForm = {
  name: "",
  description: "",
  imageUrl: "",
  sortOrder: "0",
};

const emptyProduct: ProductForm = {
  name: "",
  categoryId: "",
  description: "",
  price: "",
  unit: "each",
  sku: "",
  imageUrl: "",
  inStock: true,
  stockQty: "0",
  isActive: true,
};

function toProductForm(p: Product): ProductForm {
  return {
    name: p.name,
    categoryId: p.category_id ?? "",
    description: p.description ?? "",
    price: (p.price_cents / 100).toString(),
    unit: p.unit,
    sku: p.sku ?? "",
    imageUrl: p.image_url ?? "",
    inStock: p.in_stock,
    stockQty: String(p.stock_qty),
    isActive: p.is_active,
  };
}

function toCategoryForm(c: Category): CategoryForm {
  return {
    name: c.name,
    description: c.description ?? "",
    imageUrl: c.image_url ?? "",
    sortOrder: String(c.sort_order),
  };
}

/* -------------------------------------------------------------- main view -- */

export function CatalogManager({
  products: initialProducts,
  categories: initialCategories,
}: {
  products: Product[];
  categories: Category[];
}) {
  const [products, setProducts] = useState(initialProducts);
  const [categories, setCategories] = useState(initialCategories);
  const [error, setError] = useState<string | null>(null);

  const [productEditing, setProductEditing] = useState<Product | "new" | null>(null);
  const [categoryEditing, setCategoryEditing] = useState<Category | "new" | null>(null);

  const [archived, setArchived] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const visible = useMemo(
    () =>
      products
        .filter((p) => (archived ? true : p.is_active))
        .filter((p) => categoryFilter === "all" || p.category_id === categoryFilter)
        .filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase())),
    [products, archived, categoryFilter, search]
  );

  async function mutate(
    path: string,
    init: { method: string; body?: unknown; query?: string }
  ): Promise<Record<string, unknown> | null> {
    setError(null);
    const res = await fetch(`${path}${init.query ? `?${init.query}` : ""}`, {
      method: init.method,
      headers: { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError((data as { error?: string })?.error ?? "Request failed.");
      return null;
    }
    return (data ?? null) as Record<string, unknown> | null;
  }

  const productDeleted = (id: string) => setProducts((prev) => prev.filter((p) => p.id !== id));
  const productUpserted = (p: Product) =>
    setProducts((prev) => {
      const idx = prev.findIndex((x) => x.id === p.id);
      if (idx === -1) return [...prev, p];
      const next = [...prev];
      next[idx] = p;
      return next;
    });

  return (
    <div className="space-y-8">
      {error && <Alert tone="danger">{error}</Alert>}

      {/* ------------------------------------------------------ categories -- */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Categories</h2>
          <Button size="sm" variant="secondary" onClick={() => setCategoryEditing("new")}>
            <Plus className="h-4 w-4" /> New category
          </Button>
        </div>
        <ul className="mt-3 flex flex-wrap gap-2">
          {categories.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1.5 pl-3 pr-1.5 text-sm shadow-sm"
            >
              <Tag className="h-3.5 w-3.5 text-brand-600" />
              <span className="font-medium text-slate-800">{c.name}</span>
              <span className="text-xs text-slate-400">#{c.sort_order}</span>
              <button
                onClick={() => setCategoryEditing(c)}
                className="grid h-6 w-6 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label={`Edit ${c.name}`}
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={async () => {
                  if (!confirm(`Delete category “${c.name}”?`)) return;
                  const ok = await mutate("/api/admin/categories", {
                    method: "DELETE",
                    query: `id=${c.id}`,
                  });
                  if (ok) {
                    setCategories((prev) => prev.filter((x) => x.id !== c.id));
                  }
                }}
                className="grid h-6 w-6 place-items-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600"
                aria-label={`Delete ${c.name}`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
          {categories.length === 0 && (
            <li className="text-sm text-slate-500">No categories yet.</li>
          )}
        </ul>
      </section>

      {/* -------------------------------------------------------- products -- */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Products</h2>
          <Button size="sm" onClick={() => setProductEditing("new")}>
            <Plus className="h-4 w-4" /> New product
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            className="max-w-56"
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            className="max-w-48"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
            />
            Show archived
          </label>
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 font-medium">Stock</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{p.name}</p>
                    <p className="text-xs text-slate-400">
                      {p.sku ?? "no SKU"} · {p.unit}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {categories.find((c) => c.id === p.category_id)?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {formatMoney(p.price_cents, "KES", { withSymbol: false })}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {p.in_stock ? p.stock_qty : <Badge tone="danger">Out</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    {p.is_active ? (
                      <Badge tone="success">Active</Badge>
                    ) : (
                      <Badge tone="neutral">Archived</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setProductEditing(p)}
                        className="grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                        aria-label={`Edit ${p.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={async () => {
                          const ok = await mutate("/api/admin/products", {
                            method: "PATCH",
                            body: { id: p.id, isActive: !p.is_active },
                          });
                          if (ok) productUpserted({ ...p, is_active: !p.is_active });
                        }}
                        className="grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                        aria-label={p.is_active ? `Archive ${p.name}` : `Restore ${p.name}`}
                        title={p.is_active ? "Archive (hide from shop)" : "Restore to shop"}
                      >
                        {p.is_active ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={async () => {
                          if (
                            !confirm(
                              `Permanently delete “${p.name}”?\n\nPast orders keep their line items, but items in customers' carts will be removed.`
                            )
                          )
                            return;
                          const ok = await mutate("/api/admin/products", {
                            method: "DELETE",
                            query: `id=${p.id}`,
                          });
                          if (ok) productDeleted(p.id);
                        }}
                        className="grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-red-50 hover:text-red-600"
                        aria-label={`Delete ${p.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    No products match this view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* --------------------------------------------------------- dialogs -- */}
      {productEditing !== null && (
        <ProductDialog
          product={productEditing === "new" ? null : productEditing}
          form={productEditing === "new" ? emptyProduct : toProductForm(productEditing)}
          categories={categories}
          onClose={() => setProductEditing(null)}
          onSaved={(saved) => {
            productUpserted(saved as Product);
            setProductEditing(null);
          }}
          mutate={mutate}
        />
      )}

      {categoryEditing !== null && (
        <CategoryDialog
          category={categoryEditing === "new" ? null : categoryEditing}
          form={categoryEditing === "new" ? emptyCategory : toCategoryForm(categoryEditing)}
          onClose={() => setCategoryEditing(null)}
          onSaved={(saved) => {
            setCategories((prev) => {
              const idx = prev.findIndex((x) => x.id === (saved as Category).id);
              if (idx === -1) return [...prev, saved as Category].sort((a, b) => a.sort_order - b.sort_order);
              const next = [...prev];
              next[idx] = saved as Category;
              return next;
            });
            setCategoryEditing(null);
          }}
          mutate={mutate}
        />
      )}
    </div>
  );
}

/* --------------------------------------------------------- product dialog -- */

function ProductDialog({
  product,
  form: initial,
  categories,
  onClose,
  onSaved,
  mutate,
}: {
  product: Product | null;
  form: ProductForm;
  categories: Category[];
  onClose: () => void;
  onSaved: (p: unknown) => void;
  mutate: (path: string, init: { method: string; body?: unknown }) => Promise<Record<string, unknown> | null>;
}) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    setBusy(true);
    setError(null);
    const payload = {
      name: form.name,
      categoryId: form.categoryId || null,
      description: form.description,
      price: Number(form.price),
      unit: form.unit || "each",
      sku: form.sku,
      imageUrl: form.imageUrl,
      inStock: form.inStock,
      stockQty: Number(form.stockQty || 0),
      isActive: form.isActive,
    };
    const data = await mutate("/api/admin/products", product
      ? { method: "PATCH", body: { id: product.id, ...payload } }
      : { method: "POST", body: payload });
    if (data) onSaved(data.product);
    else setError("Save failed — check the values.");
    setBusy(false);
  }

  return (
    <DialogShell
      title={product ? `Edit — ${product.name}` : "New product"}
      onClose={onClose}
    >
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>Name</Label>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Beef Ribeye Steak" />
        </div>
        <div>
          <Label>Category</Label>
          <Select value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
            <option value="">— None —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Price (KES)</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={form.price}
            onChange={(e) => set("price", e.target.value)}
            placeholder="950"
          />
        </div>
        <div>
          <Label>Unit</Label>
          <Input value={form.unit} onChange={(e) => set("unit", e.target.value)} placeholder="500g pack" />
        </div>
        <div>
          <Label>SKU (optional)</Label>
          <Input value={form.sku} onChange={(e) => set("sku", e.target.value)} placeholder="FC-BEF-001" />
        </div>
        <div>
          <Label>Stock quantity</Label>
          <Input
            type="number"
            min="0"
            value={form.stockQty}
            onChange={(e) => set("stockQty", e.target.value)}
          />
        </div>
        <div className="flex items-end gap-4 pb-1">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              checked={form.inStock}
              onChange={(e) => set("inStock", e.target.checked)}
            />
            In stock
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              checked={form.isActive}
              onChange={(e) => set("isActive", e.target.checked)}
            />
            Visible in shop
          </label>
        </div>
        <div className="sm:col-span-2">
          <Label>Description (optional)</Label>
          <Textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Premium grain-fed ribeye, expertly trimmed."
          />
        </div>
        <div className="sm:col-span-2">
          <Label>Image URL (optional)</Label>
          <Input
            type="url"
            value={form.imageUrl}
            onChange={(e) => set("imageUrl", e.target.value)}
            placeholder="https://…"
          />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy || form.name.trim().length < 2 || form.price === ""}>
          {busy ? <Spinner /> : product ? "Save changes" : "Create product"}
        </Button>
      </div>
    </DialogShell>
  );
}

/* ------------------------------------------------------- category dialog -- */

function CategoryDialog({
  category,
  form: initial,
  onClose,
  onSaved,
  mutate,
}: {
  category: Category | null;
  form: CategoryForm;
  onClose: () => void;
  onSaved: (c: unknown) => void;
  mutate: (path: string, init: { method: string; body?: unknown }) => Promise<Record<string, unknown> | null>;
}) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof CategoryForm>(key: K, value: CategoryForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    setBusy(true);
    setError(null);
    const payload = {
      name: form.name,
      description: form.description,
      imageUrl: form.imageUrl,
      sortOrder: Number(form.sortOrder || 0),
    };
    const data = await mutate("/api/admin/categories", category
      ? { method: "PATCH", body: { id: category.id, ...payload } }
      : { method: "POST", body: payload });
    if (data) onSaved(data.category);
    else setError("Save failed — check the values.");
    setBusy(false);
  }

  return (
    <DialogShell title={category ? `Edit — ${category.name}` : "New category"} onClose={onClose}>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>Name</Label>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Beef" />
        </div>
        <div>
          <Label>Sort order</Label>
          <Input
            type="number"
            min="0"
            value={form.sortOrder}
            onChange={(e) => set("sortOrder", e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Label>Description (optional)</Label>
          <Input
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Fresh beef cuts and mince"
          />
        </div>
        <div className="sm:col-span-2">
          <Label>Image URL (optional)</Label>
          <Input
            type="url"
            value={form.imageUrl}
            onChange={(e) => set("imageUrl", e.target.value)}
            placeholder="https://…"
          />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy || form.name.trim().length < 2}>
          {busy ? <Spinner /> : category ? "Save changes" : "Create category"}
        </Button>
      </div>
    </DialogShell>
  );
}

/* ----------------------------------------------------------- dialog shell -- */

function DialogShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
