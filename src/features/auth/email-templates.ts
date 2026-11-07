import type { AccountType } from "../../../generated/prisma/client";

type OneTimeCodePurpose = "EMAIL_VERIFY" | "ADMIN_LOGIN" | "PASSWORD_RESET";
type CustomerOrVendor = Extract<AccountType, "CUSTOMER" | "VENDOR">;

type OneTimeCodeEmail = {
  subject: string;
  html: string;
  text: string;
};

const brand = {
  name: "Somsuuq",
  description: "Somali Marketplace",
  forest: "#123B35",
  gold: "#F4B942",
};

export function createOneTimeCodeEmail(
  code: string,
  purpose: OneTimeCodePurpose,
  expiresAt: Date,
  accountType?: CustomerOrVendor,
): OneTimeCodeEmail {
  const expiration = `${new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(expiresAt)} UTC`;
  const content = getEmailContent(purpose, accountType);
  const safeCode = escapeHtml(code);
  const safeExpiration = escapeHtml(expiration);
  const text = [
    content.heading,
    "",
    content.body,
    "",
    `Verification code: ${code}`,
    `This code expires at ${expiration}.`,
    "",
    content.security,
    "",
    "Best regards,",
    "The Somsuuq Team",
    "",
    "Shop • Sell • Grow Together",
  ].join("\n");

  return {
    subject: content.subject,
    text,
    html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(content.subject)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f1f5f2;color:#25332f;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f1f5f2;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #dfe8e2;border-radius:16px;">
            <tr>
              <td style="padding:28px 28px 8px;">
                ${emailLogo()}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 8px;">
                <h1 style="margin:0;color:${brand.forest};font-size:26px;line-height:1.3;">${escapeHtml(content.heading)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 12px;font-size:16px;line-height:1.65;color:#42514c;">
                <p style="margin:0;">${escapeHtml(content.body)}</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:12px 28px 8px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="center" style="padding:16px 24px;border:1px solid #f0cf75;border-radius:12px;background-color:#fff8e6;color:${brand.forest};font-size:30px;font-weight:bold;letter-spacing:8px;">
                      ${safeCode}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:12px 28px 8px;font-size:13px;line-height:1.6;color:#596861;">
                This code expires at <strong>${safeExpiration}</strong>.
              </td>
            </tr>
            <tr>
              <td style="padding:12px 28px 24px;font-size:14px;line-height:1.6;color:#596861;">
                <p style="margin:0;">${escapeHtml(content.security)}</p>
                <p style="margin:18px 0 0;">Best regards,<br><strong style="color:${brand.forest};">The Somsuuq Team</strong></p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:16px 20px;border-top:1px solid #e8eee9;color:#68756f;font-size:12px;letter-spacing:0.04em;">
                Shop &bull; Sell &bull; Grow Together
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  };
}

export type VendorEmailEvent =
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "CHANGES_REQUESTED"
  | "PROFILE_CHANGE_SUBMITTED"
  | "PROFILE_CHANGE_APPROVED"
  | "PROFILE_CHANGE_REJECTED";

export function createVendorApplicationEmail(
  event: VendorEmailEvent,
  displayName: string,
  detail?: string,
  applicationUrl = "",
): OneTimeCodeEmail {
  const content = {
    SUBMITTED: {
      subject: "Somsuuq — Your Vendor Application Has Been Received",
      heading: "Your application is pending review",
      body: "Thank you for applying to become a vendor on Somsuuq. We have received your business information and submitted documents.",
    },
    APPROVED: {
      subject: "Congratulations! Your Somsuuq Vendor Application Has Been Approved",
      heading: "Your vendor application was approved",
      body: "Good news! Welcome to Somsuuq. You can now access your vendor dashboard and begin setting up your store.",
    },
    REJECTED: {
      subject: "Update on Your Somsuuq Vendor Application",
      heading: "Your application was not approved",
      body: "Your vendor application was not approved at this time. Please review the administrator's reason below.",
    },
    CHANGES_REQUESTED: {
      subject: "Action Required — Additional Information Needed for Your Somsuuq Application",
      heading: "Additional information is needed",
      body: "Please update your vendor application with the information or documents requested by the administrator.",
    },
    PROFILE_CHANGE_SUBMITTED: {
      subject: "Somsuuq — We Received Your Store Profile Change Request",
      heading: "We will review your changes",
      body: "Thank you for submitting a store profile update. We will review your requested changes, including name, logo, or business details, and email you when a decision is made. You can keep using your vendor dashboard while we review.",
    },
    PROFILE_CHANGE_APPROVED: {
      subject: "Congratulations! Your Somsuuq Store Profile Changes Were Applied",
      heading: "Your store profile was updated",
      body: "Good news! An administrator approved your profile change request. Your store name, logo, or other business details have been updated on Somsuuq.",
    },
    PROFILE_CHANGE_REJECTED: {
      subject: "Update on Your Somsuuq Store Profile Change Request",
      heading: "Your profile changes were not applied",
      body: "Your requested store profile changes were not approved. Your current store information remains unchanged. Please review the administrator's reason below.",
    },
  }[event];
  const safeName = escapeHtml(displayName);
  const safeBody = escapeHtml(content.body);
  const safeDetail = detail ? escapeHtml(detail) : "";
  const safeUrl = escapeHtml(applicationUrl);
  return {
    subject: content.subject,
    text: [
      `Hello ${displayName},`,
      "",
      content.body,
      ...(detail ? ["", event === "REJECTED" ? `Reason: ${detail}` : `Administrator message: ${detail}`] : []),
      ...(applicationUrl ? ["", `View your application: ${applicationUrl}`] : []),
      "",
      "Thank you for choosing Somsuuq.",
      "Somsuuq Team",
    ].join("\n"),
    html: `<!doctype html><html lang="en"><body style="margin:0;padding:24px;background:#f1f5f2;font-family:Arial,sans-serif;color:#42514c"><table role="presentation" width="100%"><tr><td align="center"><table role="presentation" width="100%" style="max-width:560px;background:#fff;border:1px solid #dfe8e2;border-radius:16px"><tr><td style="padding:28px">${emailLogo()}<h1 style="color:${brand.forest}">${escapeHtml(content.heading)}</h1><p>Hello ${safeName},</p><p>${safeBody}</p>${detail ? `<p style="padding:14px;background:#fff8e6;border-left:4px solid ${brand.gold}"><strong>${event === "REJECTED" ? "Reason" : "Administrator message"}:</strong> ${safeDetail}</p>` : ""}${applicationUrl ? `<p><a href="${safeUrl}" style="color:${brand.forest};font-weight:bold">View your application</a></p>` : ""}<p>Thank you for choosing Somsuuq.<br><strong style="color:${brand.forest}">Somsuuq Team</strong></p></td></tr></table></td></tr></table></body></html>`,
  };
}

function getEmailContent(
  purpose: OneTimeCodePurpose,
  accountType?: CustomerOrVendor,
) {
  if (purpose === "ADMIN_LOGIN") {
    return {
      subject: "Somsuuq Admin — Your Login Verification Code",
      heading: "Administrator Sign-in Verification",
      body: "A sign-in attempt was made for your Somsuuq administrator account. Use the verification code below to continue.",
      security:
        "Never share this code. If you did not initiate this sign-in, you can safely ignore this email and consider securing your administrator account.",
    };
  }

  if (purpose === "PASSWORD_RESET") {
    return {
      subject: "Somsuuq — Password Reset Code",
      heading: "Reset Your Password",
      body: "Use the verification code below to reset your Somsuuq account password.",
      security:
        "If you did not request a password reset, you can safely ignore this email. Your password will not change.",
    };
  }

  if (accountType === "VENDOR") {
    return {
      subject: "Welcome to Somsuuq — Verify Your Email",
      heading: "Welcome to Somsuuq!",
      body: "Thank you for registering as a seller with Somsuuq, your Somali marketplace. Verify your email with the code below to continue your vendor application. Registration does not approve a vendor account.",
      security:
        "If you did not create this account, you can safely ignore this email.",
    };
  }

  return {
    subject: "Welcome to Somsuuq — Verify Your Email",
    heading: "Welcome to Somsuuq!",
    body: "Thank you for registering with Somsuuq, your trusted Somali marketplace. To complete your registration and verify your email address, please use the verification code below.",
    security:
      "If you did not create this account, you can safely ignore this email.",
  };
}

function emailLogo(): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0">
  <tr>
    <td width="42" height="42" align="center" valign="middle" bgcolor="${brand.forest}" style="width:42px;height:42px;border-radius:11px;">
      <table role="presentation" width="22" cellspacing="0" cellpadding="0" border="0" style="width:22px;">
        <tr><td colspan="3" height="4" bgcolor="${brand.gold}" style="height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td width="4" height="4" bgcolor="${brand.gold}" style="height:4px;font-size:0;line-height:0;">&nbsp;</td><td width="14" height="4" style="height:4px;font-size:0;line-height:0;">&nbsp;</td><td width="4" height="4" bgcolor="${brand.gold}" style="height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td width="4" height="10" bgcolor="${brand.gold}" style="height:10px;font-size:0;line-height:0;">&nbsp;</td><td width="14" height="10" align="center" valign="bottom" style="height:10px;font-size:0;line-height:0;"><table role="presentation" width="5" cellspacing="0" cellpadding="0" border="0"><tr><td height="8" bgcolor="${brand.gold}" style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr></table></td><td width="4" height="10" bgcolor="${brand.gold}" style="height:10px;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td colspan="3" height="3" bgcolor="${brand.gold}" style="height:3px;font-size:0;line-height:0;">&nbsp;</td></tr>
      </table>
    </td>
    <td style="padding-left:11px;">
      <span style="display:block;color:${brand.forest};font-size:18px;font-weight:bold;line-height:22px;">${brand.name}</span>
      <span style="display:block;color:#68756f;font-size:11px;line-height:16px;">${brand.description}</span>
    </td>
  </tr>
</table>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
