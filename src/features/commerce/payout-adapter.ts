import "server-only";

export type PayoutAdapterRequest = {
  payoutId: string;
  vendorId: string;
  amount: string;
  currency: string;
  idempotencyKey: string;
};

export type PayoutAdapterResult = {
  status: "SIMULATED_PAID" | "FAILED";
  failureReason: string | null;
  simulated: true;
};

export interface PayoutAdapter {
  processPayout(input: PayoutAdapterRequest): Promise<PayoutAdapterResult>;
}

export const simulatedPayoutAdapter: PayoutAdapter = {
  async processPayout() {
    return { status: "SIMULATED_PAID", failureReason: null, simulated: true };
  },
};
