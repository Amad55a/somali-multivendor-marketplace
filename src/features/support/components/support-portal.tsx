"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ChevronDown,
  Headset,
  MessageCircle,
  Minus,
  Sparkles,
  Ticket,
  X,
} from "lucide-react";
import { z } from "zod";
import { useTranslation } from "@/i18n/hooks/use-translation";
import type { TranslationKey } from "@/i18n/types";
import {
  postFormData,
  postJson,
  requestApi,
} from "@/lib/api/client";
import type { Locale } from "@/i18n/config";

type Audience = "customer" | "vendor" | "admin";
type Page = "home" | "new" | "tickets" | "detail";

const categoryKeys = {
  ORDERS: "support.categories.orders",
  PAYMENTS: "support.categories.payments",
  DELIVERY: "support.categories.delivery",
  RETURNS: "support.categories.returns",
  REFUNDS: "support.categories.refunds",
  ACCOUNT: "support.categories.account",
  PRODUCT_ISSUES: "support.categories.productIssues",
  SAFETY: "support.categories.safety",
  VENDOR_APPLICATION: "support.categories.vendorApplication",
  STORE_PROFILE: "support.categories.storeProfile",
  PRODUCT_LISTING: "support.categories.productListing",
  INVENTORY: "support.categories.inventory",
  COUPONS: "support.categories.coupons",
  COMMISSION_PAYOUTS: "support.categories.commissionPayouts",
  ACCOUNT_SECURITY: "support.categories.accountSecurity",
  OTHER: "support.categories.other",
} satisfies Record<string, TranslationKey>;

const customerCategories = [
  "ORDERS",
  "PAYMENTS",
  "DELIVERY",
  "RETURNS",
  "REFUNDS",
  "ACCOUNT",
  "PRODUCT_ISSUES",
  "SAFETY",
  "OTHER",
] as const;
const vendorCategories = [
  "VENDOR_APPLICATION",
  "STORE_PROFILE",
  "PRODUCT_LISTING",
  "INVENTORY",
  "ORDERS",
  "DELIVERY",
  "COUPONS",
  "COMMISSION_PAYOUTS",
  "ACCOUNT_SECURITY",
  "OTHER",
] as const;
const statusKeys = {
  OPEN: "support.statuses.open",
  IN_PROGRESS: "support.statuses.inProgress",
  WAITING_FOR_CUSTOMER: "support.statuses.waitingForCustomer",
  WAITING_FOR_VENDOR: "support.statuses.waitingForVendor",
  RESOLVED: "support.statuses.resolved",
  CLOSED: "support.statuses.closed",
} satisfies Record<string, TranslationKey>;
const priorityKeys = {
  LOW: "support.priorities.low",
  NORMAL: "support.priorities.normal",
  HIGH: "support.priorities.high",
  URGENT: "support.priorities.urgent",
} satisfies Record<string, TranslationKey>;
const activityKeys = {
  CREATED: "support.created",
  MESSAGE_ADDED: "support.activityMessage",
  ASSIGNED: "support.activityAssignment",
  STATUS_CHANGED: "support.activityStatus",
  PRIORITY_CHANGED: "support.activityPriority",
  INTERNAL_NOTE_ADDED: "support.activityInternalNote",
} satisfies Record<string, TranslationKey>;
const supportEmailEventKeys = {
  TICKET_CREATED: "support.emailCreated",
  TICKET_RESOLVED: "support.emailResolved",
} satisfies Record<string, TranslationKey>;
const supportEmailStatusKeys = {
  PENDING: "support.emailPending",
  SENDING: "support.emailSending",
  SENT: "support.emailSent",
  FAILED: "support.emailFailed",
} satisfies Record<string, TranslationKey>;

const ticketCardSchema = z.object({
  id: z.string(),
  reference: z.string(),
  subject: z.string(),
  category: z.string(),
  status: z.string(),
  priority: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  requester: z.object({
    id: z.string(),
    displayName: z.string().nullable(),
    email: z.string(),
    accountType: z.string(),
  }).optional(),
  assignedTo: z.object({
    id: z.string(),
    displayName: z.string().nullable(),
    email: z.string(),
  }).nullable().optional(),
  messages: z.array(z.object({
    content: z.string(),
    senderRole: z.string(),
    internalNote: z.boolean().optional(),
    createdAt: z.string(),
  })).optional(),
  _count: z.object({ messages: z.number() }).optional(),
}).passthrough();

