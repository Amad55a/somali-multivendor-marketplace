import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/config/env", () => ({ getAbuurAIConfig: vi.fn() }));
vi.mock("abuur-ai", () => ({ abuurAI: vi.fn() }));

import { abuurAI } from "abuur-ai";
import { getAbuurAIConfig } from "@/config/env";
import { requestAbuurAI } from "@/features/ai/abuur-ai-service";
import { createSupportTranscript, sanitizeSupportAIText } from "@/features/support/ai-context";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("optional Abuur AI support", () => {
  it("reports unavailable when provider configuration is absent", async () => {
    vi.mocked(getAbuurAIConfig).mockReturnValue({ available: false });

    await expect(
      requestAbuurAI({ text: "How do I contact support?", locale: "en" }),
    ).resolves.toEqual({ available: false });
    expect(abuurAI).not.toHaveBeenCalled();
  });

  it("surfaces provider failure without logging prompts or credentials", async () => {
    vi.mocked(getAbuurAIConfig).mockReturnValue({
      available: true,
      provider: "ollama",
      model: "configured-test-model",
    });
    vi.mocked(abuurAI).mockReturnValue({
      weydii: vi.fn().mockRejectedValue(new Error("provider failure")),
      sooKoob: vi.fn().mockRejectedValue(new Error("provider failure")),
    } as never);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      requestAbuurAI({
        text: "private support prompt",
        locale: "so",
      }),
    ).rejects.toMatchObject({
      code: "AI_PROVIDER_UNAVAILABLE",
      status: 503,
    });
    expect(log).toHaveBeenCalledWith(
      "[support-ai] Provider request failed",
      expect.objectContaining({ provider: "ollama", errorName: "Error" }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain("private support prompt");
  });
});

describe("support AI privacy boundary", () => {
  it("redacts contact details, identifiers, and tokens", () => {
    const cleaned = sanitizeSupportAIText(
      "Contact a@example.com at +252 61 234 5678. " +
        "id 807c363a-20a5-4db4-bf03-7ae5bf51a9d2 Bearer abcdefghijklmnopqrstuvwxyz0123456789",
    );
    expect(cleaned).not.toContain("a@example.com");
    expect(cleaned).not.toContain("+252 61 234 5678");
    expect(cleaned).not.toContain("807c363a-20a5-4db4-bf03-7ae5bf51a9d2");
    expect(cleaned).not.toContain("abcdefghijklmnopqrstuvwxyz0123456789");
  });

  it("keeps internal notes out of public AI transcript context", () => {
    const messages = [
      { senderRole: "CUSTOMER", internalNote: false, content: "My delivery is late." },
      { senderRole: "ADMIN", internalNote: true, content: "Private review note." },
    ];

    expect(createSupportTranscript(messages, false)).toContain("My delivery is late.");
    expect(createSupportTranscript(messages, false)).not.toContain("Private review note.");
    expect(createSupportTranscript(messages, true)).toContain("Private review note.");
  });
});
