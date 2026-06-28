import { DEFAULT_DEMO_CASE_ID, DEFAULT_DEMO_COMPANY_ID } from "../db/case-state-contract";

export type DemoCompany = {
  externalId: string;
  name: string;
  industry: string;
  baseCurrency: string;
  timezone: string;
  cashBalanceCents: number;
};

export type DemoCustomer = {
  externalId: string;
  name: string;
  segment: string;
  paymentTermsDays: number;
  riskScore: number;
  contacts: DemoContact[];
};

export type DemoContact = {
  externalId: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
};

export type DemoInvoice = {
  externalId: string;
  customerExternalId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  amountCents: number;
  amountPaidCents: number;
  status: "open" | "overdue" | "partially_paid" | "paid";
  description: string;
};

export type DemoObligation = {
  externalId: string;
  title: string;
  vendorName: string;
  category: string;
  dueDate: string;
  currency: string;
  amountCents: number;
  status: "scheduled" | "due" | "paid";
  priority: number;
};

export type DemoForecastPoint = {
  pointDate: string;
  expectedCashCents: number;
  inflowCents: number;
  outflowCents: number;
  notes: string;
};

export type DemoAction = {
  externalId: string;
  customerExternalId: string;
  invoiceExternalId: string;
  actionType: "email" | "call" | "payment_plan" | "internal_review";
  status: "recommended" | "needs_approval" | "approved" | "sent" | "completed";
  priority: number;
  scheduledFor: string;
  expectedRecoveryCents: number;
  title: string;
  rationale: string;
  approvalRequired: boolean;
};

export type DemoMemoryFact = {
  externalId: string;
  customerExternalId: string;
  sourceKind: "invoice" | "contact_note" | "payment_event";
  sourceExternalId: string;
  factText: string;
  confidence: number;
};

export type DemoCaseData = {
  caseId: string;
  company: DemoCompany;
  importBatch: {
    externalId: string;
    sourceName: string;
    sourceType: string;
  };
  sourceFiles: Array<{
    externalId: string;
    storageKey: string;
    originalFilename: string;
    contentType: string;
    sizeBytes: number;
  }>;
  customers: DemoCustomer[];
  invoices: DemoInvoice[];
  obligations: DemoObligation[];
  forecastRun: {
    externalId: string;
    horizonStartDate: string;
    horizonEndDate: string;
    openingCashCents: number;
    minimumCashCents: number;
    points: DemoForecastPoint[];
  };
  actionPlan: {
    externalId: string;
    summary: string;
    projectedRecoveryCents: number;
    actions: DemoAction[];
  };
  memoryFacts: DemoMemoryFact[];
};

