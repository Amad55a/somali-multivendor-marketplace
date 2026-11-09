import { expect, test } from "@playwright/test";

test("the English homepage renders with its locale metadata", async ({ page }) => {
  const response = await page.goto("/en");

  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("Somsuuq | Somali Marketplace");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("link", { name: "Somsuuq — Somali marketplace" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Shop Your Favourite Somali Markets From Home.",
      level: 1,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: "Somali-inspired shopping scene featuring traditional textiles, woven baskets, an incense burner, and a shopping phone",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Discover Markets Across Somalia" }),
  ).toBeVisible();
});

test("the Somali homepage renders translated copy", async ({ page }) => {
  await page.goto("/so");

  await expect(page.locator("html")).toHaveAttribute("lang", "so");
  await expect(
    page.getByRole("heading", {
      name: "Suuqyada aad jeceshahay ee Soomaalida ka adeegso gurigaaga.",
      level: 1,
    }),
  ).toBeVisible();
});

test("language preference changes and survives a reload", async ({ page }) => {
  await page.goto("/en");
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Af-Soomaali" })
    .click();

  await expect(page).toHaveURL(/\/so$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "so");

  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Suuqyada aad jeceshahay ee Soomaalida ka adeegso gurigaaga.",
      level: 1,
    }),
  ).toBeVisible();

  await page.goto("/");
  await expect(page).toHaveURL(/\/so$/);
});

test("the root route defaults to English without a saved preference", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/en$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("language switcher remains usable on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en");

  const switcher = page
    .getByRole("banner")
    .getByRole("group", { name: "Language" });
  await expect(switcher).toBeVisible();
  await switcher.getByRole("button", { name: "Af-Soomaali" }).click();

  await expect(page).toHaveURL(/\/so$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "so");
});

test("the desktop homepage has working navigation and a complete footer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en");

  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
  await expect(
    page.getByRole("searchbox", { name: "Search the marketplace" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    "/en/login",
  );
  await expect(page.getByRole("link", { name: "Sign up" })).toHaveAttribute(
    "href",
    "/en/register",
  );
  await expect(
    page.locator('summary[aria-label="Shopping cart"]:visible'),
  ).toBeVisible();
  await expect(page.getByRole("contentinfo")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Shopping support" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Marketplace" }),
  ).toBeVisible();

  for (const section of [
    "market-network",
    "direct-suuq",
    "categories",
    "featured-products",
    "merchant-stores",
    "why-shop",
  ]) {
    await expect(page.locator(`#${section}`)).toHaveCount(1);
  }
});

test("customer, vendor, and admin authentication pages are localized and accessible", async ({
  page,
}) => {
  await page.goto("/en/login");
  await expect(
    page.getByRole("heading", { name: "Sign in to Somsuuq" }),
  ).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByLabel("Account type")).toBeVisible();

  await page.goto("/so/vendor/register");
  await expect(
    page.getByRole("heading", { name: "Iska diiwaangeli iibiyaha ahaan" }),
  ).toBeVisible();
  await expect(page.getByLabel("Cinwaanka iimaylka")).toBeVisible();

  await page.goto("/en/admin/login");
  await expect(
    page.getByRole("heading", { name: "Administrator sign in" }),
  ).toBeVisible();
});

test("vendor onboarding routes redirect unauthenticated visitors to vendor login", async ({
  page,
}) => {
  await page.goto("/en/vendor/onboarding");
  await expect(page).toHaveURL(/\/en\/login\?accountType=VENDOR$/);
  await expect(
    page.getByRole("heading", { name: "Sign in to Somsuuq" }),
  ).toBeVisible();
});

test("the mobile menu, theme toggle, and page layout work at phone width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en");

  const menuButton = page.getByRole("button", {
    name: "Open navigation menu",
  });
  await expect(menuButton).toBeVisible();
  await menuButton.click();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();

  const themeButton = page.getByRole("button", {
    name: "Switch to dark theme",
  });
  await themeButton.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  const pageWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(pageWidth).toBeLessThanOrEqual(390);

  await page.getByRole("contentinfo").scrollIntoViewIfNeeded();
  await expect(page.getByRole("contentinfo")).toBeVisible();
});

test("all custom homepage illustrations load", async ({ page }) => {
  await page.goto("/en");

  const featuredProductImages = page.locator("#featured-products img");
  await expect(featuredProductImages).toHaveCount(8);

  const customIllustrations = page.locator("main section:not(#featured-products) img");
  const illustrationCount = await customIllustrations.count();

  expect(illustrationCount).toBe(21);
  await customIllustrations.evaluateAll((elements) => {
    elements
      .filter(
        (element): element is HTMLImageElement =>
          element instanceof HTMLImageElement,
      )
      .forEach((image) => {
        image.loading = "eager";
      });
  });

  await expect
    .poll(() =>
      customIllustrations.evaluateAll(
        (elements) =>
          elements.filter(
            (element) =>
              element instanceof HTMLImageElement &&
              element.complete &&
              element.naturalWidth > 0,
          ).length,
      ),
    )
    .toBe(illustrationCount);

  const illustrationSources = await customIllustrations.evaluateAll((elements) =>
    elements
      .filter(
        (element): element is HTMLImageElement =>
          element instanceof HTMLImageElement,
      )
      .map((image) => image.currentSrc),
  );

  expect(illustrationSources.length).toBe(illustrationCount);
  expect(new Set(illustrationSources).size).toBe(illustrationCount);
  illustrationSources.forEach((source) => {
    expect(source).toBeTruthy();
    expect(source).not.toBe("about:blank");
  });
});

test("search filters the featured products", async ({ page }) => {
  await page.goto("/en");

  await page
    .getByRole("searchbox", { name: "Search the marketplace" })
    .fill("dabqaad");
  await page
    .getByRole("searchbox", { name: "Search the marketplace" })
    .press("Enter");

  await expect(page).toHaveURL(/\/en\?q=dabqaad/);
  await expect(
    page.getByRole("heading", { name: "Handcrafted Mogadishu Brass Dabqaad" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Premium Somali Dirac Shaash Silk Set" }),
  ).toHaveCount(0);
});