const ticketListSchema = z.object({
  tickets: z.array(ticketCardSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  unreadCount: z.number(),
});

const ticketDetailSchema = ticketCardSchema.extend({
  description: z.string(),
  requesterRole: z.string(),
  requester: z.object({
    id: z.string(),
    displayName: z.string().nullable(),
    email: z.string(),
    accountType: z.string(),
  }),
  assignedTo: z.object({
    id: z.string(),
    displayName: z.string().nullable(),
    email: z.string(),
  }).nullable(),
  messages: z.array(z.object({
    id: z.string(),
    content: z.string(),
    senderId: z.string(),
    senderRole: z.string(),
    internalNote: z.boolean(),
    createdAt: z.string(),
    sender: z.object({
      id: z.string(),
      displayName: z.string().nullable(),
      accountType: z.string(),
    }),
    attachments: z.array(z.object({
      id: z.string(),
      originalName: z.string(),
      mimeType: z.string(),
      sizeBytes: z.number(),
      createdAt: z.string(),
    })),
  })),
  activities: z.array(z.object({
    id: z.string(),
    type: z.string(),
    metadata: z.unknown().nullable(),
    createdAt: z.string(),
  })),
  emailDeliveries: z.array(z.object({
    id: z.string(),
    event: z.enum(["TICKET_CREATED", "TICKET_RESOLVED"]),
    status: z.enum(["PENDING", "SENDING", "SENT", "FAILED"]),
    attemptCount: z.number(),
    lastAttemptAt: z.string().nullable(),
    lastError: z.string().nullable(),
    sentAt: z.string().nullable(),
    createdAt: z.string(),
  })).optional(),
}).passthrough();

const contextSchema = z.object({
  orders: z.array(z.object({ id: z.string(), label: z.string() })),
  products: z.array(z.object({
    id: z.string(),
    label: z.string(),
    labelSo: z.string().nullable().optional(),
  })),
  vendorProfile: z.object({ id: z.string(), label: z.string() }).nullable(),
});

const attachmentSchema = z.object({
  id: z.string(),
  originalName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
});

const adminUsersSchema = z.object({
  users: z.array(z.object({
    id: z.string(),
    email: z.string(),
    name: z.string().nullable(),
  })),
});

const aiResultSchema = z.object({
  available: z.boolean(),
  answer: z.string().nullable().optional(),
  suggestion: z.string().nullable().optional(),
});
const supportAvailabilitySchema = z.object({
  aiAvailable: z.boolean(),
});

function supportPaths(audience: Audience, locale: Locale) {
  const root = audience === "admin"
    ? `/${locale}/admin/support`
    : audience === "vendor"
      ? `/${locale}/vendor/help`
      : `/${locale}/customer/help`;
  const apiRoot = audience === "admin"
    ? "/api/v1/admin/support/tickets"
    : "/api/v1/support/tickets";
  return {
    root,
    create: audience === "admin" ? root : `${root}/new`,
    tickets: audience === "admin" ? root : `${root}/tickets`,
    apiRoot,
  };
}

function categoryLabel(t: (key: TranslationKey) => string, category: string) {
  const key = categoryKeys[category as keyof typeof categoryKeys];
  return key ? t(key) : category;
}

function statusLabel(t: (key: TranslationKey) => string, status: string) {
  const key = statusKeys[status as keyof typeof statusKeys];
  return key ? t(key) : status;
}

function priorityLabel(t: (key: TranslationKey) => string, priority: string) {
  const key = priorityKeys[priority as keyof typeof priorityKeys];
  return key ? t(key) : priority;
}

export function SupportPortal({
  audience,
  page,
  ticketId,
}: Readonly<{
  audience: Audience;
  page: Page;
  ticketId?: string;
}>) {
  const { t, locale } = useTranslation();
  const paths = supportPaths(audience, locale);
  const isAdmin = audience === "admin";
  const [tickets, setTickets] = useState<z.infer<typeof ticketCardSchema>[]>([]);
  const [ticket, setTicket] = useState<z.infer<typeof ticketDetailSchema> | null>(null);
  const [context, setContext] = useState<z.infer<typeof contextSchema> | null>(null);
  const [admins, setAdmins] = useState<z.infer<typeof adminUsersSchema>["users"]>([]);
  const [total, setTotal] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [unreadCount, setUnreadCount] = useState(0);
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [requesterRole, setRequesterRole] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(
    page === "tickets" || (isAdmin && page === "home"),
  );

  const fetchTickets = useCallback(async (nextPage: number) => {
    const params = new URLSearchParams({
      page: String(nextPage),
      pageSize: "20",
    });
    if (search) params.set("search", search);
    if (requesterRole) params.set("requesterRole", requesterRole);
    if (statusFilter) params.set("status", statusFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    return requestApi(
      `${paths.apiRoot}?${params}`,
      ticketListSchema,
      t("support.requestFailed"),
    );
  }, [paths.apiRoot, priorityFilter, requesterRole, search, statusFilter, t]);

  const loadTickets = useCallback(async (nextPage: number) => {
    try {
      const result = await fetchTickets(nextPage);
      setTickets(result.tickets);
      setTotal(result.total);
      setPageNumber(result.page);
      setUnreadCount(result.unreadCount);
    } catch {
      setError(t("support.requestFailed"));
    } finally {
      setIsLoading(false);
    }
  }, [fetchTickets, t]);

  const fetchTicket = useCallback(async () => {
    if (!ticketId) return null;
    return requestApi(
      `${paths.apiRoot}/${ticketId}`,
      ticketDetailSchema,
      t("support.requestFailed"),
    );
  }, [paths.apiRoot, t, ticketId]);

  const loadTicket = useCallback(async () => {
    try {
      const result = await fetchTicket();
      if (!result) return;
      setTicket(result);
    } catch {
      setError(t("support.requestFailed"));
    }
  }, [fetchTicket, t]);

  useEffect(() => {
    if (page === "tickets" || (isAdmin && page === "home")) {
      void fetchTickets(1)
        .then((result) => {
          setTickets(result.tickets);
          setTotal(result.total);
          setPageNumber(result.page);
          setUnreadCount(result.unreadCount);
        })
        .catch(() => setError(t("support.requestFailed")))
        .finally(() => setIsLoading(false));
    }
  }, [fetchTickets, isAdmin, page, t]);

  useEffect(() => {
    if (page === "detail") {
      void fetchTicket()
        .then((result) => {
          if (result) setTicket(result);
        })
        .catch(() => setError(t("support.requestFailed")));
    }
  }, [fetchTicket, page, t]);

  const reloadTickets = useCallback((nextPage: number) => {
    setIsLoading(true);
    setError(null);
    void loadTickets(nextPage);
  }, [loadTickets]);

  useEffect(() => {
    if (page !== "new" || isAdmin) return;
    void requestApi(
      "/api/v1/support/context",
      contextSchema,
      t("support.requestFailed"),
    )
      .then(setContext)
      .catch(() => setError(t("support.requestFailed")));
  }, [isAdmin, page, t]);

  useEffect(() => {
    if (!isAdmin || page !== "detail") return;
    void requestApi(
      "/api/v1/admin/users?accountType=ADMIN&active=ACTIVE&limit=50",
      adminUsersSchema,
      t("support.requestFailed"),
    )
      .then((result) => setAdmins(result.users))
      .catch(() => setError(t("support.requestFailed")));
  }, [isAdmin, page, t]);

  if (page === "home" && !isAdmin) {
    return (
      <HelpCentre
        audience={audience}
        root={paths.root}
        createHref={paths.create}
        ticketsHref={paths.tickets}
      />
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <PortalNavigation
        audience={audience}
        root={paths.root}
        createHref={paths.create}
        ticketsHref={paths.tickets}
        page={page}
      />
      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      {page === "new" && !isAdmin && (
        <NewTicketForm
          audience={audience}
          context={context}
          onError={setError}
          root={paths.root}
        />
      )}
      {(page === "tickets" || (isAdmin && page === "home")) && (
        <TicketList
          audience={audience}
          tickets={tickets}
          total={total}
          pageNumber={pageNumber}
          unreadCount={unreadCount}
          searchText={searchText}
          setSearchText={setSearchText}
          setSearch={(value) => {
            setIsLoading(true);
            setError(null);
            setSearch(value);
          }}
          requesterRole={requesterRole}
          setRequesterRole={(value) => {
            setIsLoading(true);
            setError(null);
            setRequesterRole(value);
          }}
          statusFilter={statusFilter}
          setStatusFilter={(value) => {
            setIsLoading(true);
            setError(null);
            setStatusFilter(value);
          }}
          priorityFilter={priorityFilter}
          setPriorityFilter={(value) => {
            setIsLoading(true);
            setError(null);
            setPriorityFilter(value);
          }}
          isLoading={isLoading}
          onPage={reloadTickets}
          root={paths.root}
        />
      )}
      {page === "detail" && ticket && (
        <TicketDetail
          audience={audience}
          ticket={ticket}
          admins={admins}
          onReload={loadTicket}
          onError={setError}
          apiRoot={paths.apiRoot}
          root={paths.root}
        />
      )}
    </main>
  );
}

function PortalNavigation({
  audience,
  root,
  createHref,
  ticketsHref,
  page,
}: {
  audience: Audience;
  root: string;
  createHref: string;
  ticketsHref: string;
  page: Page;
}) {
  const { t } = useTranslation();
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3">
      <Link href={root} className="text-sm font-bold text-[#123b35]">
        {t("support.navLabel")}
      </Link>
      <div className="flex flex-wrap gap-2">
        {audience !== "admin" && (
          <Link href={createHref} className="rounded-xl bg-[#123b35] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1b5148]">
            {t("support.newTicket")}
          </Link>
        )}
        {audience !== "admin" && (
          <Link href={ticketsHref} className="rounded-xl border border-[#d5dfda] px-4 py-2 text-sm font-semibold text-[#123b35] hover:bg-[#f5f8f6]">
            {t("support.ticketHistory")}
          </Link>
        )}
        {page === "detail" && (
          <Link href={ticketsHref} className="rounded-xl border border-[#d5dfda] px-4 py-2 text-sm font-semibold text-[#123b35] hover:bg-[#f5f8f6]">
            {t("support.myTickets")}
          </Link>
        )}
      </div>
    </nav>
  );
}

function HelpCentre({
  audience,
  root,
  createHref,
  ticketsHref,
}: {
  audience: Audience;
  root: string;
  createHref: string;
  ticketsHref: string;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const faqKeys = [
    ["ordersQuestion", "ordersAnswer"],
    ["paymentsQuestion", "paymentsAnswer"],
    ["deliveryQuestion", "deliveryAnswer"],
    ["returnsQuestion", "returnsAnswer"],
    ["vendorQuestion", "vendorAnswer"],
    ["accountQuestion", "accountAnswer"],
  ] as const;
  const results = faqKeys.filter(([question, answer]) =>
    `${t(`support.faq.${question}`)} ${t(`support.faq.${answer}`)}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <PortalNavigation
        audience={audience}
        root={root}
        createHref={createHref}
        ticketsHref={ticketsHref}
        page="home"
      />
      <section className="mt-7 overflow-hidden rounded-3xl bg-[#123b35] px-6 py-10 text-white sm:px-10 sm:py-14">
        <p className="text-sm font-semibold text-[#f4b942]">{t("support.navLabel")}</p>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{t("support.helpTitle")}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">
          {audience === "vendor" ? t("support.vendorIntro") : t("support.customerIntro")}
        </p>
        <label className="mt-6 block max-w-2xl">
          <span className="sr-only">{t("support.searchLabel")}</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("support.searchPlaceholder")}
            className="min-h-12 w-full rounded-xl border border-white/20 bg-white px-4 text-sm text-[#123b35] outline-none focus:ring-2 focus:ring-[#f4b942]"
          />
        </label>
      </section>
      <section className="mt-8">
        <h2 className="text-xl font-bold text-[#123b35]">{t("support.topicsTitle")}</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {results.map(([question, answer]) => (
            <details key={question} className="rounded-2xl border border-[#e1e9e5] bg-white p-5">
              <summary className="cursor-pointer font-semibold text-[#123b35]">
                {t(`support.faq.${question}`)}
              </summary>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {t(`support.faq.${answer}`)}
              </p>
            </details>
          ))}
          {results.length === 0 && (
            <p className="rounded-2xl border border-dashed border-[#d5dfda] p-6 text-sm text-slate-600">
              {t("support.noSearchResults")}
            </p>
          )}
        </div>
      </section>
      <SupportAssistant />
      <section className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#e1e9e5] bg-white p-6">
        <div>
          <h2 className="text-lg font-bold text-[#123b35]">{t("support.contactTitle")}</h2>
          <p className="mt-1 text-sm text-slate-600">{t("support.contactDescription")}</p>
        </div>
        <Link href={createHref} className="rounded-xl bg-[#f4b942] px-5 py-3 text-sm font-bold text-[#123b35] hover:bg-[#efad24]">
          {t("support.newTicket")}
        </Link>
      </section>
    </main>
  );
}

function NewTicketForm({
  audience,
  context,
  onError,
  root,
}: {
  audience: "customer" | "vendor";
  context: z.infer<typeof contextSchema> | null;
  onError: (message: string | null) => void;
  root: string;
}) {
  const { t, locale } = useTranslation();
  const isVendor = audience === "vendor";
  const categories = isVendor ? vendorCategories : customerCategories;
  const idempotencyKey = useRef("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>(categories[0]);
  const [relatedOrderId, setRelatedOrderId] = useState("");
  const [relatedProductId, setRelatedProductId] = useState("");
  const [vendorProfileId, setVendorProfileId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [created, setCreated] = useState<{ id: string; reference: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError(null);
    setIsSubmitting(true);
    if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
    try {
      const createdTicket = await requestApi(
        "/api/v1/support/tickets",
        z.object({
          id: z.string(),
          reference: z.string(),
          status: z.string(),
          messageId: z.string(),
        }),
        t("support.formError"),
        {
          ...postJson({
            subject,
            description,
            category,
            locale,
            ...(relatedOrderId ? { relatedOrderId } : {}),
            ...(relatedProductId ? { productId: relatedProductId } : {}),
            ...(vendorProfileId ? { vendorProfileId } : {}),
          }),
          headers: { "Idempotency-Key": idempotencyKey.current },
        },
      );
      setCreated(createdTicket);
      if (file) {
        const form = new FormData();
        form.append("file", file);
        try {
          await requestApi(
            `/api/v1/support/messages/${createdTicket.messageId}/attachments`,
            attachmentSchema,
            t("support.fileUploadFailed"),
            {
              ...postFormData(form),
              headers: { "Idempotency-Key": crypto.randomUUID() },
            },
          );
        } catch {
          onError(t("support.fileUploadFailed"));
        }
      }
    } catch {
      onError(t("support.formError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mt-7 rounded-2xl border border-[#e1e9e5] bg-white p-5 shadow-sm sm:p-8">
      <h1 className="text-2xl font-bold text-[#123b35]">{t("support.createTitle")}</h1>
      <p className="mt-2 text-sm text-slate-600">{t("support.createDescription")}</p>
      {created ? (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="font-semibold text-emerald-900">{t("support.ticketCreated")}</p>
          <p className="mt-2 text-sm text-emerald-800">
            {t("support.ticketReference")}: <span className="font-bold">{created.reference}</span>
          </p>
          <Link
            href={`${root}/tickets/${created.id}`}
            className="mt-4 inline-block rounded-lg bg-[#123b35] px-4 py-2 text-sm font-semibold text-white"
          >
            {t("support.ticketHistory")}
          </Link>
        </div>
      ) : (
        <form className="mt-6 grid gap-5 md:grid-cols-2" onSubmit={(event) => void submit(event)}>
          <label className="grid gap-2 text-sm font-semibold text-[#123b35]">
            {t("support.subject")}
            <input required minLength={4} maxLength={200} value={subject} onChange={(event) => setSubject(event.target.value)} className="min-h-11 rounded-xl border border-[#d5dfda] px-3 font-normal outline-none focus:border-[#123b35]" />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[#123b35]">
            {t("support.category")}
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="min-h-11 rounded-xl border border-[#d5dfda] bg-white px-3 font-normal">
              {categories.map((value) => (
                <option key={value} value={value}>{t(categoryKeys[value])}</option>
              ))}
            </select>
          </label>
          {context?.orders.length ? (
            <label className="grid gap-2 text-sm font-semibold text-[#123b35]">
              {t("support.relatedOrder")}
              <select value={relatedOrderId} onChange={(event) => setRelatedOrderId(event.target.value)} className="min-h-11 rounded-xl border border-[#d5dfda] bg-white px-3 font-normal">
                <option value="">—</option>
                {context.orders.map((order) => <option key={order.id} value={order.id}>{order.label}</option>)}
              </select>
            </label>
          ) : null}
          {isVendor && context?.products.length ? (
            <label className="grid gap-2 text-sm font-semibold text-[#123b35]">
              {t("support.relatedProduct")}
              <select value={relatedProductId} onChange={(event) => setRelatedProductId(event.target.value)} className="min-h-11 rounded-xl border border-[#d5dfda] bg-white px-3 font-normal">
                <option value="">—</option>
                {context.products.map((product) => <option key={product.id} value={product.id}>{locale === "so" ? product.labelSo ?? product.label : product.label}</option>)}
              </select>
            </label>
          ) : null}
          {isVendor && context?.vendorProfile ? (
            <label className="grid gap-2 text-sm font-semibold text-[#123b35]">
              {t("support.vendorApplication")}
              <select value={vendorProfileId} onChange={(event) => setVendorProfileId(event.target.value)} className="min-h-11 rounded-xl border border-[#d5dfda] bg-white px-3 font-normal">
                <option value="">—</option>
                <option value={context.vendorProfile.id}>{context.vendorProfile.label}</option>
              </select>
            </label>
          ) : null}
          <label className="grid gap-2 text-sm font-semibold text-[#123b35] md:col-span-2">
            {t("support.description")}
            <textarea required minLength={10} maxLength={4000} rows={6} value={description} onChange={(event) => setDescription(event.target.value)} className="rounded-xl border border-[#d5dfda] p-3 font-normal outline-none focus:border-[#123b35]" />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[#123b35] md:col-span-2">
            {t("support.attachment")}
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="rounded-xl border border-[#d5dfda] p-2 text-sm"
            />
            <span className="text-xs font-normal text-slate-500">{t("support.attachmentHelp")}</span>
          </label>
          <div className="md:col-span-2">
            <button type="submit" disabled={isSubmitting} className="min-h-11 rounded-xl bg-[#123b35] px-5 text-sm font-bold text-white disabled:opacity-60">
              {isSubmitting ? t("support.submitting") : t("support.submit")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function TicketList({
  audience,
  tickets,
  total,
  pageNumber,
  unreadCount,
  searchText,
  setSearchText,
  setSearch,
  requesterRole,
  setRequesterRole,
  statusFilter,
  setStatusFilter,
  priorityFilter,
  setPriorityFilter,
  isLoading,
  onPage,
  root,
}: {
  audience: Audience;
  tickets: z.infer<typeof ticketCardSchema>[];
  total: number;
  pageNumber: number;
  unreadCount: number;
  searchText: string;
  setSearchText: (value: string) => void;
  setSearch: (value: string) => void;
  requesterRole: string;
  setRequesterRole: (value: string) => void;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  priorityFilter: string;
  setPriorityFilter: (value: string) => void;
  isLoading: boolean;
  onPage: (page: number) => void;
  root: string;
}) {
  const { t, locale } = useTranslation();
  const isAdmin = audience === "admin";
  const pageCount = Math.max(1, Math.ceil(total / 20));
  const detailsHref = (id: string) =>
    `${isAdmin ? root : `${root}/tickets`}/${id}`;

  return (
    <section className="mt-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#123b35]">
            {isAdmin ? t("support.navLabel") : t("support.myTickets")}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {unreadCount} {t("customerDashboard.unread")}
          </p>
        </div>
      </div>
      {isAdmin && (
        <form
          className="mt-5 grid gap-3 rounded-2xl border border-[#e1e9e5] bg-white p-4 md:grid-cols-5"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchText);
          }}
        >
          <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder={t("support.search")} className="min-h-10 rounded-lg border border-[#d5dfda] px-3 text-sm md:col-span-2" />
          <select value={requesterRole} onChange={(event) => setRequesterRole(event.target.value)} className="min-h-10 rounded-lg border border-[#d5dfda] bg-white px-2 text-sm">
            <option value="">{t("support.allRequesters")}</option>
            <option value="CUSTOMER">{t("support.customer")}</option>
            <option value="VENDOR">{t("support.vendor")}</option>
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="min-h-10 rounded-lg border border-[#d5dfda] bg-white px-2 text-sm">
            <option value="">{t("support.allStatuses")}</option>
            {Object.keys(statusKeys).map((value) => <option key={value} value={value}>{statusLabel(t, value)}</option>)}
          </select>
          <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} className="min-h-10 rounded-lg border border-[#d5dfda] bg-white px-2 text-sm">
            <option value="">{t("support.allPriorities")}</option>
            {Object.keys(priorityKeys).map((value) => <option key={value} value={value}>{priorityLabel(t, value)}</option>)}
          </select>
          <button type="submit" className="min-h-10 rounded-lg bg-[#123b35] px-4 text-sm font-semibold text-white md:col-span-5">
            {t("support.search")}
          </button>
        </form>
      )}
      <div className="mt-5 grid gap-3">
        {tickets.map((item) => {
          const lastMessage = item.messages?.[0];
          const unread = item._count?.messages ?? 0;
          return (
            <Link
              key={item.id}
              href={detailsHref(item.id)}
              className="block rounded-2xl border border-[#e1e9e5] bg-white p-5 transition hover:border-[#c5d5cd] hover:shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold tracking-wide text-[#8b5e08]">{item.reference}</p>
                  <h2 className="mt-1 truncate font-bold text-[#123b35]">{item.subject}</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {categoryLabel(t, item.category)} · {new Date(item.updatedAt).toLocaleString(locale)}
                  </p>
                  {isAdmin && item.requester && (
                    <p className="mt-2 text-xs text-slate-600">
                      {item.requester.displayName ?? item.requester.email} · {item.requester.accountType === "VENDOR" ? t("support.vendor") : t("support.customer")}
                    </p>
                  )}
                  {lastMessage && (
                    <p className="mt-3 line-clamp-2 text-sm text-slate-600">{lastMessage.content}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-[#f1f5f3] px-3 py-1 text-xs font-semibold text-[#123b35]">{statusLabel(t, item.status)}</span>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.priority === "URGENT" ? "bg-red-100 text-red-800" : item.priority === "HIGH" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}>{priorityLabel(t, item.priority)}</span>
                  {unread > 0 && <span className="rounded-full bg-[#f4b942] px-2 py-1 text-xs font-bold text-[#123b35]">{unread}</span>}
                </div>
              </div>
            </Link>
          );
        })}
        {!isLoading && tickets.length === 0 && (
          <p className="rounded-2xl border border-dashed border-[#d5dfda] bg-white p-8 text-center text-sm text-slate-600">
            {t("support.noTickets")}
          </p>
        )}
        {isLoading && <p className="p-6 text-center text-sm text-slate-500">{t("support.submitting")}</p>}
      </div>
      <div className="mt-5 flex items-center justify-center gap-4 text-sm">
        <button type="button" disabled={pageNumber <= 1 || isLoading} onClick={() => onPage(pageNumber - 1)} className="rounded-lg border border-[#d5dfda] px-3 py-2 disabled:opacity-50">{t("support.previous")}</button>
        <span>{t("support.page")} {pageNumber} {t("support.of")} {pageCount}</span>
        <button type="button" disabled={pageNumber >= pageCount || isLoading} onClick={() => onPage(pageNumber + 1)} className="rounded-lg border border-[#d5dfda] px-3 py-2 disabled:opacity-50">{t("support.next")}</button>
      </div>
    </section>
  );
}

function TicketDetail({
  audience,
  ticket,
  admins,
  onReload,
  onError,
  apiRoot,
  root,
}: {
  audience: Audience;
  ticket: z.infer<typeof ticketDetailSchema>;
  admins: z.infer<typeof adminUsersSchema>["users"];
  onReload: () => Promise<void>;
  onError: (message: string | null) => void;
  apiRoot: string;
  root: string;
}) {
  const { t, locale } = useTranslation();
  const isAdmin = audience === "admin";
  const [reply, setReply] = useState("");
  const [internalNote, setInternalNote] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [isAssisting, setIsAssisting] = useState(false);
  const [retryingEmailId, setRetryingEmailId] = useState<string | null>(null);
  const messageKey = useRef("");

  async function saveTicketChange(data: Record<string, unknown>) {
    onError(null);
    try {
      await requestApi(
        `${apiRoot}/${ticket.id}`,
        z.any(),
        t("support.requestFailed"),
        { method: "PATCH", body: JSON.stringify(data) },
      );
      await onReload();
    } catch {
      onError(t("support.requestFailed"));
    }
  }

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError(null);
    setIsSending(true);
    if (!messageKey.current) messageKey.current = crypto.randomUUID();
    try {
      const message = await requestApi(
        `${apiRoot}/${ticket.id}/messages`,
        z.object({ id: z.string() }).passthrough(),
        t("support.requestFailed"),
        {
          ...postJson({
            content: reply,
            ...(isAdmin ? { internalNote } : {}),
          }),
          headers: { "Idempotency-Key": messageKey.current },
        },
      );
      if (file) {
        const form = new FormData();
        form.append("file", file);
        try {
          await requestApi(
            `/api/v1/support/messages/${message.id}/attachments`,
            attachmentSchema,
            t("support.fileUploadFailed"),
            {
              ...postFormData(form),
              headers: { "Idempotency-Key": crypto.randomUUID() },
            },
          );
        } catch {
          onError(t("support.fileUploadFailed"));
        }
      }
      setReply("");
      setFile(null);
      setInternalNote(false);
      messageKey.current = "";
      await onReload();
    } catch {
      onError(t("support.requestFailed"));
    } finally {
      setIsSending(false);
    }
  }

  async function requestAgentAI(action: "SUMMARY" | "DRAFT_REPLY" | "TRIAGE") {
    onError(null);
    setIsAssisting(true);
    setSuggestion(null);
    try {
      const result = await requestApi(
        `/api/v1/admin/support/tickets/${ticket.id}/ai`,
        aiResultSchema,
        t("support.aiError"),
        postJson({ action, locale }),
      );
      if (!result.available) {
        onError(t("support.aiUnavailable"));
      } else {
        setSuggestion(result.suggestion ?? null);
      }
    } catch {
      onError(t("support.aiError"));
    } finally {
      setIsAssisting(false);
    }
  }

  async function retryEmailDelivery(deliveryId: string) {
    onError(null);
    setRetryingEmailId(deliveryId);
    try {
      await requestApi(
        `${apiRoot}/${ticket.id}/email-deliveries/${deliveryId}/retry`,
        z.object({ id: z.string(), status: z.string() }),
        t("support.requestFailed"),
        { method: "POST" },
      );
      await onReload();
    } catch {
      onError(t("support.requestFailed"));
    } finally {
      setRetryingEmailId(null);
    }
  }

  return (
    <section className="mt-7">
      <div className="rounded-2xl border border-[#e1e9e5] bg-white p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-wide text-[#8b5e08]">{ticket.reference}</p>
            <h1 className="mt-1 text-2xl font-bold text-[#123b35]">{ticket.subject}</h1>
            <p className="mt-2 text-sm text-slate-600">{categoryLabel(t, ticket.category)} · {t("support.created")} {new Date(ticket.createdAt).toLocaleString(locale)}</p>
            {isAdmin && (
              <p className="mt-2 text-sm text-slate-600">{t("support.requester")}: {ticket.requester.displayName ?? ticket.requester.email} ({ticket.requester.email})</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-[#f1f5f3] px-3 py-1 text-xs font-semibold">{statusLabel(t, ticket.status)}</span>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${ticket.priority === "URGENT" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>{priorityLabel(t, ticket.priority)}</span>
          </div>
        </div>
        <div className="mt-5 grid gap-3 border-t border-[#e1e9e5] pt-5 md:grid-cols-3">
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            {t("support.status")}
            {isAdmin ? (
              <select value={ticket.status} onChange={(event) => void saveTicketChange({ status: event.target.value })} className="min-h-10 rounded-lg border border-[#d5dfda] bg-white px-2 text-sm font-normal text-[#123b35]">
                {Object.keys(statusKeys).map((value) => <option key={value} value={value}>{statusLabel(t, value)}</option>)}
              </select>
            ) : <span className="text-sm text-[#123b35]">{statusLabel(t, ticket.status)}</span>}
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            {t("support.priorityLabel")}
            {isAdmin ? (
              <select value={ticket.priority} onChange={(event) => void saveTicketChange({ priority: event.target.value })} className="min-h-10 rounded-lg border border-[#d5dfda] bg-white px-2 text-sm font-normal text-[#123b35]">
                {Object.keys(priorityKeys).map((value) => <option key={value} value={value}>{priorityLabel(t, value)}</option>)}
              </select>
            ) : <span className="text-sm text-[#123b35]">{priorityLabel(t, ticket.priority)}</span>}
          </label>
          {isAdmin && (
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              {t("support.assignee")}
              <select value={ticket.assignedTo?.id ?? ""} onChange={(event) => void saveTicketChange({ assignedToId: event.target.value || null })} className="min-h-10 rounded-lg border border-[#d5dfda] bg-white px-2 text-sm font-normal text-[#123b35]">
                <option value="">{t("support.unassigned")}</option>
                {admins.map((admin) => <option key={admin.id} value={admin.id}>{admin.name ?? admin.email}</option>)}
              </select>
            </label>
          )}
        </div>
      </div>

      {isAdmin && (
        <section className="mt-5 rounded-2xl border border-[#e1e9e5] bg-white p-5">
          <h2 className="font-bold text-[#123b35]">{t("support.aiTitle")}</h2>
          <p className="mt-1 text-xs text-slate-500">{t("support.aiDisclaimer")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={isAssisting} onClick={() => void requestAgentAI("SUMMARY")} className="rounded-lg border border-[#d5dfda] px-3 py-2 text-sm font-semibold">{t("support.aiSummary")}</button>
            <button type="button" disabled={isAssisting} onClick={() => void requestAgentAI("DRAFT_REPLY")} className="rounded-lg border border-[#d5dfda] px-3 py-2 text-sm font-semibold">{t("support.aiDraftReply")}</button>
            <button type="button" disabled={isAssisting} onClick={() => void requestAgentAI("TRIAGE")} className="rounded-lg border border-[#d5dfda] px-3 py-2 text-sm font-semibold">{t("support.aiTriage")}</button>
          </div>
          {isAssisting && <p className="mt-3 text-sm text-slate-500">{t("support.submitting")}</p>}
          {suggestion && <div className="mt-4 whitespace-pre-wrap rounded-xl border border-[#f4b942] bg-[#fff9eb] p-4 text-sm text-[#123b35]"><p className="mb-2 font-bold">{t("support.aiSuggestion")}</p>{suggestion}</div>}
        </section>
      )}

      {isAdmin && (ticket.emailDeliveries?.length ?? 0) > 0 && (
        <section className="mt-5 rounded-2xl border border-[#e1e9e5] bg-white p-5">
          <h2 className="font-bold text-[#123b35]">{t("support.emailNotifications")}</h2>
          <ul className="mt-3 grid gap-3">
            {ticket.emailDeliveries?.map((delivery) => {
              const eventKey =
                supportEmailEventKeys[delivery.event as keyof typeof supportEmailEventKeys];
              const statusKey =
                supportEmailStatusKeys[delivery.status as keyof typeof supportEmailStatusKeys];
              return (
                <li
                  key={delivery.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e1e9e5] p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#123b35]">
                      {eventKey ? t(eventKey) : delivery.event}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      {statusKey ? t(statusKey) : delivery.status} · {t("support.emailAttempts")}: {delivery.attemptCount}
                    </p>
                    {delivery.lastError && (
                      <p className="mt-1 break-all text-xs text-amber-800">
                        {t("support.emailLastError")}: {delivery.lastError}
                      </p>
                    )}
                  </div>
                  {(delivery.status === "PENDING" || delivery.status === "FAILED") && (
                    <button
                      type="button"
                      disabled={retryingEmailId !== null}
                      onClick={() => void retryEmailDelivery(delivery.id)}
                      className="min-h-10 rounded-lg border border-[#d5dfda] px-3 text-sm font-semibold text-[#123b35] transition hover:bg-[#f5f8f6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8b5e08] disabled:opacity-50"
                    >
                      {retryingEmailId === delivery.id
                        ? t("support.emailSending")
                        : t("support.emailRetry")}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="mt-5 rounded-2xl border border-[#e1e9e5] bg-white p-5 sm:p-7">
        <h2 className="text-lg font-bold text-[#123b35]">{t("support.conversation")}</h2>
        <div className="mt-4 grid gap-3">
          {ticket.messages.map((message) => (
            <article key={message.id} className={`rounded-xl border p-4 ${message.internalNote ? "border-[#f4b942] bg-[#fff9eb]" : message.senderRole === "ADMIN" ? "border-[#d9e7df] bg-[#f5f8f6]" : "border-[#e1e9e5] bg-white"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold text-[#123b35]">
                  {message.internalNote
                    ? t("support.internalNote")
                    : message.senderRole === "ADMIN"
                      ? t("support.navLabel")
                      : message.sender.displayName ?? (message.senderRole === "VENDOR" ? t("support.vendor") : t("support.customer"))}
                </p>
                <time className="text-[11px] text-slate-500">{new Date(message.createdAt).toLocaleString(locale)}</time>
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{message.content}</p>
              {message.attachments.length > 0 && (
                <ul className="mt-3 grid gap-2">
                  {message.attachments.map((attachment) => (
                    <li key={attachment.id}>
                      <a href={`/api/v1/support/attachments/${attachment.id}`} className="text-sm font-semibold text-[#8b5e08] underline">
                        {attachment.originalName} · {(attachment.sizeBytes / 1024).toFixed(0)} KB
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
        {ticket.activities.length > 0 && (
          <details className="mt-5 rounded-xl border border-[#e1e9e5] p-4">
            <summary className="cursor-pointer text-sm font-bold text-[#123b35]">{t("support.activity")}</summary>
            <ul className="mt-3 grid gap-2">
              {ticket.activities.map((activity) => {
                const key = activityKeys[activity.type as keyof typeof activityKeys];
                return (
                  <li key={activity.id} className="flex justify-between gap-3 text-xs text-slate-600">
                    <span>{key ? t(key) : activity.type}</span>
                    <time>{new Date(activity.createdAt).toLocaleString(locale)}</time>
                  </li>
                );
              })}
            </ul>
          </details>
        )}
      </section>

      {ticket.status !== "CLOSED" && (
        <form className="mt-5 rounded-2xl border border-[#e1e9e5] bg-white p-5" onSubmit={(event) => void sendReply(event)}>
          <label className="grid gap-2 text-sm font-semibold text-[#123b35]">
            {isAdmin && internalNote ? t("support.internalNote") : t("support.reply")}
            <textarea required minLength={2} maxLength={4000} rows={4} value={reply} onChange={(event) => setReply(event.target.value)} className="rounded-xl border border-[#d5dfda] p-3 font-normal outline-none focus:border-[#123b35]" />
          </label>
          {isAdmin && (
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={internalNote} onChange={(event) => setInternalNote(event.target.checked)} />
              {t("support.internalNote")}
            </label>
          )}
          <label className="mt-3 grid gap-2 text-sm font-semibold text-[#123b35]">
            {t("support.attachment")}
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="rounded-xl border border-[#d5dfda] p-2 text-sm" />
          </label>
          <button type="submit" disabled={isSending} className={`mt-4 min-h-10 rounded-xl px-4 text-sm font-bold text-white disabled:opacity-60 ${internalNote ? "bg-[#8b5e08]" : "bg-[#123b35]"}`}>
            {isSending ? t("support.submitting") : internalNote ? t("support.sendInternalNote") : t("support.sendReply")}
          </button>
        </form>
      )}
      {!isAdmin && <SupportAssistant ticketId={ticket.id} />}
      <Link href={root} className="mt-5 inline-block text-sm font-semibold text-[#8b5e08] hover:underline">
        {isAdmin ? t("support.navLabel") : t("support.ticketHistory")}
      </Link>
    </section>
  );
}

function SupportAssistant({ ticketId }: { ticketId?: string }) {
  const { t, locale } = useTranslation();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [isAsking, setIsAsking] = useState(false);

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setAnswer("");
    setIsAsking(true);
    try {
      const result = await requestApi(
        "/api/v1/support/ai",
        aiResultSchema,
        t("support.aiError"),
        postJson({ question, locale, ...(ticketId ? { ticketId } : {}) }),
      );
      if (!result.available) {
        setError(t("support.aiUnavailable"));
      } else {
        setAnswer(result.answer ?? "");
      }
    } catch {
      setError(t("support.aiError"));
    } finally {
      setIsAsking(false);
    }
  }

  return (
    <section className="mt-7 rounded-2xl border border-[#e1e9e5] bg-white p-5">
      <h2 className="font-bold text-[#123b35]">{t("support.aiTitle")}</h2>
      <p className="mt-1 text-xs text-slate-500">{t("support.aiDisclaimer")}</p>
      <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={(event) => void ask(event)}>
        <label className="min-w-0 flex-1">
          <span className="sr-only">{t("support.aiPlaceholder")}</span>
          <input required minLength={2} maxLength={2000} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={t("support.aiPlaceholder")} className="min-h-11 w-full rounded-xl border border-[#d5dfda] px-3 text-sm outline-none focus:border-[#123b35]" />
        </label>
        <button type="submit" disabled={isAsking} className="min-h-11 rounded-xl bg-[#123b35] px-4 text-sm font-bold text-white disabled:opacity-60">
          {isAsking ? t("support.submitting") : t("support.aiAsk")}
        </button>
      </form>
      {error && <p role="status" className="mt-3 text-sm text-amber-800">{error}</p>}
      {answer && <p className="mt-4 whitespace-pre-wrap rounded-xl bg-[#f5f8f6] p-4 text-sm leading-6 text-slate-700">{answer}</p>}
    </section>
  );
}

export function SupportLauncher({
  audience,
}: Readonly<{ audience: "customer" | "vendor" }>) {
  const { t, locale } = useTranslation();
  const paths = supportPaths(audience, locale);
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  const [availability, setAvailability] = useState<
    "unknown" | "loading" | "available" | "unavailable" | "error"
  >("unknown");
  const [availabilityError, setAvailabilityError] = useState("");
  const [ticketPreview, setTicketPreview] = useState<{
    state: "loading" | "ready" | "error";
    tickets: z.infer<typeof ticketCardSchema>[];
  } | null>(null);

  function loadAIAvailability() {
    setAvailability("loading");
    void requestApi(
      "/api/v1/support/availability",
      supportAvailabilitySchema,
      t("support.widget.availabilityError"),
    )
      .then((result) => {
        setAvailabilityError("");
        setAvailability(result.aiAvailable ? "available" : "unavailable");
      })
      .catch((error: unknown) => {
        setAvailabilityError(
          error instanceof Error ? error.message : t("support.widget.availabilityError"),
        );
        setAvailability("error");
      });
  }

  function loadRecentTickets() {
    setTicketPreview({ state: "loading", tickets: [] });
    void requestApi(
      `${paths.apiRoot}?page=1&pageSize=3`,
      ticketListSchema,
      t("support.widget.ticketPreviewError"),
    )
      .then((result) =>
        setTicketPreview({ state: "ready", tickets: result.tickets }),
      )
      .catch(() => setTicketPreview({ state: "error", tickets: [] }));
  }

  function openPanel() {
    setIsOpen(true);
    setIsMinimized(false);
    if (availability === "unknown" || availability === "error") {
      loadAIAvailability();
    }
    if (ticketPreview === null || ticketPreview.state === "error") {
      loadRecentTickets();
    }
  }

  return (
    <>
      {isOpen && (
        <aside
          id="somsuuq-support-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="somsuuq-support-title"
          className={`fixed z-[70] w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-3xl border border-[#dce6e0] bg-white shadow-[0_24px_70px_-20px_rgba(12,40,34,0.42)] ${
            showAssistant
              ? "max-sm:!left-1/2 max-sm:!right-auto max-sm:!top-1/2 max-sm:!bottom-auto max-sm:!-translate-x-1/2 max-sm:!-translate-y-1/2 max-sm:!w-[calc(100vw-1rem)] max-sm:!max-w-none"
              : ""
          }`}
          style={{
            right: "max(1rem, env(safe-area-inset-right, 0px) + 1rem)",
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 5.5rem)",
            maxHeight: showAssistant ? "min(90dvh, 48rem)" : "min(72dvh, 36rem)",
          }}
        >
          <div className="flex items-center gap-3 bg-[#123b35] px-4 py-4 text-white">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#f4b942] text-[#123b35]">
              <Headset aria-hidden="true" size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="somsuuq-support-title" className="truncate font-bold">
                {t("support.widget.title")}
              </h2>
              <p className="text-xs text-white/75">{t("support.widget.subtitle")}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsMinimized((value) => !value)}
              aria-label={isMinimized ? t("support.widget.expand") : t("support.widget.minimize")}
              className="rounded-lg p-2 text-white/85 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f4b942]"
            >
              {isMinimized ? <ChevronDown aria-hidden="true" size={18} /> : <Minus aria-hidden="true" size={18} />}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setShowAssistant(false);
              }}
              aria-label={t("support.widget.close")}
              className="rounded-lg p-2 text-white/85 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f4b942]"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>
          {!isMinimized && (
            <div
              className={`overflow-y-auto p-4 ${
                showAssistant
                  ? "max-h-[calc(min(90dvh,48rem)-4.5rem)]"
                  : "max-h-[calc(min(72dvh,36rem)-4.5rem)]"
              }`}
            >
              {showAssistant ? (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowAssistant(false)}
                    className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-[#123b35] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8b5e08]"
                  >
                    <ArrowLeft aria-hidden="true" size={16} />
                    {t("support.widget.back")}
                  </button>
                  <SupportAssistant />
                </div>
              ) : (
                <>
                  <div className="rounded-2xl bg-[#f5f8f6] p-4">
                    <p className="font-semibold text-[#123b35]">
                      {t("support.widget.welcome")}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {t("support.widget.description")}
                    </p>
                  </div>
                  <div className="mt-4 grid gap-2">
                    {availability === "loading" && (
                      <p role="status" className="rounded-xl border border-[#e1e9e5] px-3 py-3 text-sm text-slate-600">
                        {t("support.widget.checkingAI")}
                      </p>
                    )}
                    {availability === "error" && (
                      <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        <p>{availabilityError || t("support.widget.availabilityError")}</p>
                        <button
                          type="button"
                          onClick={openPanel}
                          className="mt-2 font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                          {t("support.widget.tryAgain")}
                        </button>
                      </div>
                    )}
                    {availability === "unavailable" && (
                      <p role="status" className="rounded-xl border border-[#e1e9e5] px-3 py-3 text-sm text-slate-600">
                        {t("support.widget.aiUnavailable")}
                      </p>
                    )}
                    {availability === "available" && (
                      <button
                        type="button"
                        onClick={() => setShowAssistant(true)}
                        className="flex min-h-12 items-center gap-3 rounded-xl border border-[#dce6e0] px-3 text-left text-sm font-semibold text-[#123b35] transition hover:border-[#123b35] hover:bg-[#f5f8f6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8b5e08]"
                      >
                        <Sparkles aria-hidden="true" size={18} className="text-[#8b5e08]" />
                        {t("support.widget.askAI")}
                      </button>
                    )}
                    <Link
                      href={paths.create}
                      onClick={() => setIsOpen(false)}
                      className="flex min-h-12 items-center gap-3 rounded-xl bg-[#123b35] px-3 text-sm font-semibold text-white transition hover:bg-[#1b5148] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8b5e08]"
                    >
                      <MessageCircle aria-hidden="true" size={18} className="text-[#f4b942]" />
                      {t("support.widget.createTicket")}
                    </Link>
                    <Link
                      href={paths.tickets}
                      onClick={() => setIsOpen(false)}
                      className="flex min-h-12 items-center gap-3 rounded-xl border border-[#dce6e0] px-3 text-sm font-semibold text-[#123b35] transition hover:bg-[#f5f8f6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8b5e08]"
                    >
                      <Ticket aria-hidden="true" size={18} className="text-[#8b5e08]" />
                      {t("support.widget.myTickets")}
                    </Link>
                  </div>
                  <section className="mt-4 border-t border-[#e1e9e5] pt-4">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      {t("support.widget.recentTickets")}
                    </h3>
                    {ticketPreview?.state === "loading" && (
                      <p role="status" className="mt-2 text-sm text-slate-600">
                        {t("support.widget.loadingTickets")}
                      </p>
                    )}
                    {ticketPreview?.state === "error" && (
                      <div role="status" className="mt-2 text-sm text-amber-900">
                        <p>{t("support.widget.ticketPreviewError")}</p>
                        <button
                          type="button"
                          onClick={loadRecentTickets}
                          className="mt-1 font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                          {t("support.widget.tryAgain")}
                        </button>
                      </div>
                    )}
                    {ticketPreview?.state === "ready" &&
                      ticketPreview.tickets.length === 0 && (
                        <p className="mt-2 text-sm text-slate-600">
                          {t("support.widget.noTickets")}
                        </p>
                      )}
                    {ticketPreview?.state === "ready" &&
                      ticketPreview.tickets.length > 0 && (
                        <ul className="mt-2 grid gap-1">
                          {ticketPreview.tickets.map((ticketItem) => (
                            <li key={ticketItem.id}>
                              <Link
                                href={`${paths.tickets}/${ticketItem.id}`}
                                onClick={() => setIsOpen(false)}
                                className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm text-[#123b35] transition hover:bg-[#f5f8f6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8b5e08]"
                              >
                                <span className="min-w-0">
                                  <span className="block truncate font-semibold">
                                    {ticketItem.subject}
                                  </span>
                                  <span className="block text-xs text-slate-500">
                                    {ticketItem.reference}
                                  </span>
                                </span>
                                <span className="shrink-0 text-xs text-slate-600">
                                  {statusLabel(t, ticketItem.status)}
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                  </section>
                </>
              )}
            </div>
          )}
        </aside>
      )}
      <button
        type="button"
        aria-label={isOpen ? t("support.widget.close") : t("support.widget.open")}
        aria-expanded={isOpen}
        aria-controls="somsuuq-support-panel"
        onClick={() => (isOpen ? setIsOpen(false) : openPanel())}
        className="fixed z-[70] flex size-14 items-center justify-center rounded-2xl border border-[#f4b942]/70 bg-[#123b35] text-white shadow-[0_12px_30px_-8px_rgba(18,59,53,0.55)] transition duration-200 hover:-translate-y-1 hover:bg-[#1b5148] hover:shadow-[0_16px_34px_-8px_rgba(18,59,53,0.6)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f4b942] active:translate-y-0"
        style={{
          right: "max(1rem, env(safe-area-inset-right, 0px) + 1rem)",
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)",
        }}
      >
        {isOpen ? <X aria-hidden="true" size={22} /> : <Headset aria-hidden="true" size={23} />}
      </button>
    </>
  );
}
