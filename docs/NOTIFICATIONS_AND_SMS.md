# Notifications & SMS Outbox Architecture

This document describes the in-app notification engine, transactional email delivery, and simulated SMS message recording in Somsuuq.

---

## 1. In-App Notification System

Somsuuq maintains dedicated, role-segregated notification queues in PostgreSQL:

| Notification Table | Recipient Role | Key Event Triggers |
|---|---|---|
| `customer_notifications` | `CUSTOMER` | Order placed, vendor confirmed order, sub-order shipped, delivery confirmed, return approved, refund processed. |
| `vendor_notifications` | `VENDOR` | New sub-order assigned, delivery confirmed by buyer, return requested, commission rule updated, weekly payout approved. |
| `admin_notifications` | `ADMIN` | New vendor onboarding application submitted, merchant profile change requested, return escalated to dispute, support ticket filed. |

### Technical Characteristics:
- **Deduplication:** Each notification row features a unique `dedupeKey` (e.g., `vendor_order_confirmed:uuid`) preventing duplicate notifications on retried operations.
- **Bilingual Delivery:** Stores both English (`title`, `body`) and Somali (`titleSo`, `bodySo`) translations.
- **Client Polling & Badges:** Navbars display real-time unread badges that update periodically and clear when marked read (`POST .../notifications/read`).

---

## 2. Transactional Email Delivery (SMTP)

Transactional emails are dispatched using `nodemailer` (`^10.3.1`) configured via environment variables (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`):

- **Customer & Vendor Lifecycle:** Email verification OTP, password recovery OTP.
- **Vendor Onboarding:** Application submitted, changes requested, store approved, application rejected. Recorded in `vendor_application_emails`.
- **Support System:** Ticket creation confirmation, ticket resolution notice. Recorded in `support_email_deliveries`.

> [!NOTE]
> When SMTP is not configured in local development, email verification codes are output directly to server console logs for developer convenience.

---

## 3. Simulated SMS Outbox

Somsuuq includes a fully structured SMS notification recording system modeled after Somali mobile-money and parcel notification habits:

- **Storage Table:** `sms_outbox_messages`
- **Fields:** `recipient` (phone number), `message` (bilingual SMS text), `messageType` (`PAYMENT_CONFIRMATION`, `ORDER_DISPATCHED`, `DELIVERY_OTP`), `status` (`SAVED_TO_OUTBOX`).
- **Explicit Simulation Notice:**  
  The application does **not** call an external telecom SMS gateway (such as Hormuud, Telesom, or Golis SMS APIs). All SMS records are saved locally in the database outbox for inspection and testing. The column `deliveryMode` is explicitly set to `"SIMULATED_OUTBOX"`.

### Admin SMS Outbox Inspector:
Administrators can inspect all recorded SMS messages via `GET /api/v1/admin/sms-outbox`, with filtering by phone number, message type, date range, and pagination.
