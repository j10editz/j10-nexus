export const GOOGLE_CALENDAR_ACTION_CAPABILITIES = [
  "google-calendar.event.create",
  "google-calendar.event.update",
  "google-calendar.event.cancel",
] as const;

export type GoogleCalendarActionCapability =
  (typeof GOOGLE_CALENDAR_ACTION_CAPABILITIES)[number];

export const GOOGLE_CALENDAR_SEND_UPDATE_OPTIONS = [
  "all",
  "externalOnly",
  "none",
] as const;

export type GoogleCalendarSendUpdates =
  (typeof GOOGLE_CALENDAR_SEND_UPDATE_OPTIONS)[number];

export interface GoogleCalendarCreateEventInput {
  readonly calendarId?: string;
  readonly summary: string;
  readonly description?: string;
  readonly location?: string;
  readonly start: string;
  readonly end: string;
  readonly timeZone?: string;
  readonly attendees?: readonly string[];
  readonly sendUpdates?: GoogleCalendarSendUpdates;
}

export interface GoogleCalendarUpdateEventInput {
  readonly calendarId?: string;
  readonly eventId: string;
  readonly summary?: string;
  readonly description?: string;
  readonly location?: string;
  readonly start?: string;
  readonly end?: string;
  readonly timeZone?: string;
  readonly attendees?: readonly string[];
  readonly sendUpdates?: GoogleCalendarSendUpdates;
}

export interface GoogleCalendarCancelEventInput {
  readonly calendarId?: string;
  readonly eventId: string;
  readonly sendUpdates?: GoogleCalendarSendUpdates;
}

export type GoogleCalendarActionInput =
  | GoogleCalendarCreateEventInput
  | GoogleCalendarUpdateEventInput
  | GoogleCalendarCancelEventInput;

export interface GoogleCalendarRuntimeReceipt {
  readonly providerId: "google-calendar";
  readonly capabilityId: GoogleCalendarActionCapability;
  readonly mode: "simulate" | "sandbox";
  readonly externalSideEffect: false;
  readonly operationFingerprint: string;
}