export type SuggestedProductOption = {
  name: string;
  suggestedValues: string[];
};

export type ProductOption = {
  name: string;
  values: string;
};

export type ProductVariantDraft = {
  variantName: string;
  sku: string;
  attributes: Record<string, string>;
  price: string;
  stockQuantity: string;
};

export function suggestedProductOptions(category: { name: string; slug: string } | null): SuggestedProductOption[] {
  if (!category) return [];
  const key = `${category.name} ${category.slug}`.toLowerCase();
  if (/(cloth|apparel|fashion|garment)/.test(key)) {
    return [
      { name: "Size", suggestedValues: ["XS", "S", "M", "L", "XL", "XXL"] },
      { name: "Color", suggestedValues: ["Black", "White", "Blue", "Red"] },
      { name: "Material", suggestedValues: [] },
    ];
  }
  if (/(shoe|footwear|sneaker)/.test(key)) {
    return [
      { name: "Shoe size", suggestedValues: ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45"] },
      { name: "Color", suggestedValues: ["Black", "White", "Blue", "Red"] },
    ];
  }
  if (/(electronic|computer|phone|device)/.test(key)) {
    return [
      { name: "Brand", suggestedValues: [] },
      { name: "Model", suggestedValues: [] },
      { name: "Storage capacity", suggestedValues: [] },
      { name: "Color", suggestedValues: ["Black", "White", "Blue", "Red"] },
    ];
  }
  if (/(food|grocery|grocer|beverage)/.test(key)) {
    return [
      { name: "Weight", suggestedValues: [] },
      { name: "Volume", suggestedValues: [] },
      { name: "Package size", suggestedValues: [] },
    ];
  }
  if (/(beauty|cosmetic|skincare|makeup)/.test(key)) {
    return [
      { name: "Volume", suggestedValues: [] },
      { name: "Shade", suggestedValues: [] },
      { name: "Product size", suggestedValues: [] },
    ];
  }
  if (/(furniture|home decor|home-furnish)/.test(key)) {
    return [
      { name: "Dimensions", suggestedValues: [] },
      { name: "Material", suggestedValues: [] },
      { name: "Color", suggestedValues: ["Black", "White", "Blue", "Red"] },
    ];
  }
  return [];
}

export function buildVariantCombinations(productName: string, options: ProductOption[]): ProductVariantDraft[] {
  const usableOptions = options.flatMap((option) => {
    const name = option.name.trim();
    const values = [...new Map(
      option.values.split(",").map((value) => value.trim()).filter(Boolean).map((value) => [value.toLocaleLowerCase(), value]),
    ).values()];
    return name && values.length ? [{ name, values }] : [];
  });
  if (!usableOptions.length) return [];

  const optionNames = new Set<string>();
  let combinations: Record<string, string>[] = [{}];
  for (const option of usableOptions) {
    const nameKey = option.name.toLocaleLowerCase();
    if (optionNames.has(nameKey) || combinations.length * option.values.length > 100) return [];
    optionNames.add(nameKey);
    combinations = combinations.flatMap((combination) =>
      option.values.map((value) => ({ ...combination, [option.name]: value })),
    );
  }

  const prefix = productName.trim().toLocaleUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "PRODUCT";
  return combinations.map((attributes, index) => {
    const suffix = Object.values(attributes).join("-").toLocaleUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
    const variantName = Object.entries(attributes).map(([key, value]) => `${key}: ${value}`).join(" / ");
    return {
      variantName,
      sku: `${prefix}-${suffix || "OPTION"}-${String(index + 1).padStart(2, "0")}`.slice(0, 80),
      attributes,
      price: "",
      stockQuantity: "0",
    };
  });
}
