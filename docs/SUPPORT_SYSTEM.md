# Support System & Abuur AI Integration

This document outlines the support ticketing system, attachment handling, staff triage workflows, and optional Abuur AI integration in Somsuuq.

---

## 1. Multi-Party Support Architecture

The Somsuuq support system allows both customers and vendors to submit inquiries, dispute resolutions, or technical tickets directly to the platform administration team.

```mermaid
flowchart TD
    Customer["Customer / Vendor"] -->|POST /support/tickets| TicketAPI[Support Service]
    TicketAPI -->|Store Ticket & First Message| DB[(PostgreSQL)]
    TicketAPI -->|Queue Notification| AdminQueue[Admin Notifications]
    TicketAPI -->|Record Delivery| EmailQueue[support_email_deliveries]
    
    AdminUser["Support Staff / Admin"] -->|GET /admin/support/tickets| AdminInbox[Admin Support Console]
    AdminInbox -->|Add Staff Note (internalNote: true)| PrivateMsg[Private Internal Note]
    AdminInbox -->|Public Reply| PublicMsg[Public Message to User]
    AdminInbox -->|Request AI Triage| AIModule[Abuur AI Service]
    AIModule -->|Advisory Triage / Summary| AdminInbox
    AdminInbox -->|PATCH Status to RESOLVED| ResolveAction[Ticket Resolved]
    ResolveAction -->|Trigger Email| EmailQueue
```

---

## 2. Ticket Status & Lifecycle

- `OPEN`: Ticket submitted and awaiting administrative review.
- `IN_PROGRESS`: A staff member has been assigned (`assignedToId`) and is actively investigating.
- `WAITING_FOR_CUSTOMER`: Staff requested additional information from the customer.
- `WAITING_FOR_VENDOR`: Staff requested clarification from the merchant.
- `RESOLVED`: Solution provided. Generates transactional resolution email.
- `CLOSED`: Final archived state. No further replies permitted.

---

## 3. Attachment Security & Validation

Files uploaded to support messages (`POST /api/v1/support/messages/{id}/attachments`) pass through rigorous validation in `src/lib/media/vendor-files.ts`:
1. **Size Limit:** Maximum 10 MB per file.
2. **Magic Bytes Signature Check:** Validates that the underlying byte headers correspond to valid JPEG (`FF D8 FF`), PNG (`89 50 4E 47`), WebP (`RIFF...WEBP`), or PDF (`25 50 44 46`). Renamed malicious executables are immediately rejected.
3. **Private Access Control:** Files are stored outside the public web root (`.data/vendor-files/`). Authorized downloads require session authentication verifying that the requester is a ticket participant or platform administrator. Internal-note attachments are strictly inaccessible to regular customers or vendors.

---

## 4. Optional Abuur AI Support Integration

Somsuuq integrates with the `abuur-ai` SDK (`^0.2.2`), a unified client for LLM providers (including OpenAI, Google Gemini, Anthropic, Mistral, Ollama, and Perplexity).

### Configuration (`.env`):
```env
ABUUR_AI_PROVIDER="openai" # or "gemini", "anthropic", "ollama", etc.
ABUUR_AI_MODEL="gpt-4o"
ABUUR_AI_API_KEY="your-api-key"
```

### Safety & Graceful Degradation:
- **Zero Hard Dependency:** If AI credentials are not provided or remain placeholders, the support system operates normally with `aiAvailable: false`.
- **Customer AI Safety:** Customer-facing AI responses only reference public marketplace policies and ticket context; internal staff notes are never passed to the LLM.
- **Admin AI Advisory Role:** AI-generated ticket summaries or suggested replies require human approval before being communicated to users.
