export function assertDictionaryParity(
  reference: unknown,
  candidate: unknown,
  path = "dictionary",
): void {
  if (reference === null) {
    if (candidate !== null) {
      throw new Error(`Translation structure differs at ${path}`);
    }
    return;
  }

  if (typeof reference === "string") {
    if (typeof candidate !== "string" || candidate.trim() === "") {
      throw new Error(`Missing translation at ${path}`);
    }
    return;
  }

  if (Array.isArray(reference)) {
    if (!Array.isArray(candidate) || reference.length !== candidate.length) {
      throw new Error(`Translation entries differ at ${path}`);
    }

    reference.forEach((value, index) =>
      assertDictionaryParity(value, candidate[index], `${path}[${index}]`),
    );
    return;
  }

  if (
    typeof reference !== "object" ||
    reference === null ||
    typeof candidate !== "object" ||
    candidate === null ||
    Array.isArray(candidate)
  ) {
    throw new Error(`Translation structure differs at ${path}`);
  }

  const referenceEntries = Object.entries(reference);
  const referenceKeys = referenceEntries.map(([key]) => key).sort();
  const candidateKeys = Object.keys(candidate).sort();

  if (
    referenceKeys.length !== candidateKeys.length ||
    referenceKeys.some((key, index) => key !== candidateKeys[index])
  ) {
    throw new Error(`Translation keys differ at ${path}`);
  }

  for (const [key, value] of referenceEntries) {
    assertDictionaryParity(
      value,
      (candidate as Record<string, unknown>)[key],
      `${path}.${key}`,
    );
  }
}