export const demoCaseData: DemoCaseData = {
  caseId: DEFAULT_DEMO_CASE_ID,
  company: {
    externalId: DEFAULT_DEMO_COMPANY_ID,
    name: "Marlow & Finch Studio",
    industry: "Boutique interiors and fit-out",
    baseCurrency: "GBP",
    timezone: "Europe/London",
    cashBalanceCents: 41_250_00,
  },
  importBatch: {
    externalId: "batch_demo_2026_05_01",
    sourceName: "May 2026 finance export",
    sourceType: "demo_seed",
  },
  sourceFiles: [
    {
      externalId: "src_xero_ar_export_may",
      storageKey: "demo/marlow-finch/xero-ar-export-may.csv",
      originalFilename: "xero-ar-export-may.csv",
      contentType: "text/csv",
      sizeBytes: 18_432,
    },
    {
      externalId: "src_payroll_obligations_may",
      storageKey: "demo/marlow-finch/payroll-obligations-may.csv",
      originalFilename: "payroll-obligations-may.csv",
      contentType: "text/csv",
      sizeBytes: 9_728,
    },
  ],
  customers: [
    {
      externalId: "cust_northstar_hotels",
      name: "Northstar Hotels Ltd",
      segment: "hospitality",
      paymentTermsDays: 30,
      riskScore: 67,
      contacts: [
        {
          externalId: "contact_ella_reed",
          fullName: "Ella Reed",
          email: "ella.reed@example.invalid",
          phone: "+44 20 0100 0123",
          role: "Finance Manager",
        },
      ],
    },
    {
      externalId: "cust_rivergate_properties",
      name: "Rivergate Properties",
      segment: "commercial_property",
      paymentTermsDays: 45,
      riskScore: 48,
      contacts: [
        {
          externalId: "contact_sam_bennett",
          fullName: "Sam Bennett",
          email: "sam.bennett@example.invalid",
          phone: "+44 20 0100 0456",
          role: "Operations Director",
        },
      ],
    },
    {
      externalId: "cust_ember_lane",
      name: "Ember Lane Restaurants",
      segment: "restaurant_group",
      paymentTermsDays: 14,
      riskScore: 73,
      contacts: [
        {
          externalId: "contact_mina_shah",
          fullName: "Mina Shah",
          email: "mina.shah@example.invalid",
          phone: "+44 20 0100 0789",
          role: "Owner",
        },
      ],
    },
  ],
  invoices: [
    {
      externalId: "inv_ns_1048",
      customerExternalId: "cust_northstar_hotels",
      invoiceNumber: "NS-1048",
      issueDate: "2026-03-18",
      dueDate: "2026-04-17",
      currency: "GBP",
      amountCents: 18_600_00,
      amountPaidCents: 0,
      status: "overdue",
      description: "Lobby refresh design package",
    },
    {
      externalId: "inv_rg_2271",
      customerExternalId: "cust_rivergate_properties",
      invoiceNumber: "RG-2271",
      issueDate: "2026-04-08",
      dueDate: "2026-05-23",
      currency: "GBP",
      amountCents: 22_400_00,
      amountPaidCents: 10_000_00,
      status: "partially_paid",
      description: "Tenant lounge procurement deposit",
    },
    {
      externalId: "inv_el_3310",
      customerExternalId: "cust_ember_lane",
      invoiceNumber: "EL-3310",
      issueDate: "2026-04-21",
      dueDate: "2026-05-05",
      currency: "GBP",
      amountCents: 7_850_00,
      amountPaidCents: 0,
      status: "overdue",
      description: "Restaurant lighting installation",
    },
  ],
  obligations: [
    {
      externalId: "obl_payroll_2026_05_08",
      title: "May payroll",
      vendorName: "Marlow & Finch payroll",
      category: "payroll",
      dueDate: "2026-05-08",
      currency: "GBP",
      amountCents: 38_000_00,
      status: "scheduled",
      priority: 1,
    },
    {
      externalId: "obl_vat_2026_05_10",
      title: "VAT payment",
      vendorName: "HMRC",
      category: "tax",
      dueDate: "2026-05-10",
      currency: "GBP",
      amountCents: 9_600_00,
      status: "scheduled",
      priority: 2,
    },
  ],
  forecastRun: {
    externalId: "forecast_payroll_gap_2026_05",
    horizonStartDate: "2026-05-01",
    horizonEndDate: "2026-05-15",
    openingCashCents: 41_250_00,
    minimumCashCents: -6_350_00,
    points: [
      {
        pointDate: "2026-05-01",
        expectedCashCents: 41_250_00,
        inflowCents: 0,
        outflowCents: 0,
        notes: "Opening cash after April supplier run",
      },
      {
        pointDate: "2026-05-08",
        expectedCashCents: 3_250_00,
        inflowCents: 0,
        outflowCents: 38_000_00,
        notes: "Payroll clears before overdue invoices are recovered",
      },
      {
        pointDate: "2026-05-10",
        expectedCashCents: -6_350_00,
        inflowCents: 0,
        outflowCents: 9_600_00,
        notes: "VAT payment creates short-term cash gap",
      },
      {
        pointDate: "2026-05-12",
        expectedCashCents: 20_100_00,
        inflowCents: 26_450_00,
        outflowCents: 0,
        notes: "Recommended collections close the gap",
      },
    ],
  },
  actionPlan: {
    externalId: "plan_payroll_gap_2026_05",
    summary: "Recover at least GBP 26.45k before VAT clears to keep payroll week positive.",
    projectedRecoveryCents: 26_450_00,
    actions: [
      {
        externalId: "act_northstar_cfo_email",
        customerExternalId: "cust_northstar_hotels",
        invoiceExternalId: "inv_ns_1048",
        actionType: "email",
        status: "needs_approval",
        priority: 1,
        scheduledFor: "2026-05-02T09:00:00.000Z",
        expectedRecoveryCents: 18_600_00,
        title: "Send payment-link reminder to Northstar",
        rationale: "Northstar historically pays within 24 hours when the reminder includes project close-out evidence.",
        approvalRequired: true,
      },
      {
        externalId: "act_ember_lane_call",
        customerExternalId: "cust_ember_lane",
        invoiceExternalId: "inv_el_3310",
        actionType: "call",
        status: "needs_approval",
        priority: 2,
        scheduledFor: "2026-05-02T11:30:00.000Z",
        expectedRecoveryCents: 7_850_00,
        title: "Call Ember Lane owner before lunch service",
        rationale: "Owner responds faster to calls than email and has paid by card after verbal confirmation.",
        approvalRequired: true,
      },
    ],
  },
  memoryFacts: [
    {
      externalId: "mem_northstar_payment_link",
      customerExternalId: "cust_northstar_hotels",
      sourceKind: "payment_event",
      sourceExternalId: "inv_ns_1048",
      factText: "Northstar pays fastest when reminders include a payment link and the final snagging list.",
      confidence: 0.86,
    },
    {
      externalId: "mem_ember_call_window",
      customerExternalId: "cust_ember_lane",
      sourceKind: "contact_note",
      sourceExternalId: "contact_mina_shah",
      factText: "Ember Lane owner is usually reachable between 10:30 and 11:45 before lunch service.",
      confidence: 0.79,
    },
  ],
};
