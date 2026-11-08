# Somsuuq Screenshots Specification

This document provides a comprehensive guide to capturing and contributing screenshots of the Somsuuq marketplace for presentations, GitHub releases, technical reviews, and product documentation.

As per system documentation standards, fake, placeholder, or generated mock screenshots are strictly prohibited. All screenshots must be captured from a running Somsuuq instance loaded with the seeded database (`npm run categories:seed`, `npm run commissions:seed`, and `npm run admin:provision`).

---

## Screenshot Guidelines

1. **Resolution & Viewport**:
   - Desktop viewports: `1440 × 900 px` or `1920 × 1080 px`.
   - Mobile viewports (where applicable): `390 × 844 px` (iPhone 14/15/16 standard).
2. **Format**: PNG, optimized using lossless compression (e.g., pngquant or oxipng).
3. **Locale**: Capture both English (`/en`) and Somali (`/so`) versions when documenting user-facing views.
4. **Data Hygiene**: Ensure test email addresses and phone numbers conform to the test patterns (e.g., `+252 61 5000000`, `+252 63 4000000`). Never expose production credentials or personal identities.

---

## Required Screenshots Inventory

| File Name | Route / Path | User Role | Description / Key Elements to Showcase |
|---|---|---|---|
| `01-marketplace-homepage.png` | `/[locale]` | Guest / Customer | Hero banner, bilingual navigation header, category showcase, featured Somali markets, and direct suuq merchants. |
| `02-product-listing.png` | `/[locale]/marketplace` | Guest / Customer | Search input, category filter sidebar, location/city filters, price range slider, product cards with ratings and stock badges. |
| `03-product-detail.png` | `/[locale]/marketplace/[slug]` | Guest / Customer | Product gallery, bilingual title/description, variant selector (size/color), stock availability, verified reviews, and "Add to Cart" button. |
| `04-shopping-cart.png` | `/[locale]/cart` | Customer | Multi-vendor cart grouped by vendor, item quantity steppers, subtotal calculation, coupon input, and checkout button. |
| `05-checkout-flow.png` | `/[locale]/checkout` | Customer | 10-minute reservation countdown timer, shipping address form (Somali regions/cities), simulated mobile money selector (EVC Plus, Zaad, eDahab), and payment submission. |
| `06-payment-receipt.png` | `/[locale]/customer/orders/[id]/receipt` | Customer | Simulated mobile money receipt showing transaction reference, masked phone, paid amount (USD), and receipt number. |
| `07-customer-orders.png` | `/[locale]/customer/orders` | Customer | Order history list, status badges (Pending, Processing, Shipped, Delivered), and vendor sub-orders breakdown. |
| `08-customer-returns.png` | `/[locale]/customer/returns` | Customer | Return request form, uploaded photo evidence, return status timeline, and dispute thread. |
| `09-vendor-dashboard.png` | `/[locale]/vendor` | Vendor | Sales overview metrics, weekly revenue charts, pending sub-orders alert, and quick action links. |
| `10-vendor-products.png` | `/[locale]/vendor/products` | Vendor | Product inventory table, status filters (Draft, Published, Archived), stock levels, and "Add Product" modal. |
| `11-vendor-order-management.png` | `/[locale]/vendor/orders` | Vendor | Sub-order list, 24-hour confirmation deadline indicator, status update controls (Confirmed, Processing, Shipped, Delivered), and courier tracking input. |
| `12-vendor-financials.png` | `/[locale]/vendor/earnings` | Vendor | Net sales, commission deductions, platform fees, available balance, weekly payout status, and ledger transactions. |
| `13-admin-dashboard.png` | `/[locale]/admin` | Admin | High-level GMV metrics, active users/vendors count, pending vendor applications queue, and system health. |
| `14-admin-vendor-applications.png` | `/[locale]/admin/vendor-applications` | Admin | Submitted vendor onboarding applications, business license preview, verification status, and approve/reject/request-info actions. |
| `15-admin-commission-settings.png` | `/[locale]/admin/commissions` | Admin | Default platform commission rate, category-specific commission rates, inheritance hierarchy, and audit change history. |
| `16-admin-payout-management.png` | `/[locale]/admin/payouts` | Admin | Weekly payout batch creation, hold period overrides, payout preview table, and batch approval/cancellation controls. |
| `17-admin-financial-reconciliation.png` | `/[locale]/admin/reconciliation` | Admin | Real-time comparison between delivered orders, ledger balances, simulated refunds, and processed payouts with discrepancy alerts. |
| `18-admin-support-inbox.png` | `/[locale]/admin/support` | Admin | Support ticket queue, priority/status badges, customer/vendor filters, assignment dropdown, and AI-assisted triage suggestions. |
| `19-buyer-vendor-chat.png` | `/[locale]/customer/messages` | Customer / Vendor | Real-time Socket.IO chat interface, message status indicators (sent/delivered/read), product/order card sharing, and attachment previews. |
| `20-swagger-ui.png` | `/api-docs` | Developer | Interactive Swagger UI showing categorized endpoints, OpenAPI 3.0.3 specification, session cookie authentication, and reCAPTCHA interceptor. |

