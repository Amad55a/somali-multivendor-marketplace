import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { MockMobileMoneyAdapter } from "@/features/commerce/payment-adapter";
import { InAppSmsOutboxAdapter } from "@/features/commerce/sms-outbox-adapter";

describe("mock mobile-money adapter", () => {
  it.each(["EVC_PLUS", "ZAAD", "EDAHAB"] as const)("simulates %s success without a provider call", async (method) => {
    const adapter = new MockMobileMoneyAdapter();
    const result = await adapter.initiate({
      method,
      phone: "+252 61 234 5678",
      amount: "12.50",
      currency: "USD",
    });

    expect(result).toMatchObject({
      provider: "MOCK_MOBILE_MONEY",
      status: "SIMULATED_SUCCESS",
      simulated: true,
      failureReason: null,
    });
    expect(result.transactionReference).toMatch(/^MOCK-[A-F0-9]+$/);
    await expect(adapter.getStatus(result.transactionReference)).resolves.toBe("SIMULATED_SUCCESS");
  });

  it("fails test numbers ending in 0000 on the server-side mock", async () => {
    const adapter = new MockMobileMoneyAdapter();
    const result = await adapter.initiate({
      method: "EVC_PLUS",
      phone: "+252 61 234 0000",
      amount: "12.50",
      currency: "USD",
    });

    expect(result.status).toBe("FAILED");
    expect(result.failureReason).toBe("TEST_NUMBER_FAILURE");
  });

  it("records cancellations as simulated adapter results", async () => {
    const adapter = new MockMobileMoneyAdapter();
    const result = await adapter.cancel();

    expect(result).toMatchObject({ status: "CANCELLED", simulated: true, provider: "MOCK_MOBILE_MONEY" });
    await expect(adapter.getStatus(result.transactionReference)).resolves.toBe("CANCELLED");
  });
});

describe("in-app SMS outbox adapter", () => {
  it("only persists a saved-to-outbox status and never reports delivery", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const adapter = new InAppSmsOutboxAdapter();

    await adapter.save(
      { smsOutboxMessage: { createMany } } as never,
      {
        recipient: "+252612345678",
        message: "SIMULATED PAYMENT / NO REAL MONEY TRANSFERRED",
        messageType: "PAYMENT_SUCCESS",
        idempotencyKey: "SMS:PAYMENT_SUCCESS:attempt-1",
      },
    );

    expect(createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        status: "SAVED_TO_OUTBOX",
        deliveryMode: "SIMULATED_OUTBOX",
        messageType: "PAYMENT_SUCCESS",
      })],
      skipDuplicates: true,
    });
  });
});
