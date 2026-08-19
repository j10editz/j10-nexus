import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import {
  dispatchAutomationEvent,
  getAutomationEventDepth,
} from "@/lib/automation/event-trigger-engine";

export type ApprovedCrmMutationAction =
  | "add_crm_note"
  | "update_crm_status";

type ContactStatus =
  | "New"
  | "Contacted"
  | "Qualified"
  | "Interested"
  | "Won"
  | "Lost";

type ExecuteApprovedCrmMutationInput = {
  supabase: SupabaseClient;

  userId: string;
  userEmail?: string | null;

  workflowId: string;
  workflowName: string;

  runId: string;

  stepId: string;
  stepOrder: number;
  stepName: string | null;

  actionType:
    ApprovedCrmMutationAction;

  instructions:
    | string
    | null;

  triggerPayload:
    Record<
      string,
      unknown
    >;

  origin: string;
  cookieHeader: string;
};

export type ApprovedCrmMutationResult = {
  success: true;

  actionType:
    ApprovedCrmMutationAction;

  contactId: string;

  contactName: string;

  resultText: string;

  previousStatus:
    string | null;

  newStatus:
    string | null;

  noteAdded:
    string | null;

  automationEvent:
    unknown;
};

const VALID_STATUSES:
  ContactStatus[] = [
    "New",
    "Contacted",
    "Qualified",
    "Interested",
    "Won",
    "Lost",
  ];

function asRecord(
  value: unknown
):
  | Record<
      string,
      unknown
    >
  | null {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as Record<
    string,
    unknown
  >;
}

