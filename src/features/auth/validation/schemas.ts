import { z } from "zod";

export const customerOrVendorSchema = z.enum(["CUSTOMER", "VENDOR"]);
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
export function getPasswordRequirements(password: string) {
  return {
    length: password.length >= 12,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9\s]/.test(password),
  };
}

export function getPasswordStrength(
  password: string,
): "weak" | "medium" | "strong" {
  const requirements = getPasswordRequirements(password);
  if (!Object.values(requirements).every(Boolean)) return "weak";

  const uniqueCharacters = new Set(password).size;
  const predictablePattern =
    /(.)\1{3,}|password|qwerty|1234|abcd/i.test(password);
  if (password.length >= 16 && uniqueCharacters >= 10 && !predictablePattern) {
    return "strong";
  }
  if (password.length >= 14 && uniqueCharacters >= 8 && !predictablePattern) {
    return "medium";
  }
  return "weak";
}

export const passwordSchema = z
  .string()
  .min(12)
  .max(128)
  .refine(
    (password) => Object.values(getPasswordRequirements(password)).every(Boolean),
    "Password must include uppercase and lowercase letters, a number, and a symbol.",
  )
  .describe(
    "12-128 characters; must include uppercase and lowercase letters, a number, and a symbol.",
  );
export const emailCodeSchema = z.string().regex(/^\d{6}$/);
export const adminCodeSchema = z
  .string()
  .regex(/^(?:\d{6}|[A-Fa-f0-9]{8}(?:-[A-Fa-f0-9]{8}){3})$/);
export const adminTotpCodeSchema = z.string().regex(/^\d{6}$/);
export const challengeIdSchema = z.string().min(40).max(64);

export const registrationSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(128),
    accountType: customerOrVendorSchema,
  })
  .strict();

export const emailAccountSchema = z
  .object({
    email: emailSchema,
    accountType: customerOrVendorSchema,
  })
  .strict();

export const verifyEmailSchema = z.object({ code: emailCodeSchema }).strict();

export const resetPasswordSchema = emailAccountSchema
  .extend({ code: emailCodeSchema, newPassword: passwordSchema })
  .strict();

export const adminLoginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(128),
  })
  .strict();

export const adminEmailCodeSchema = z
  .object({
    email: emailSchema,
    code: emailCodeSchema,
  })
  .strict();

export const adminChallengeSchema = z
  .object({
    challengeId: challengeIdSchema,
    code: adminCodeSchema,
  })
  .strict();

export const adminMfaEnableSchema = z
  .object({
    challengeId: challengeIdSchema,
    code: adminTotpCodeSchema,
  })
  .strict();

export const adminMfaSetupSchema = z
  .object({
    challengeId: challengeIdSchema,
    secret: z.string().regex(/^[A-Z2-7]{32,64}$/),
  })
  .strict();

export const applicationFieldsSchema = z
  .object({
    businessName: z.string().trim().min(2).max(200).optional(),
    storeName: z.string().trim().min(2).max(120).optional(),
    businessType: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().max(2000).optional(),
    contactName: z.string().trim().min(2).max(160).optional(),
    phone: z.string().trim().min(5).max(32).optional(),
    country: z.string().trim().min(2).max(100).optional(),
    region: z.string().trim().min(2).max(100).optional(),
    city: z.string().trim().min(2).max(100).optional(),
    address: z.string().trim().max(300).optional(),
    marketAssociation: z.string().trim().max(200).optional(),
  })
  .strict();

export const applicationPatchSchema = applicationFieldsSchema.refine(
  (value) => Object.keys(value).length > 0,
);

export const approveApplicationSchema = z
  .object({ note: z.string().trim().max(1000).optional() })
  .strict();

export const rejectApplicationSchema = z
  .object({ reason: z.string().trim().min(3).max(1000) })
  .strict();

export const requestInformationSchema = z
  .object({ message: z.string().trim().min(3).max(1000) })
  .strict();

export const suspendVendorSchema = rejectApplicationSchema;

export const vendorApplicationStatusSchema = z.enum([
  "DRAFT",
  "PENDING",
  "UNDER_REVIEW",
  "NEEDS_INFORMATION",
  "APPROVED",
  "REJECTED",
  "SUSPENDED",
]);

export const applicationListQuerySchema = z
  .object({
    status: vendorApplicationStatusSchema.optional(),
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
