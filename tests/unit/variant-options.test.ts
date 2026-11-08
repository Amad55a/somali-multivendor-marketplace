import { describe, expect, it } from "vitest";
import { buildVariantCombinations, suggestedProductOptions } from "@/features/products/variant-options";
import { productCreateSchema } from "@/features/products/validation";

describe("category-aware product options", () => {
  it("suggests clothing sizes and colors without prescribing them to electronics", () => {
    expect(suggestedProductOptions({ name: "Clothing", slug: "clothing" }).map(({ name }) => name)).toContain("Size");
    expect(suggestedProductOptions({ name: "Electronics", slug: "electronics" }).map(({ name }) => name)).not.toContain("Size");
  });

  it("builds separate variants for every selected option combination", () => {
    const variants = buildVariantCombinations("Cotton T-shirt", [
      { name: "Size", values: "S, M" },
      { name: "Color", values: "Black, White" },
    ]);

    expect(variants).toHaveLength(4);
    expect(variants[0]).toMatchObject({
      attributes: { Size: "S", Color: "Black" },
      variantName: "Size: S / Color: Black",
    });
    expect(new Set(variants.map(({ sku }) => sku)).size).toBe(4);
  });

  it("caps generated combinations at 100", () => {
    expect(buildVariantCombinations("Item", [
      { name: "Size", values: Array.from({ length: 11 }, (_, index) => `S${index}`).join(",") },
      { name: "Color", values: Array.from({ length: 10 }, (_, index) => `C${index}`).join(",") },
    ])).toHaveLength(0);
  });

  it("accepts a base-price product without selectable variants", () => {
    const parsed = productCreateSchema.parse({
      name: "Cotton T-shirt",
      nameSo: "Shaati",
      categoryId: "11111111-1111-4111-8111-111111111111",
      basePrice: 10,
      baseStockQuantity: 8,
    });

    expect(parsed.variants).toEqual([]);
    expect(parsed.basePrice).toBe(10);
    expect(parsed.baseStockQuantity).toBe(8);
  });
});