function cleanString(
  value: unknown
) {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

function extractContactId(
  payload:
    Record<
      string,
      unknown
    >
) {
  const directCandidates = [
    payload.contactId,
    payload.crmContactId,
    payload.entityId,
  ];

  for (
    const candidate of
      directCandidates
  ) {
    const value =
      cleanString(
        candidate
      );

    if (value) {
      return value;
    }
  }

  const contact =
    asRecord(
      payload.contact
    );

  const contactId =
    cleanString(
      contact?.id
    );

  if (contactId) {
    return contactId;
  }

  const crm =
    asRecord(
      payload.crm
    );

  const crmContact =
    asRecord(
      crm?.contact
    );

  const nestedId =
    cleanString(
      crmContact?.id
    );

  if (nestedId) {
    return nestedId;
  }

  throw new Error(
    "J10 protected CRM action could not find an exact CRM contact ID in the workflow trigger context."
  );
}

function getContactName(
  contact: Record<
    string,
    unknown
  >
) {
  const firstName =
    cleanString(
      contact.first_name
    );

  const lastName =
    cleanString(
      contact.last_name
    );

  return (
    [
      firstName,
      lastName,
    ]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    "CRM Contact"
  );
}

function getTargetStatus(
  instructions:
    | string
    | null
) {
  const text =
    instructions?.trim() ??
    "";

  if (!text) {
    throw new Error(
      "J10 cannot execute the approved CRM status change because no target status was supplied."
    );
  }

  const explicit =
    text.match(
      /status\s*(?:to|=|:)\s*(New|Contacted|Qualified|Interested|Won|Lost)\b/i
    );

  if (explicit?.[1]) {
    return normalizeStatus(
      explicit[1]
    );
  }

  const marked =
    text.match(
      /\b(?:mark|move|set|change|update)(?:\s+(?:the\s+)?(?:lead|contact|crm))?(?:\s+status)?(?:\s+to|\s+as)?\s+(New|Contacted|Qualified|Interested|Won|Lost)\b/i
    );

  if (marked?.[1]) {
    return normalizeStatus(
      marked[1]
    );
  }

  const mentions =
    VALID_STATUSES.filter(
      (status) =>
        new RegExp(
          `\\b${status}\\b`,
          "i"
        ).test(text)
    );

  if (
    mentions.length ===
    1
  ) {
    return mentions[0];
  }

  throw new Error(
    'J10 could not determine the approved CRM target status. Use instructions such as "Set CRM status to Qualified".'
  );
}

function normalizeStatus(
  value: string
): ContactStatus {
  const found =
    VALID_STATUSES.find(
      (status) =>
        status.toLowerCase() ===
        value
          .trim()
          .toLowerCase()
    );

  if (!found) {
    throw new Error(
      "J10 received an unsupported CRM status."
    );
  }

  return found;
}

function getNoteText(
  instructions:
    | string
    | null
) {
  const raw =
    instructions?.trim() ??
    "";

  if (!raw) {
    throw new Error(
      "J10 cannot execute the approved CRM note action because the note content is empty."
    );
  }

  const stripped =
    raw
      .replace(
        /^(?:add|append|save)\s+(?:a\s+)?(?:crm\s+)?note\s*(?:to\s+(?:the\s+)?(?:lead|contact))?\s*[:\-]?\s*/i,
        ""
      )
      .trim();

  return stripped || raw;
}

export async function executeApprovedCrmMutation({
  supabase,
  userId,
  userEmail,
  workflowId,
  workflowName,
  runId,
  stepId,
  stepOrder,
  stepName,
  actionType,
  instructions,
  triggerPayload,
  origin,
  cookieHeader,
}: ExecuteApprovedCrmMutationInput): Promise<ApprovedCrmMutationResult> {
  const contactId =
    extractContactId(
      triggerPayload
    );

  /*
  ============================================================
  LOAD EXACT CONTACT
  ============================================================
  */

  const {
    data:
      contactData,
    error:
      contactError,
  } =
    await supabase
      .from(
        "crm_contacts"
      )
      .select("*")
      .eq(
        "id",
        contactId
      )
      .eq(
        "user_id",
        userId
      )
      .maybeSingle();

  if (
    contactError ||
    !contactData
  ) {
    throw new Error(
      "J10 could not load the exact CRM contact for the approved mutation."
    );
  }

  const contact =
    contactData as Record<
      string,
      unknown
    >;

  const contactName =
    getContactName(
      contact
    );

  const previousStatus =
    cleanString(
      contact.status
    ) || null;

  let newStatus:
    | string
    | null =
    previousStatus;

  let noteAdded:
    | string
    | null =
    null;

  let automationEvent:
    unknown =
    null;

  /*
  ============================================================
  APPROVED CRM NOTE
  ============================================================
  */

  if (
    actionType ===
    "add_crm_note"
  ) {
    const note =
      getNoteText(
        instructions
      );

    const existingNotes =
      cleanString(
        contact.notes
      );

    const combinedNotes =
      existingNotes
        ? `${existingNotes}\n\n${note}`
        : note;

    const {
      error:
        noteError,
    } =
      await supabase
        .from(
          "crm_contacts"
        )
        .update({
          notes:
            combinedNotes,

          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          contactId
        )
        .eq(
          "user_id",
          userId
        );

    if (noteError) {
      throw new Error(
        "Human approval was recorded, but J10 could not save the CRM note."
      );
    }

    noteAdded =
      note;

    await recordApprovedMutationActivity({
      supabase,
      userId,
      userEmail,
      workflowId,
      workflowName,
      runId,
      stepId,
      stepOrder,
      stepName,
      contactId,
      contactName,
      actionType,
      previousStatus,
      newStatus:
        previousStatus,
      noteAdded,
    });

    return {
      success: true,

      actionType,

      contactId,

      contactName,

      resultText:
        `Human-approved CRM note saved for ${contactName}.`,

      previousStatus,

      newStatus:
        previousStatus,

      noteAdded,

      automationEvent,
    };
  }

  /*
  ============================================================
  APPROVED CRM STATUS CHANGE
  ============================================================
  */

  const targetStatus =
    getTargetStatus(
      instructions
    );

  newStatus =
    targetStatus;

  if (
    previousStatus !==
    targetStatus
  ) {
    const updateData:
      Record<
        string,
        unknown
      > = {
        status:
          targetStatus,

        updated_at:
          new Date().toISOString(),
      };

    if (
      targetStatus ===
      "Contacted"
    ) {
      updateData.last_contacted_at =
        new Date().toISOString();
    }

    if (
      targetStatus ===
      "Won"
    ) {
      updateData.type =
        "Customer";
    }

    const {
      data:
        updatedContactData,
      error:
        statusError,
    } =
      await supabase
        .from(
          "crm_contacts"
        )
        .update(
          updateData
        )
        .eq(
          "id",
          contactId
        )
        .eq(
          "user_id",
          userId
        )
        .select("*")
        .single();

    if (
      statusError ||
      !updatedContactData
    ) {
      throw new Error(
        "Human approval was recorded, but J10 could not update the CRM status."
      );
    }

    const updatedContact =
      updatedContactData as Record<
        string,
        unknown
      >;

    const parentDepth =
      getAutomationEventDepth(
        triggerPayload
      );

    automationEvent =
      await dispatchAutomationEvent({
        supabase,

        userId,

        origin,

        cookieHeader,

        triggerType:
          "crm_status_changed",

        originAutomationId:
          workflowId,

        parentDepth,

        payload: {
          contact: {
            id:
              contactId,

            firstName:
              updatedContact.first_name ??
              null,

            lastName:
              updatedContact.last_name ??
              null,

            email:
              updatedContact.email ??
              null,

            phone:
              updatedContact.phone ??
              null,

            company:
              updatedContact.company ??
              null,

            type:
              updatedContact.type ??
              null,

            status:
              updatedContact.status ??
              null,

            source:
              updatedContact.source ??
              null,

            estimatedValue:
              updatedContact.estimated_value ??
              0,
          },

          previousStatus,

          newStatus:
            targetStatus,

          mutationSource:
            "human_approved_j10_automation",
        },
      });
  }

  await recordApprovedMutationActivity({
    supabase,
    userId,
    userEmail,
    workflowId,
    workflowName,
    runId,
    stepId,
    stepOrder,
    stepName,
    contactId,
    contactName,
    actionType,
    previousStatus,
    newStatus:
      targetStatus,
    noteAdded:
      null,
  });

  return {
    success: true,

    actionType,

    contactId,

    contactName,

    resultText:
      previousStatus ===
      targetStatus
        ? `${contactName} was already ${targetStatus}. The approved CRM status action completed without a duplicate mutation.`
        : `Human-approved CRM status updated for ${contactName}: ${previousStatus ?? "Unknown"} → ${targetStatus}.`,

    previousStatus,

    newStatus:
      targetStatus,

    noteAdded:
      null,

    automationEvent,
  };
}

async function recordApprovedMutationActivity({
  supabase,
  userId,
  userEmail,
  workflowId,
  workflowName,
  runId,
  stepId,
  stepOrder,
  stepName,
  contactId,
  contactName,
  actionType,
  previousStatus,
  newStatus,
  noteAdded,
}: {
  supabase:
    SupabaseClient;

  userId: string;

  userEmail?:
    | string
    | null;

  workflowId: string;
  workflowName: string;

  runId: string;

  stepId: string;
  stepOrder: number;
  stepName:
    | string
    | null;

  contactId: string;
  contactName: string;

  actionType:
    ApprovedCrmMutationAction;

  previousStatus:
    | string
    | null;

  newStatus:
    | string
    | null;

  noteAdded:
    | string
    | null;
}) {
  const {
    error,
  } =
    await supabase
      .from(
        "activity_logs"
      )
      .insert({
        user_id:
          userId,

        action:
          actionType ===
          "add_crm_note"
            ? "automation_crm_note_approved"
            : "automation_crm_status_approved",

        entity_type:
          "crm_contact",

        entity_id:
          contactId,

        title:
          actionType ===
          "add_crm_note"
            ? `Human-approved CRM note for ${contactName}`
            : `Human-approved CRM status change for ${contactName}`,

        description:
          actionType ===
          "add_crm_note"
            ? `${workflowName} saved an approved CRM note.`
            : `${workflowName} executed an approved CRM status mutation.`,

        metadata: {
          audit_type:
            "human_approved_automation_mutation",

          human_approved:
            true,

          approved_by_user_id:
            userId,

          approved_by_email:
            userEmail ??
            null,

          workflow_id:
            workflowId,

          workflow_name:
            workflowName,

          run_id:
            runId,

          step_id:
            stepId,

          step_order:
            stepOrder,

          step_name:
            stepName,

          action_type:
            actionType,

          crm_contact_id:
            contactId,

          crm_contact_name:
            contactName,

          previous_status:
            previousStatus,

          new_status:
            newStatus,

          note_added:
            noteAdded,
        },
      });

  if (error) {
    console.error(
      "Approved automation CRM audit error:",
      error
    );
  }
}