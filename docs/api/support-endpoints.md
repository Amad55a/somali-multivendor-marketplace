# Support Ticketing & AI Assistance Endpoints

Somsuuq features a dedicated multi-party support system enabling customers, vendors, and platform administrators to file tickets, attach evidence documents, receive email notifications, and optionally leverage Abuur AI for automated triage.

---

## 1. Customer & Vendor Ticket Filing

### A. Check Support Feature Availability
- **Endpoint:** `GET /api/v1/support/availability`
- **Access:** Authenticated `CUSTOMER` or `VENDOR`
- **Response:** `200 OK { data: { aiAvailable: boolean } }`

### B. Fetch User Ticket Context
- **Endpoint:** `GET /api/v1/support/context`
- **Access:** Authenticated `CUSTOMER` or `VENDOR`
- **Response:** Returns the requester's eligible orders, purchased products, and categories to populate ticket creation drop-downs.

### C. Create Support Ticket
- **Endpoint:** `POST /api/v1/support/tickets`
- **Headers:** `Idempotency-Key: <unique-uuid>`
- **Access:** Authenticated `CUSTOMER` or `VENDOR` (Rate limited: 5 per hour)
- **Request Body:**
  ```json
  {
    "subject": "Delay in delivery for order SOM-1092",
    "description": "Courier has not arrived at my address in Wadajir.",
    "category": "DELIVERY",
    "locale": "en",
    "relatedOrderId": "order-uuid-here"
  }
  ```
- **Response:** `201 Created`
  - Generates a unique ticket `reference` (e.g., `TCK-20261108-004`).
  - Creates the first `support_messages` row.
  - Logs `support_ticket_activities`.
  - Creates an unread `admin_notifications` alert.
  - Queues transactional email in `support_email_deliveries`.

### D. Reply to Ticket
- **Endpoint:** `POST /api/v1/support/tickets/{ticketId}/messages`
- **Headers:** `Idempotency-Key: <unique-uuid>`
- **Access:** Ticket requester or assigned staff.
- **Request Body:** `{ "content": "Thank you, the package was delivered." }`

### E. Upload Private Attachment
- **Endpoint:** `POST /api/v1/support/messages/{messageId}/attachments`
- **Headers:** `Idempotency-Key: <unique-uuid>`
- **Content-Type:** `multipart/form-data` (form field: `file`)
- **Constraints:** Maximum 10 MB. Supported MIME: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. Validates both file extension and magic byte signature.

### F. Download Attachment
- **Endpoint:** `GET /api/v1/support/attachments/{attachmentId}`
- **Access:** Authenticated ticket participant or administrator. Internal-note attachments are strictly staff-only.

---

## 2. Optional Abuur AI Support Integration

Somsuuq integrates with `abuur-ai` SDK (`^0.2.2`) for AI-powered support. The AI service is optional and fails gracefully when unconfigured.

### A. Customer AI Assistance
- **Endpoint:** `POST /api/v1/support/ai`
- **Access:** Authenticated `CUSTOMER` or `VENDOR`
- **Request Body:**
  ```json
  {
    "question": "How do I return a damaged product?",
    "locale": "so",
    "ticketId": "optional-ticket-id"
  }
  ```
- **Behavior:**
  - If `ABUUR_AI_PROVIDER`, `ABUUR_AI_MODEL`, or `ABUUR_AI_API_KEY` are unset, returns `{ "available": false, "answer": null }`.
  - When configured, provides helpful marketplace guidance in English or Somali. Private internal notes are never passed to the customer AI model.

### B. Admin Ticket AI Triage
- **Endpoint:** `POST /api/v1/admin/support/tickets/{ticketId}/ai`
- **Access:** Authenticated `ADMIN`
- **Request Body:**
  ```json
  {
    "action": "SUMMARY",
    "locale": "en"
  }
  ```
- **Supported Actions:**
  - `SUMMARY`: Summarizes the conversation and customer complaint.
  - `DRAFT_REPLY`: Prepares an advisory suggested reply for human staff review.
  - `TRIAGE`: Evaluates priority and category recommendation.
- **Safety Rule:** AI suggestions are advisory only and never directly modify ticket state without administrative confirmation.

---

## 3. Administrative Support Inbox Endpoints

| Method & Route | Access | Purpose |
|---|---|---|
| `GET /api/v1/admin/support/tickets` | Admin | Searchable, paginated ticket inbox with filters (`status`, `priority`, `category`, `requesterRole`) |
| `GET /api/v1/admin/support/tickets/{ticketId}` | Admin | Full conversation thread, including internal staff notes, attachments, and activity history |
| `PATCH /api/v1/admin/support/tickets/{ticketId}` | Admin | Updates status (`IN_PROGRESS`, `RESOLVED`, `CLOSED`), priority, or assigns staff (`assignedToId`) |
| `POST /api/v1/admin/support/tickets/{ticketId}/messages` | Admin | Appends a public reply to the customer or saves a private `internalNote: true` |
| `POST /api/v1/admin/support/tickets/{ticketId}/email-deliveries/{deliveryId}/retry` | Admin | Retries a failed or pending transactional resolution email |
