# Financial & Commerce Endpoints Guide

Somsuuq implements a multi-vendor double-entry financial ledger that manages commissions, discounts, delivery fees, simulated mobile-money checkouts, refunds, weekly payout batches, and financial reconciliation.

---

## 1. Checkout & Simulated Payment Endpoints

### A. 10-Minute Cart Reservation
- **Endpoint:** `POST /api/v1/checkout/reserve`
- **Access:** Authenticated `CUSTOMER`
- **Behavior:** Locks cart stock for 10 minutes. Generates a `StockReservation` record.
- **Response:** `200 OK`
  ```json
  {
    "data": {
      "reservationId": "f7b11d9a-...",
      "expiresAt": "2026-11-08T20:45:00.000Z",
      "serverNow": "2026-11-08T20:35:00.000Z",
      "items": [
        { "variantId": "...", "quantity": 1, "unitPrice": "25.00" }
      ]
    }
  }
  ```

### B. Checkout Quote Calculation
- **Endpoint:** `POST /api/v1/checkout/quote`
- **Access:** Authenticated `CUSTOMER`
- **Request Body:**
  ```json
  {
    "reservationId": "f7b11d9a-...",
    "platformCoupon": "SOMALIA10",
    "vendorCoupons": {
      "vendor-uuid-1": "STORE5"
    }
  }
  ```
- **Behavior:** Recalculates discounts server-side. Vendor coupons are applied first to vendor lines; platform coupons are applied across the order. Combined discounts are capped at merchandise subtotal.

### C. Simulated Mobile Money Payment
- **Endpoint:** `POST /api/v1/checkout/pay`
- **Access:** Authenticated `CUSTOMER` (with reCAPTCHA token)
- **Request Body:**
  ```json
  {
    "reservationId": "f7b11d9a-...",
    "method": "EVC_PLUS",
    "phone": "+252615000001",
    "deliveryName": "Ahmed Shir",
    "deliveryPhone": "+252615000001",
    "deliveryAddress": "Wadajir District",
    "deliveryCity": "Mogadishu",
    "deliveryRegion": "Banaadir",
    "idempotencyKey": "pay-attempt-uuid-001",
    "recaptchaToken": "..."
  }
  ```
- **Simulation Behavior:**
  - Phone numbers ending in `0000` deterministically trigger a simulated failure (`SIMULATED_FAIL`).
  - All other numbers succeed, atomically creating the parent `MarketplaceOrder`, child `VendorOrder` records, converting the stock reservation, issuing a `PaymentReceipt`, and creating an `SmsOutboxMessage`.
- **Response:** `200 OK`
  ```json
  {
    "data": {
      "orderId": "...",
      "orderNumber": "SOM-20261108-001",
      "receiptNumber": "RCP-20261108-001",
      "simulated": true
    }
  }
  ```

### D. Cancel Reservation
- **Endpoint:** `POST /api/v1/checkout/cancel`
- **Access:** Authenticated `CUSTOMER`
- **Behavior:** Releases locked stock back to available inventory.

---

## 2. Vendor Financial Management Endpoints

### A. Vendor Financial Statement
- **Endpoint:** `GET /api/v1/vendor/payouts`
- **Access:** Authenticated approved `VENDOR`
- **Query Params:** `from?`, `to?`, `limit?`, `cursor?`
- **Response:** `200 OK`
  ```json
  {
    "data": {
      "summary": {
        "grossSales": "1450.00",
        "platformCommission": "145.00",
        "vendorDiscounts": "20.00",
        "refunds": "0.00",
        "netEarnings": "1285.00",
        "availableBalance": "350.00",
        "pendingPayout": "935.00"
      },
      "transactions": [
        {
          "id": "...",
          "type": "SALE",
          "amount": "120.00",
          "orderNumber": "SOM-...",
          "createdAt": "..."
        }
      ]
    }
  }
  ```

### B. Vendor Delivery Fee Configuration
- **Endpoint:** `POST /api/v1/vendor/delivery-fee`
- **Access:** Authenticated approved `VENDOR`
- **Request Body:** `{ "fee": "3.50" }`
- **Response:** `200 OK` with updated `fee`.

---

## 3. Platform Commission Administration Endpoints

### A. Global Default Commission
- **Get Settings:** `GET /api/v1/admin/commission-settings`
- **Update Default:** `POST /api/v1/admin/commission-settings`
  - Body: `{ "percent": "10.00" }`
  - Records an audit event and updates `commission_settings`.

### B. Category-Specific Commission Rules
- **List Rules:** `GET /api/v1/admin/commissions`
- **Create/Update Rule:** `POST /api/v1/admin/commissions`
  - Body: `{ "categoryId": "...", "percent": "12.00", "isActive": true }`
  - Records historical audit in `category_commission_history`.
  - Child categories automatically inherit the parent category's rate unless overridden.

---

## 4. Payout Batch & Settlement Endpoints

### A. Preview Weekly Payout Balances
- **Endpoint:** `GET /api/v1/admin/payouts/preview?holdDays=7`
- **Access:** Authenticated `ADMIN`
- **Behavior:** Aggregates eligible settled orders delivered past the hold period (default 7 days). Excludes open returns or pending disputes.

### B. List Payout Batches
- **Endpoint:** `GET /api/v1/admin/payouts`
- **Access:** Authenticated `ADMIN`
- **Response:** List of historical weekly batches with breakdown of vendor amounts.

### C. Create Weekly Payout Batch
- **Endpoint:** `POST /api/v1/admin/payouts/batches`
- **Access:** Authenticated `ADMIN`
- **Request Body:** `{ "holdDays": 7 }`
- **Response:** `201 Created` with pending batch.

### D. Approve & Execute Payout Batch
- **Endpoint:** `POST /api/v1/admin/payouts/batches/{batchId}/approve`
- **Access:** Authenticated `ADMIN`
- **Behavior:** Iterates through vendor payouts in the batch, updates status to `SIMULATED_PAID`, generates corresponding `LedgerEntry` rows of type `PAYOUT`, and links allocations.

### E. Retry Failed Vendor Payout
- **Endpoint:** `POST /api/v1/admin/payouts/{payoutId}/retry`
- **Access:** Authenticated `ADMIN`
- **Request Body:** `{ "holdDays": 7 }`

### F. Cancel Payout Batch
- **Endpoint:** `POST /api/v1/admin/payouts/batches/{batchId}/cancel`
- **Access:** Authenticated `ADMIN`
- **Behavior:** Releases allocated ledger entries back to vendor available balances.

---

## 5. Financial Reconciliation Endpoint

### Compare Ledger vs Paid Orders
- **Endpoint:** `GET /api/v1/admin/financial-reconciliation`
- **Access:** Authenticated `ADMIN`
- **Behavior:** Runs comprehensive reconciliation query verifying:
  1. `SUM(MarketplaceOrder.totalAmount)` vs `SUM(PaymentRecord.amount)`
  2. Paid delivered orders vs `LedgerEntry(SALE)`
  3. Calculated commissions vs `LedgerEntry(COMMISSION)`
  4. Processed return refunds vs `LedgerEntry(REFUND)`
  5. Total payouts vs `LedgerEntry(PAYOUT)`
- **Response:**
  ```json
  {
    "data": {
      "status": "BALANCED",
      "totalCaptured": "15420.00",
      "totalDelivered": "14200.00",
      "totalCommissions": "1420.00",
      "totalRefunds": "250.00",
      "totalPayoutsPaid": "11500.00",
      "outstandingVendorLiabilities": "1030.00",
      "discrepancies": []
    }
  }
  ```
