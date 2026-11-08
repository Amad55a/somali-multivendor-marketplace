const MAX_TRANSCRIPT_CHARACTERS = 10_000;

export function sanitizeSupportAIText(value: string): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted email]")
    .replace(/(?<!\w)\+?\d[\d\s().-]{6,}\d(?!\w)/g, "[redacted phone]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "[redacted identifier]")
    .replace(/\b(?:bearer\s+)?[A-Za-z0-9_-]{32,}\b/gi, "[redacted token]")
    .replace(/\s+/g, " ")
    .trim();
}

export function createSupportTranscript(
  messages: ReadonlyArray<{
    senderRole: string;
    internalNote: boolean;
    content: string;
  }>,
  includeInternalNotes: boolean,
): string {
  const entries = messages
    .filter((message) => includeInternalNotes || !message.internalNote)
    .slice(-12)
    .map(
      (message) =>
        `${message.internalNote ? "Internal support note" : message.senderRole}: ${sanitizeSupportAIText(message.content).slice(0, 1_200)}`,
    );
  return entries.join("\n").slice(-MAX_TRANSCRIPT_CHARACTERS);
}
