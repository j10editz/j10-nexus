export type ServiceLifecycleStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "booking_offered"
  | "booked"
  | "lost"
  | "human_takeover";

export interface ServiceCatalogItem {
  key: string;
  name: string;
  price?: number | null;
  priceDisplay?: string;
  durationMinutes?: number;
  description?: string;
  requiresQuote?: boolean;
  requiredFields?: string[];
}

export interface ServicePlaybookTerminology {
  serviceLabel: string; // e.g. "service", "treatment", "package"
  bookingLabel: string; // e.g. "appointment", "booking", "slot"
  providerLabel: string; // e.g. "stylist", "technician", "specialist"
}

export interface ServicePlaybook {
  playbookKey: string;
  industryName: string;
  displayName: string;
  description: string;
  terminology: ServicePlaybookTerminology;
  services: ServiceCatalogItem[];
  qualificationQuestions?: Record<string, string>;
  escalationKeywords?: string[];
  systemPromptInstructions?: string;
  defaultDurationMinutes?: number;
}

export interface ExtractedServiceIntent {
  playbookKey: string;
  requestedService: string | null;
  serviceKey: string | null;
  preferredDate: string | null;
  preferredTime: string | null;
  estimatedServiceValue: number | null;
  isQuoteRequired: boolean;
  qualificationCompleteness: number;
  missingRequiredFields: string[];
  offeredBookingLink: boolean;
  suggestedStatus: ServiceLifecycleStatus;
  humanHandoffRequested: boolean;
  humanHandoffReason?: string;
}

export interface ServiceConversionJourneyRecord {
  id: string;
  workspace_id: string;
  contact_id: string | null;
  thread_id: string | null;
  lead_intake_id: string | null;
  playbook_key: string;
  status: ServiceLifecycleStatus;
  requested_service: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  customer_name: string | null;
  normalized_phone: string | null;
  notes: string | null;
  media_references: unknown[];
  qualification_completeness: number;
  booking_offered_at: string | null;
  booking_confirmation_source: string | null;
  human_takeover_reason: string | null;
  estimated_service_value: number | null;
  attributed_revenue: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ServiceConversionMetrics {
  inquiriesReceived: number;
  contacted: number;
  qualified: number;
  bookingOffered: number;
  booked: number;
  lost: number;
  humanTakeovers: number;
  abandonedEligibleForFollowup: number;
  estimatedServiceValue: number;
  confirmedAttributedRevenue: number;
  inquiryToQualifiedRate: number;
  qualifiedToBookedRate: number;
  inquiryToBookedRate: number;
}
