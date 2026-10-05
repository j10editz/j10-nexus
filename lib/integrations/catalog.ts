export type IntegrationStatus = "available" | "next" | "roadmap";

export type IntegrationDefinition = {
  id: string;
  name: string;
  category: string;
  description: string;
  domain: string;
  status: IntegrationStatus;
};

export const INTEGRATION_CATEGORIES = [
  "Messaging", "Voice & SMS", "Email", "Scheduling", "Payments", "CRM",
  "Commerce", "Accounting", "Marketing & Leads", "Reviews", "Files & Data",
  "Team", "Automation", "Field Services",
] as const;

export const J10_INTEGRATIONS: IntegrationDefinition[] = [
  { id:"whatsapp", name:"WhatsApp Business", category:"Messaging", description:"Customer messaging and AI receptionist", domain:"whatsapp.com", status:"available" },
  { id:"telegram", name:"Telegram", category:"Messaging", description:"Business chats, bots, and paid groups", domain:"telegram.org", status:"available" },
  { id:"instagram", name:"Instagram", category:"Messaging", description:"Direct messages and lead conversations", domain:"instagram.com", status:"next" },
  { id:"messenger", name:"Messenger", category:"Messaging", description:"Facebook customer conversations", domain:"messenger.com", status:"next" },
  { id:"twilio", name:"Twilio", category:"Voice & SMS", description:"Phone, SMS, and missed-call workflows", domain:"twilio.com", status:"next" },
  { id:"telnyx", name:"Telnyx", category:"Voice & SMS", description:"Programmable voice and messaging", domain:"telnyx.com", status:"roadmap" },
  { id:"gmail", name:"Gmail", category:"Email", description:"Shared customer email workflows", domain:"gmail.com", status:"next" },
  { id:"outlook", name:"Microsoft Outlook", category:"Email", description:"Microsoft 365 email operations", domain:"outlook.com", status:"roadmap" },
  { id:"google-calendar", name:"Google Calendar", category:"Scheduling", description:"Availability, booking, and reminders", domain:"calendar.google.com", status:"next" },
  { id:"outlook-calendar", name:"Outlook Calendar", category:"Scheduling", description:"Microsoft 365 scheduling", domain:"outlook.com", status:"roadmap" },
  { id:"calendly", name:"Calendly", category:"Scheduling", description:"Scheduling links and appointment events", domain:"calendly.com", status:"roadmap" },
  { id:"acuity", name:"Acuity Scheduling", category:"Scheduling", description:"Service appointment scheduling", domain:"acuityscheduling.com", status:"roadmap" },
  { id:"stripe", name:"Stripe", category:"Payments", description:"Payment links, deposits, and billing events", domain:"stripe.com", status:"available" },
  { id:"square", name:"Square", category:"Payments", description:"Payments for local and retail businesses", domain:"squareup.com", status:"next" },
  { id:"paypal", name:"PayPal", category:"Payments", description:"Online payments and transaction events", domain:"paypal.com", status:"roadmap" },
  { id:"hubspot", name:"HubSpot", category:"CRM", description:"Contacts, deals, and lifecycle sync", domain:"hubspot.com", status:"next" },
  { id:"salesforce", name:"Salesforce", category:"CRM", description:"Enterprise CRM records and opportunities", domain:"salesforce.com", status:"roadmap" },
  { id:"pipedrive", name:"Pipedrive", category:"CRM", description:"Sales pipeline and deal activity", domain:"pipedrive.com", status:"roadmap" },
  { id:"zoho-crm", name:"Zoho CRM", category:"CRM", description:"Contacts, leads, and deal synchronization", domain:"zoho.com", status:"roadmap" },
  { id:"shopify", name:"Shopify", category:"Commerce", description:"Customers, orders, and abandoned carts", domain:"shopify.com", status:"next" },
  { id:"woocommerce", name:"WooCommerce", category:"Commerce", description:"Store orders and customer activity", domain:"woocommerce.com", status:"roadmap" },
  { id:"quickbooks", name:"QuickBooks", category:"Accounting", description:"Customers, invoices, and payment status", domain:"quickbooks.intuit.com", status:"next" },
  { id:"xero", name:"Xero", category:"Accounting", description:"Invoices and accounting synchronization", domain:"xero.com", status:"roadmap" },
  { id:"meta-leads", name:"Meta Lead Ads", category:"Marketing & Leads", description:"Facebook and Instagram lead capture", domain:"facebook.com", status:"next" },
  { id:"google-ads", name:"Google Ads", category:"Marketing & Leads", description:"Campaign attribution and lead sources", domain:"ads.google.com", status:"roadmap" },
  { id:"mailchimp", name:"Mailchimp", category:"Marketing & Leads", description:"Audience and email campaign sync", domain:"mailchimp.com", status:"roadmap" },
  { id:"typeform", name:"Typeform", category:"Marketing & Leads", description:"Forms and lead intake", domain:"typeform.com", status:"roadmap" },
  { id:"jotform", name:"Jotform", category:"Marketing & Leads", description:"Form submissions and customer intake", domain:"jotform.com", status:"roadmap" },
  { id:"google-business", name:"Google Business Profile", category:"Reviews", description:"Review requests, alerts, and replies", domain:"business.google.com", status:"next" },
  { id:"google-drive", name:"Google Drive", category:"Files & Data", description:"Business files and knowledge sources", domain:"drive.google.com", status:"next" },
  { id:"google-sheets", name:"Google Sheets", category:"Files & Data", description:"Import, export, and operational reporting", domain:"sheets.google.com", status:"next" },
  { id:"onedrive", name:"Microsoft OneDrive", category:"Files & Data", description:"Microsoft files and knowledge sources", domain:"onedrive.live.com", status:"roadmap" },
  { id:"dropbox", name:"Dropbox", category:"Files & Data", description:"Files and approved business documents", domain:"dropbox.com", status:"roadmap" },
  { id:"slack", name:"Slack", category:"Team", description:"Team alerts, approvals, and handoffs", domain:"slack.com", status:"next" },
  { id:"teams", name:"Microsoft Teams", category:"Team", description:"Team notifications and approvals", domain:"teams.microsoft.com", status:"roadmap" },
  { id:"zapier", name:"Zapier", category:"Automation", description:"Connect J10 to thousands of apps", domain:"zapier.com", status:"next" },
  { id:"make", name:"Make", category:"Automation", description:"Visual multi-app workflows", domain:"make.com", status:"roadmap" },
  { id:"n8n", name:"n8n", category:"Automation", description:"Flexible self-hosted automation", domain:"n8n.io", status:"roadmap" },
  { id:"webhooks", name:"Webhooks & API", category:"Automation", description:"Custom events and business systems", domain:"j10-nexus.com", status:"available" },
  { id:"jobber", name:"Jobber", category:"Field Services", description:"Jobs, quotes, scheduling, and customers", domain:"getjobber.com", status:"roadmap" },
  { id:"housecall-pro", name:"Housecall Pro", category:"Field Services", description:"Home-service bookings and dispatch", domain:"housecallpro.com", status:"roadmap" },
  { id:"mindbody", name:"Mindbody", category:"Field Services", description:"Wellness appointments and clients", domain:"mindbodyonline.com", status:"roadmap" },
];

export const INTEGRATION_STATUS_LABEL: Record<IntegrationStatus, string> = {
  available: "Available",
  next: "Next",
  roadmap: "Roadmap",
};
