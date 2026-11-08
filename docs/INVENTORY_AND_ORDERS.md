# Inventory Management & Order Fulfillment Architecture

This document explains the inventory reservation engine, the multi-vendor order structure, and the merchant fulfillment process in Somsuuq.

---

## 1. 10-Minute Optimistic Stock Reservation

To prevent overselling and inventory race conditions without blocking cart browsing, Somsuuq employs an atomic stock reservation system:

```mermaid
sequenceDiagram
    autonumber
    actor Customer
    participant API as Somsuuq Checkout API
    participant DB as PostgreSQL

    Customer->>API: POST /checkout/reserve
    API->>DB: BEGIN TRANSACTION
    API->>DB: Query current variant stock: (stockQuantity - activeReservedStock)
    alt Stock Available >= Cart Quantity
        API->>DB: INSERT INTO stock_reservations (expiresAt = NOW() + 10m)
        API->>DB: INSERT INTO stock_reservation_items
        API->>DB: COMMIT
        API-->>Customer: 200 OK { reservationId, expiresAt }
    else Stock Insufficient
        API->>DB: ROLLBACK
        API-->>Customer: 409 Conflict { code: "OUT_OF_STOCK" }
    end

    alt Customer Pays Within 10 Minutes
        Customer->>API: POST /checkout/pay { reservationId, method, phone }
        API->>DB: BEGIN TRANSACTION
        API->>DB: Verify reservation still ACTIVE & expiresAt > NOW()
        API->>DB: Decrement product_variants.stockQuantity
        API->>DB: UPDATE stock_reservations SET status = 'CONVERTED'
        API->>DB: Create MarketplaceOrder & VendorOrders
        API->>DB: COMMIT
        API-->>Customer: 200 OK { orderNumber, receiptNumber }
    else Customer Aborts or Timer Expires
        Note over Customer,DB: Reservation marked RELEASED or EXPIRED by Cron
        Note over Customer,DB: Locked stock immediately returns to available pool
    end
```

---

## 2. Parent Orders vs Vendor Sub-Orders

In a multi-vendor marketplace, a single customer order often contains items from multiple merchants located in different markets or cities across Somalia.

```mermaid
flowchart TD
    MarketplaceOrder["Parent: MarketplaceOrder<br/>OrderNumber: SOM-20261108-001<br/>Total: $85.00"]
    MarketplaceOrder --> VendorOrder1["Child: VendorOrder 1 (Mogadishu Tech)<br/>Subtotal: $50.00 + Delivery: $3.50<br/>Status: CONFIRMED"]
    MarketplaceOrder --> VendorOrder2["Child: VendorOrder 2 (Hargeisa Fabrics)<br/>Subtotal: $30.00 + Delivery: $1.50<br/>Status: PROCESSING"]
    
    VendorOrder1 --> Line1["OrderLine: Dual-SIM Phone (x1)"]
    VendorOrder2 --> Line2["OrderLine: Traditional Dirac Fabric (x1)"]
```

### Advantages of the Split Architecture:
1. **Isolated Fulfillment:** Each merchant manages only their portion of the order (`VendorOrder`). A delay by one merchant does not stall fulfillment by others.
2. **24-Hour Confirmation Deadline:** Each `VendorOrder` carries a `confirmBy` timestamp 24 hours from creation. If a merchant fails to confirm within 24 hours, the sub-order expires, protecting the customer.
3. **Independent Courier Tracking:** Merchants can assign their own courier and tracking number per sub-order.
4. **Line-Specific Returns:** Customers can request returns for individual items (`OrderLine`) without returning the entire multi-vendor order.
