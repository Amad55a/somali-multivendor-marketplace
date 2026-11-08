import type {
  AccountType,
  SupportTicketStatus,
} from "../../../generated/prisma/client";

export function requesterReplyStatus(
  status: SupportTicketStatus,
): SupportTicketStatus | undefined {
  return status === "RESOLVED" ||
    status === "WAITING_FOR_CUSTOMER" ||
    status === "WAITING_FOR_VENDOR"
    ? "IN_PROGRESS"
    : undefined;
}

export function adminReplyStatus(
  requesterRole: AccountType,
): SupportTicketStatus | undefined {
  if (requesterRole === "CUSTOMER") return "WAITING_FOR_CUSTOMER";
  if (requesterRole === "VENDOR") return "WAITING_FOR_VENDOR";
  return undefined;
}

export function supportTicketCreatedNotificationKey(ticketId: string) {
  return `support-ticket-created:${ticketId}`;
}

export function supportMessageNotificationKey(messageId: string) {
  return `support-message:${messageId}`;
}

export function supportStatusNotificationKey(
  ticketId: string,
  from: SupportTicketStatus,
  to: SupportTicketStatus,
  updatedAt: Date,
) {
  return `support-status:${ticketId}:${from}:${to}:${updatedAt.toISOString()}`;
}
