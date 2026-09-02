import { describe, expect, it } from "vitest";

import { buildWhatsAppCloudPayload } from "@/lib/integrations/providers/whatsapp/payload";

describe("WhatsApp Cloud API payloads", () => {
  it("builds a normalized text message without exposing credentials", () => {
    expect(
      buildWhatsAppCloudPayload("whatsapp.message.send", {
        to: "+1 (305) 555-0100",
        message: "Your J10 appointment is confirmed.",
        previewUrl: false,
      }),
    ).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "13055550100",
      type: "text",
      text: {
        preview_url: false,
        body: "Your J10 appointment is confirmed.",
      },
    });
  });

  it("builds an approved template with language and components", () => {
    const payload = buildWhatsAppCloudPayload("whatsapp.template.send", {
      to: "13055550100",
      templateName: "appointment_confirmed",
      languageCode: "en_US",
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: "Jordan" }],
        },
      ],
    });

    expect(payload.type).toBe("template");
    expect(payload.template).toMatchObject({
      name: "appointment_confirmed",
      language: { code: "en_US" },
    });
  });

  it("accepts HTTPS media and blocks unsafe recipient or URL input", () => {
    expect(
      buildWhatsAppCloudPayload("whatsapp.media.send", {
        to: "13055550100",
        mediaType: "document",
        mediaUrl: "https://cdn.example.com/invoice.pdf",
        filename: "invoice.pdf",
      }),
    ).toMatchObject({
      type: "document",
      document: {
        link: "https://cdn.example.com/invoice.pdf",
        filename: "invoice.pdf",
      },
    });

    expect(() =>
      buildWhatsAppCloudPayload("whatsapp.media.send", {
        to: "not-a-phone",
        mediaType: "image",
        mediaUrl: "http://unsafe.example/image.png",
      }),
    ).toThrow();
  });
});
