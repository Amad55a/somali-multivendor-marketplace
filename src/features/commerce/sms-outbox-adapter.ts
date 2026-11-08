import "server-only";

import type { Prisma } from "../../../generated/prisma/client";

type SmsOutboxClient = Pick<Prisma.TransactionClient, "smsOutboxMessage">;
export type SmsOutboxInput = {
  recipient: string;
  message: string;
  messageType: string;
  relatedUserId?: string;
  orderId?: string;
  paymentAttemptId?: string;
  idempotencyKey: string;
};

export interface SmsOutboxAdapter {
  save(client: SmsOutboxClient, input: SmsOutboxInput): Promise<void>;
}

export class InAppSmsOutboxAdapter implements SmsOutboxAdapter {
  async save(client: SmsOutboxClient, input: SmsOutboxInput) {
    await client.smsOutboxMessage.createMany({
      data: [{
        recipient: input.recipient,
        message: input.message,
        messageType: input.messageType,
        relatedUserId: input.relatedUserId,
        orderId: input.orderId,
        paymentAttemptId: input.paymentAttemptId,
        idempotencyKey: input.idempotencyKey,
        status: "SAVED_TO_OUTBOX",
        deliveryMode: "SIMULATED_OUTBOX",
      }],
      skipDuplicates: true,
    });
  }
}

export const smsOutboxAdapter: SmsOutboxAdapter = new InAppSmsOutboxAdapter();

export function bilingualSms(english: string, somali: string) {
  return `EN: ${english} | SO: ${somali}`;
}

export function maskMobileNumber(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}
