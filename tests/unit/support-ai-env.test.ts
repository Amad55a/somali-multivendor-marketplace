import { afterEach, describe, expect, it } from "vitest";
import { getAbuurAIConfig } from "@/config/env";

const variableNames = [
  "ABUUR_AI_PROVIDER",
  "ABUUR_AI_MODEL",
  "ABUUR_AI_API_KEY",
] as const;
const originalValues = Object.fromEntries(
  variableNames.map((name) => [name, process.env[name]]),
);

afterEach(() => {
  for (const name of variableNames) {
    const original = originalValues[name];
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  }
});

describe("optional support AI configuration", () => {
  it("stays unavailable when configuration is absent or contains a placeholder key", () => {
    for (const name of variableNames) delete process.env[name];
    expect(getAbuurAIConfig()).toEqual({ available: false });

    process.env.ABUUR_AI_PROVIDER = "gemini";
    process.env.ABUUR_AI_MODEL = "gemini-2.5-flash";
    process.env.ABUUR_AI_API_KEY = "YOUR_GEMINI_API_KEY";
    expect(getAbuurAIConfig()).toEqual({ available: false });
  });

  it("allows Ollama without an API key and hosted providers with a real key", () => {
    process.env.ABUUR_AI_PROVIDER = "ollama";
    process.env.ABUUR_AI_MODEL = "llama3";
    delete process.env.ABUUR_AI_API_KEY;
    expect(getAbuurAIConfig()).toEqual({
      available: true,
      provider: "ollama",
      model: "llama3",
    });

    process.env.ABUUR_AI_PROVIDER = "gemini";
    process.env.ABUUR_AI_MODEL = "gemini-2.5-flash";
    process.env.ABUUR_AI_API_KEY = "unit-test-api-key";
    expect(getAbuurAIConfig()).toEqual({
      available: true,
      provider: "gemini",
      model: "gemini-2.5-flash",
      apiKey: "unit-test-api-key",
    });
  });
});
