import "server-only";

import { randomBytes } from "node:crypto";
import type { SimulatedPaymentMethod } from "../../../generated/prisma/client";

export type PaymentAdapterStatus =
  | "PENDING"
  | "SIMULATED_SUCCESS"
  | "FAILED"
  | "CANCELLED";

export type PaymentAdapterResult = {
  provider: "MOCK_MOBILE_MONEY";
  transactionReference: string;
  status: Exclude<PaymentAdapterStatus, "PENDING">;
  failureReason: string | null;
  simulated: true;
};

export type InitiatePaymentInput = {
  method: SimulatedPaymentMethod;
  phone: string;
  amount: string;
  currency: string;
};

export interface MobileMoneyPaymentAdapter {
  initiate(input: InitiatePaymentInput): Promise<PaymentAdapterResult>;
  getStatus(transactionReference: string): Promise<PaymentAdapterStatus>;
  cancel(transactionReference?: string): Promise<PaymentAdapterResult>;
}

export class MockMobileMoneyAdapter implements MobileMoneyPaymentAdapter {
  private readonly statuses = new Map<string, PaymentAdapterStatus>();

  async initiate(input: InitiatePaymentInput): Promise<PaymentAdapterResult> {
    const digits = input.phone.replace(/\D/g, "");
    const status = digits.endsWith("0000") ? "FAILED" : "SIMULATED_SUCCESS";
    const transactionReference = `MOCK-${randomBytes(12).toString("hex").toUpperCase()}`;
    const result: PaymentAdapterResult = {
      provider: "MOCK_MOBILE_MONEY",
      transactionReference,
      status,
      failureReason: status === "FAILED" ? "TEST_NUMBER_FAILURE" : null,
      simulated: true,
    };
    this.statuses.set(transactionReference, status);
    return result;
  }

  async getStatus(transactionReference: string): Promise<PaymentAdapterStatus> {
    return this.statuses.get(transactionReference) ?? "PENDING";
  }

  async cancel(transactionReference?: string): Promise<PaymentAdapterResult> {
    const reference = transactionReference ?? `MOCK-${randomBytes(12).toString("hex").toUpperCase()}`;
    const result: PaymentAdapterResult = {
      provider: "MOCK_MOBILE_MONEY",
      transactionReference: reference,
      status: "CANCELLED",
      failureReason: null,
      simulated: true,
    };
    this.statuses.set(reference, result.status);
    return result;
  }
}

export const mobileMoneyPaymentAdapter: MobileMoneyPaymentAdapter =
  new MockMobileMoneyAdapter();
