import type {
  WhatsAppMediaMessageInput,
  WhatsAppMediaType,
  WhatsAppTemplateMessageInput,
  WhatsAppTextMessageInput,
} from "@/types/integration-whatsapp";
import {
  WHATSAPP_ACTION_CAPABILITY_IDS,
} from "@/types/integration-whatsapp";
import {
  IntegrationRuntimeError,
} from "@/types/integration-runtime";

const MAX_TEXT_LENGTH = 4_096;
const MAX_CAPTION_LENGTH = 1_024;
const MAX_FILENAME_LENGTH = 255;
const MAX_TEMPLATE_COMPONENT_BYTES = 64 * 1024;

type JsonRecord = Record<string, unknown>;

function validationError(message: string): IntegrationRuntimeError {
  return new IntegrationRuntimeError(message, {
    code: "WHATSAPP_ACTION_INPUT_INVALID",
    category: "validation",
    status: 400,
  });
}

function requireText(
  value: unknown,
  label: string,
  maximumLength: number,
): string {
  if (typeof value !== "string") {
    throw validationError(`${label} is required.`);
  }

  const normalized = value.trim();

  if (!normalized || normalized.length > maximumLength) {
    throw validationError(`${label} is invalid.`);
  }

  return normalized;
}

function optionalText(
  value: unknown,
  label: string,
  maximumLength: number,
): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return requireText(value, label, maximumLength);
}

function normalizeRecipient(value: unknown): string {
  const recipient = requireText(value, "WhatsApp recipient", 32)
    .replace(/[\s()+.-]/g, "");

  if (!/^[1-9]\d{6,14}$/.test(recipient)) {
    throw validationError(
      "WhatsApp recipient must be an international phone number.",
    );
  }

  return recipient;
}

function parseTextInput(input: JsonRecord): WhatsAppTextMessageInput {
  if (
    input.previewUrl !== undefined &&
    typeof input.previewUrl !== "boolean"
  ) {
    throw validationError("WhatsApp previewUrl must be true or false.");
  }

  return {
    to: normalizeRecipient(input.to),
    message: requireText(input.message, "WhatsApp message", MAX_TEXT_LENGTH),
    previewUrl: input.previewUrl === true,
  };
}

function parseTemplateInput(input: JsonRecord): WhatsAppTemplateMessageInput {
  const templateName = requireText(
    input.templateName,
    "WhatsApp template name",
    512,
  );

  if (!/^[a-z0-9_]+$/.test(templateName)) {
    throw validationError("WhatsApp template name is invalid.");
  }

  const languageCode = optionalText(
    input.languageCode,
    "WhatsApp template language",
    16,
  ) ?? "en_US";

  if (!/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(languageCode)) {
    throw validationError("WhatsApp template language is invalid.");
  }

  let components:
    readonly Readonly<Record<string, unknown>>[] | undefined;

  if (input.components !== undefined && input.components !== null) {
    if (
      !Array.isArray(input.components) ||
      input.components.some(
        (component) =>
          typeof component !== "object" ||
          component === null ||
          Array.isArray(component),
      )
    ) {
      throw validationError("WhatsApp template components are invalid.");
    }

    let encoded: string;

    try {
      encoded = JSON.stringify(input.components);
    } catch {
      throw validationError("WhatsApp template components are invalid.");
    }

    if (Buffer.byteLength(encoded, "utf8") > MAX_TEMPLATE_COMPONENT_BYTES) {
      throw validationError("WhatsApp template components are too large.");
    }

    components = input.components as readonly Readonly<Record<string, unknown>>[];
  }

  return {
    to: normalizeRecipient(input.to),
    templateName,
    languageCode,
    components,
  };
}

function parseMediaInput(input: JsonRecord): WhatsAppMediaMessageInput {
  const mediaType = requireText(
    input.mediaType,
    "WhatsApp media type",
    16,
  ) as WhatsAppMediaType;

  if (!["audio", "document", "image", "video"].includes(mediaType)) {
    throw validationError("WhatsApp media type is invalid.");
  }

  const mediaUrl = requireText(input.mediaUrl, "WhatsApp media URL", 8_192);
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(mediaUrl);
  } catch {
    throw validationError("WhatsApp media URL is invalid.");
  }

  if (parsedUrl.protocol !== "https:") {
    throw validationError("WhatsApp media URL must use HTTPS.");
  }

  return {
    to: normalizeRecipient(input.to),
    mediaType,
    mediaUrl: parsedUrl.toString(),
    caption:
      mediaType === "audio"
        ? undefined
        : optionalText(input.caption, "WhatsApp media caption", MAX_CAPTION_LENGTH),
    filename:
      mediaType === "document"
        ? optionalText(input.filename, "WhatsApp document filename", MAX_FILENAME_LENGTH)
        : undefined,
  };
}

export function buildWhatsAppCloudPayload(
  capabilityId: string,
  input: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  switch (capabilityId) {
    case WHATSAPP_ACTION_CAPABILITY_IDS.messageSend: {
      const parsed = parseTextInput(input);

      return {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: parsed.to,
        type: "text",
        text: {
          preview_url: parsed.previewUrl,
          body: parsed.message,
        },
      };
    }

    case WHATSAPP_ACTION_CAPABILITY_IDS.templateSend: {
      const parsed = parseTemplateInput(input);

      return {
        messaging_product: "whatsapp",
        to: parsed.to,
        type: "template",
        template: {
          name: parsed.templateName,
          language: { code: parsed.languageCode },
          ...(parsed.components ? { components: parsed.components } : {}),
        },
      };
    }

    case WHATSAPP_ACTION_CAPABILITY_IDS.mediaSend: {
      const parsed = parseMediaInput(input);
      const media: Record<string, unknown> = { link: parsed.mediaUrl };

      if (parsed.caption) {
        media.caption = parsed.caption;
      }

      if (parsed.filename) {
        media.filename = parsed.filename;
      }

      return {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: parsed.to,
        type: parsed.mediaType,
        [parsed.mediaType]: media,
      };
    }

    default:
      throw new IntegrationRuntimeError(
        "The WhatsApp capability is not implemented by this runtime.",
        {
          code: "WHATSAPP_CAPABILITY_NOT_IMPLEMENTED",
          category: "configuration",
          status: 501,
        },
      );
  }
}
