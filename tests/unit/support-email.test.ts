import { describe, expect, it } from "vitest";
import { createSupportEmail } from "@/features/auth/email-templates";

describe("support email templates", () => {
  const createdAt = new Date("2026-11-07T07:41:00.000Z");

  it("creates an English ticket-received email with a text alternative and ticket link", () => {
    const message = createSupportEmail({
      event: "TICKET_CREATED",
      locale: "en",
      reference: "SSQ-261107-ABC123",
      subject: "Order needs support",
      ticketUrl: "https://somsuuq.example/en/customer/help/tickets/ticket-id",
      createdAt,
      displayName: "Amina",
    });

    expect(message.subject).toContain("SSQ-261107-ABC123");
    expect(message.text).toContain("received your request");
    expect(message.text).toContain("Order needs support");
    expect(message.text).toContain("November 7, 2026");
    expect(message.text).toContain("/en/customer/help/tickets/ticket-id");
    expect(message.html).toContain('lang="en"');
    expect(message.html).toContain("Somsuuq");
  });

  it("creates a Somali resolution email that explains replies can reopen the ticket", () => {
    const message = createSupportEmail({
      event: "TICKET_RESOLVED",
      locale: "so",
      reference: "SSQ-261107-ABC123",
      subject: "Dalabkeyga",
      ticketUrl: "https://somsuuq.example/so/vendor/help/tickets/ticket-id",
      createdAt,
      displayName: null,
    });

    expect(message.subject).toContain("SSQ-261107-ABC123");
    expect(message.text).toContain("xalliyey");
    expect(message.text).toContain("mar kale u furmo");
    expect(message.text).toContain("Xaaladda");
    expect(message.html).toContain('lang="so"');
    expect(message.html).toContain("/so/vendor/help/tickets/ticket-id");
  });

  it("escapes untrusted ticket subjects and links in HTML", () => {
    const message = createSupportEmail({
      event: "TICKET_CREATED",
      locale: "en",
      reference: "SSQ-261107-ABC123",
      subject: '<img src=x onerror="alert(1)">',
      ticketUrl: 'https://somsuuq.example/ticket?a="bad"',
      createdAt,
      displayName: "<script>alert(1)</script>",
    });

    expect(message.html).not.toContain('<img src=x');
    expect(message.html).not.toContain('<script>');
    expect(message.html).toContain("&lt;img");
    expect(message.html).toContain("&quot;bad&quot;");
  });
});
