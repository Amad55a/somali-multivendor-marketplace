export type MarketId =
  | "mogadishu"
  | "hargeisa"
  | "somalia"
  | "galkayo"
  | "bosaso"
  | "xayat"
  | "baidoa"
  | "jowhar"
  | "kismayo";

export type CategoryId =
  | "fashion"
  | "electronics"
  | "home"
  | "fragrances"
  | "food"
  | "computing";

export type ProductId =
  | "dabqaad"
  | "dirac"
  | "iphone"
  | "frankincense"
  | "headphones"
  | "macawiis"
  | "honey"
  | "samsung";

export type ProductFilter = "all" | "deals" | "crafts" | "tech";

export interface MarketCopy {
  id: MarketId;
  city: string;
  country: string;
  name: string;
  description: string;
}

export interface CategoryCopy {
  id: CategoryId;
  title: string;
  description: string;
}

export interface ProductCopy {
  id: ProductId;
  filter: Exclude<ProductFilter, "all">;
  seller: string;
  rating: string;
  tag: string;
  name: string;
  price: string;
  previousPrice: string | null;
  imageAlt: string;
  sellerInitials: string;
}

export interface StoreCopy {
  initials: string;
  name: string;
  location: string;
  description: string;
  rating: string;
  orders: string;
}

export interface ConfidenceCopy {
  title: string;
  description: string;
}

export interface Dictionary {
  metadata: {
    title: string;
    description: string;
  };
  illustrationLabel: string;
  illustrationAltPrefix: string;
  header: {
    brand: string;
    brandDescription: string;
    navLabel: string;
    nav: {
      markets: string;
      categories: string;
      stores: string;
      directSuuq: string;
    };
    searchLabel: string;
    searchPlaceholder: string;
    searchButton: string;
    searchLoading: string;
    languageThemeLabel: string;
    lightTheme: string;
    darkTheme: string;
    signIn: string;
    signUp: string;
    cart: string;
    cartEmpty: string;
    browseProducts: string;
    openMenu: string;
    closeMenu: string;
  };
  footer: {
    marketplaceHeading: string;
    marketplaceDescription: string;
    marketplaceLinks: string;
    supportHeading: string;
    supportLinks: {
      trust: string;
      payments: string;
      stores: string;
    };
    languageHeading: string;
    copyright: string;
  };
  language: {
    label: string;
    english: string;
    somali: string;
    changeError: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    description: string;
    imageAlt: string;
    startShopping: string;
    exploreMarkets: string;
    trustLine: string;
  };
  markets: {
    eyebrow: string;
    title: string;
    description: string;
    browseCount: string;
    localMerchants: string;
    exploreMarket: string;
    entries: MarketCopy[];
  };
  directSuuq: {
    eyebrow: string;
    title: string;
    description: string;
    verifiedInventory: string;
    directContact: string;
    explore: string;
  };
  categories: {
    eyebrow: string;
    title: string;
    description: string;
    browseItems: string;
    entries: CategoryCopy[];
    previous: string;
    next: string;
  };
  products: {
    eyebrow: string;
    title: string;
    filters: Record<ProductFilter, string>;
    entries: ProductCopy[];
    filterLabel: string;
    ratingLabel: string;
    noResults: string;
    addToCart: string;
  };
  stores: {
    eyebrow: string;
    title: string;
    viewAll: string;
    verified: string;
    visit: string;
    ratingLabel: string;
    entries: StoreCopy[];
  };
  confidence: {
    eyebrow: string;
    title: string;
    description: string;
    entries: ConfidenceCopy[];
  };
  auth: {
    loginTitle: string;
    loginDescription: string;
    loginWelcome: string;
    loginStory: string;
    registerTitle: string;
    vendorRegisterTitle: string;
    registerWelcome: string;
    registerStory: string;
    adminLoginTitle: string;
    customer: string;
    vendor: string;
    email: string;
    password: string;
    confirmPassword: string;
    showPassword: string;
    hidePassword: string;
    newPassword: string;
    accountType: string;
    verificationCode: string;
    submit: string;
    createAccount: string;
    forgotPassword: string;
    resendCode: string;
    requestReset: string;
    resetPassword: string;
    verifyEmailTitle: string;
    verifyEmailDescription: string;
    emailVerified: string;
    emailSent: string;
    resetRequested: string;
    passwordReset: string;
    accountCreated: string;
    requestFailed: string;
    backToLogin: string;
    noAccount: string;
    haveAccount: string;
    vendorRegistration: string;
    amazonSignIn: string;
    or: string;
    adminEmailStep: string;
    adminMfaStep: string;
    setupMfa: string;
    authenticatorSecret: string;
    recoveryCodes: string;
    recoveryCodesNotice: string;
    continueToAdmin: string;
    onboardingTitle: string;
    onboardingDescription: string;
    businessName: string;
    storeName: string;
    businessType: string;
    businessDescription: string;
    contactName: string;
    phone: string;
    country: string;
    region: string;
    city: string;
    address: string;
    marketAssociation: string;
    saveDraft: string;
    submitApplication: string;
    statusTitle: string;
    statusDescription: string;
    status: {
      notStarted: string;
      draft: string;
      pending: string;
      underReview: string;
      needsInformation: string;
      approved: string;
      rejected: string;
      suspended: string;
      unverified: string;
    };
    informationRequest: string;
    rejectionReason: string;
    viewStatus: string;
    editApplication: string;
    logout: string;
    reviewApplications: string;
    approve: string;
    reject: string;
    requestInformationAction: string;
    suspend: string;
    decisionNote: string;
    reviewReason: string;
    verificationStatus: string;
    verified: string;
    verificationPending: string;
    verificationRejected: string;
    vendorWorkspace: string;
    applicationStatus: string;
    customerWorkspace: string;
    accountTitle: string;
    signedInAs: string;
    amazonFailed: string;
    amazonCancelled: string;
    amazonUnavailable: string;
    accountLinkRequired: string;
    amazonVerifyEmail: string;
    passwordStrength: {
      weak: string;
      medium: string;
      strong: string;
    };
    passwordRuleLength: string;
    passwordRuleUppercase: string;
    passwordRuleLowercase: string;
    passwordRuleNumber: string;
    passwordRuleSymbol: string;
    passwordRequirementsMessage: string;
    passwordMismatch: string;
  };
}

type LeafPaths<T> = T extends readonly unknown[]
  ? never
  : {
      [K in keyof T & string]: T[K] extends string
        ? K
        : T[K] extends readonly unknown[]
          ? never
          : T[K] extends object
            ? `${K}.${LeafPaths<T[K]>}`
            : never;
    }[keyof T & string];

export type TranslationKey = LeafPaths<Dictionary>;
