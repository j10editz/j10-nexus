import "server-only";

import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import type {
  ExternalTriggerEvent,
} from "../../types/external-trigger";

import {
  INTEGRATION_AUTOMATION_TRIGGER_TYPE,
} from "../../types/integration-automation";

import type {
  AutomationEventDispatchResult,
  AutomationEventTrigger,
} from "../automation/event-trigger-engine";

import {
  dispatchAutomationEvent,
} from "../automation/event-trigger-engine";

import {
  summarizeIntegrationAutomationDispatchFailure,
} from "./automation-dispatch-summary";

export type DispatchIntegrationAutomationEventArgs = {
  supabase: SupabaseClient;
  event: ExternalTriggerEvent;
  origin: string;
};

async function markEventProcessed(
  supabase: SupabaseClient,
  event: ExternalTriggerEvent,
) {
  const {
    error,
  } =
    await supabase
      .from(
        "integration_webhook_events",
      )
      .update({
        processing_status:
          "processed",

        processed_at:
          new Date().toISOString(),

        failure_code:
          null,

        failure_message:
          null,
      })
      .eq(
        "id",
        event.id,
      )
      .eq(
        "user_id",
        event.workspaceId,
      );

  if (error) {
    throw new Error(
      "J10 dispatched the external trigger but could not finalize its processing state.",
    );
  }
}

async function markEventDispatchFailed(
  supabase: SupabaseClient,
  event: ExternalTriggerEvent,
  dispatch:
    AutomationEventDispatchResult,
) {
  const failureMessage =
    summarizeIntegrationAutomationDispatchFailure(
      dispatch,
    );

  const {
    error,
  } =
    await supabase
      .from(
        "integration_webhook_events",
      )
      .update({
        processing_status:
          "failed",

        failure_code:
          "INTEGRATION_AUTOMATION_DISPATCH_FAILED",

        failure_message:
          failureMessage,
      })
      .eq(
        "id",
        event.id,
      )
      .eq(
        "user_id",
        event.workspaceId,
      );

  if (error) {
    console.error(
      "J10 integration automation failure persistence error:",
      error,
    );
  }
}

export async function dispatchIntegrationAutomationEvent({
  supabase,
  event,
  origin,
}: DispatchIntegrationAutomationEventArgs): Promise<AutomationEventDispatchResult> {
  const payload:
    Record<string, unknown> = {
      schemaVersion:
        event.schemaVersion,

      eventId:
        event.id,

      externalEventId:
        event.externalEventId,

      dedupeKey:
        event.dedupeKey,

      capabilityId:
        event.capabilityId,

      providerEventType:
        event.providerEventType,

      providerId:
        event.source.providerId,

      integrationId:
        event.source.integrationId,

      endpointId:
        event.source.endpointId,

      occurredAt:
        event.occurredAt,

      receivedAt:
        event.receivedAt,

      source:
        event.source,

      subject:
        event.subject,

      actor:
        event.actor,

      data:
        event.data,

      metadata:
        event.metadata,

      integrationEvent:
        event,
    };

  const dispatch =
    await dispatchAutomationEvent({
      supabase,

      userId:
        event.workspaceId,

      origin,

      /*
      External webhook deliveries do not have a browser
      session. The event engine will create a signed,
      short-lived bridge cookie for each matched workflow.
      */
      cookieHeader:
        "",

      triggerType:
        INTEGRATION_AUTOMATION_TRIGGER_TYPE as
          AutomationEventTrigger,

      payload,

      originAutomationId:
        null,

      parentDepth:
        0,

      eventId:
        event.id,

      dedupeKey:
        event.dedupeKey,
    });

  if (!dispatch.success) {
    await markEventDispatchFailed(
      supabase,
      event,
      dispatch,
    );

    return dispatch;
  }

  await markEventProcessed(
    supabase,
    event,
  );

  return dispatch;
}