## Captured Screenshots

The following screenshots were supplied from a running marketplace instance.
Exact duplicate attachments are listed once. Visible personal names, account
details, contact information, order references, coupon codes, and browser
addresses have been redacted in the saved copies.

| File | View |
|---|---|
| [`21-somali-customer-marketplace.png`](./21-somali-customer-marketplace.png) | Somali-language customer marketplace |
| [`22-customer-home-authenticated.png`](./22-customer-home-authenticated.png) | Authenticated customer home |
| [`23-customer-product-listing.png`](./23-customer-product-listing.png) | Customer product listing with category filters |
| [`24-customer-product-detail.png`](./24-customer-product-detail.png) | Product detail, variants, stock, and purchase actions |
| [`25-customer-cart.png`](./25-customer-cart.png) | Customer cart with vendor subtotal |
| [`26-customer-checkout.png`](./26-customer-checkout.png) | Checkout form and simulated payment summary |
| [`27-customer-order-confirmation.png`](./27-customer-order-confirmation.png) | Simulated order confirmation |
| [`28-vendor-dashboard.png`](./28-vendor-dashboard.png) | Vendor dashboard metrics and product activity |
| [`29-vendor-store-profile.png`](./29-vendor-store-profile.png) | Vendor store profile and business details |
| [`30-vendor-product-form.png`](./30-vendor-product-form.png) | Vendor product creation form |
| [`31-vendor-coupons.png`](./31-vendor-coupons.png) | Vendor coupon creation and list |
| [`32-vendor-orders.png`](./32-vendor-orders.png) | Vendor order management |
| [`33-vendor-returns.png`](./33-vendor-returns.png) | Vendor return review and dispute outcome |
| [`34-vendor-support-widget.png`](./34-vendor-support-widget.png) | Vendor support widget and recent tickets |
| [`35-admin-overview.png`](./35-admin-overview.png) | Administrator dashboard overview |
| [`36-admin-vendor-applications.png`](./36-admin-vendor-applications.png) | Admin vendor application review |
| [`37-admin-commission-settings.png`](./37-admin-commission-settings.png) | Admin commission settings |
| [`38-marketplace-homepage-guest.png`](./38-marketplace-homepage-guest.png) | Guest marketplace homepage |
| [`39-swagger-api-documentation.png`](./39-swagger-api-documentation.png) | Swagger UI API documentation |
| [`40-customer-vendor-messaging.png`](./40-customer-vendor-messaging.png) | Somali-language customer/vendor messaging with a shared product card |
| [`41-mobile-marketplace-homepage.png`](./41-mobile-marketplace-homepage.png) | Mobile Somali-language marketplace homepage |

---

## Capturing Instructions

1. Start the application locally:
   ```bash
   npm run dev
   ```
2. Log in with the appropriate seeded role (Customer, Vendor, or Admin).
3. Navigate to each listed route.
4. Use standard browser developer tools (or screenshot utilities) with device emulation set to `1440x900` at `100%` zoom.
5. Save screenshots into `docs/screenshots/` matching the filenames listed above.
