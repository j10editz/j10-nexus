import assert from "node:assert/strict";
import test from "node:test";

import {
  buildJ10FlowTriggerConfig,
  evaluateIntegrationTriggerBinding,
  getAutomationTriggerDisplayLabel,
} from "../lib/automation/integration-trigger.ts";

import {
  resolveAutomationRunGraphSnapshot,
} from "../lib/automation/run-snapshot.ts";

import {
  summarizeIntegrationAutomationDispatchFailure,
} from "../lib/integrations/automation-dispatch-summary.ts";

const whatsappBinding = {
  provider:
    "whatsapp-business",
  eventType:
    "whatsapp.message.received",
};

const whatsappPayload = {
  providerId:
    "whatsapp-business",
  providerEventType:
    "whatsapp.message.received",
};

test(
  "integration events require an exact provider and event type binding",
  () => {
    assert.equal(
      evaluateIntegrationTriggerBinding(
        whatsappBinding,
        whatsappPayload,
      ).passed,
      true,
    );

    assert.equal(
      evaluateIntegrationTriggerBinding(
        {
          provider:
            "whatsapp-business",
          eventType:
            "whatsapp.message.status",
        },
        whatsappPayload,
      ).passed,
      false,
    );

    assert.equal(
      evaluateIntegrationTriggerBinding(
        {},
        whatsappPayload,
      ).passed,
      false,
    );
  },
);

test(
  "the WhatsApp trigger is labeled as an integration event",
  () => {
    assert.equal(
      getAutomationTriggerDisplayLabel(
        "integration_event",
        whatsappBinding,
      ),
      "Integration Event · WhatsApp Business / WhatsApp Message Received",
    );

    assert.equal(
      getAutomationTriggerDisplayLabel(
        "future_trigger",
      ),
      "Unknown Trigger · Future Trigger",
    );
  },
);

test(
  "saved integration bindings survive J10 Flow graph reconstruction",
  () => {
    assert.deepEqual(
      buildJ10FlowTriggerConfig({
        triggerConfig:
          whatsappBinding,
        scheduleExpression:
          null,
        timezone:
          "America/Chicago",
      }),
      {
        scheduleExpression:
          null,
        timezone:
          "America/Chicago",
        provider:
          "whatsapp-business",
        eventType:
          "whatsapp.message.received",
      },
    );
  },
);

test(
  "unpublished workflows store an empty graph snapshot instead of null",
  () => {
    assert.deepEqual(
      resolveAutomationRunGraphSnapshot(
        null,
      ),
      {},
    );

    const graphSnapshot = {
      version:
        "2026-08-day16",
    };

    assert.equal(
      resolveAutomationRunGraphSnapshot({
        graph_snapshot:
          graphSnapshot,
      }),
      graphSnapshot,
    );
  },
);

test(
  "dispatch failure details are retained with sensitive assignments redacted",
  () => {
    const message =
      summarizeIntegrationAutomationDispatchFailure({
        success: false,
        triggerType:
          "integration_event",
        eventId:
          "event-1",
        depth: 1,
        matched: 1,
        filtered: 0,
        deduplicated: 0,
        executed: 1,
        completed: 0,
        awaitingApproval: 0,
        failed: 1,
        skipped: 0,
        results: [
          {
            automationId:
              "automation-1",
            automationName:
              "WhatsApp Incoming Message Test",
            status:
              "failed",
            runId:
              null,
            message:
              "Run insert failed; token=do-not-store-this",
          },
        ],
      });

    assert.match(
      message,
      /Run insert failed/,
    );

    assert.doesNotMatch(
      message,
      /do-not-store-this/,
    );

    assert.match(
      message,
      /token=\[REDACTED\]/,
    );
  },
);
