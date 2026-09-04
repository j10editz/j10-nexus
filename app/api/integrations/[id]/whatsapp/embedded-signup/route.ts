import { NextResponse } from "next/server";

import { createIntegrationApiClient, getAuthenticatedIntegrationUser, integrationApiErrorResponse, parseRequestObject } from "@/lib/integrations/api";
import { getIntegrationCredentials, storeIntegrationCredentials } from "@/lib/integrations/credentials";
import { getIntegrationConnectionById, updateIntegrationConnectionConfiguration, updateIntegrationConnectionStatus } from "@/lib/integrations/database";

type RouteContext = { params: Promise<{ id: string }> };
type JsonRecord = Record<string, unknown>;
const GRAPH_VERSION = "v26.0";
const META_APP_ID = process.env.META_WHATSAPP_APP_ID ?? process.env.NEXT_PUBLIC_META_APP_ID ?? "1830547288111074";

function requiredString(body: JsonRecord, key: string, pattern: RegExp, label: string) {
  const value = typeof body[key] === "string" ? body[key].trim() : "";
  if (!value || !pattern.test(value)) throw new Error(`${label} is missing or invalid.`);
  return value;
}

async function graphJson(url: URL, token?: string): Promise<JsonRecord> {
  const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined, signal: AbortSignal.timeout(20_000), cache: "no-store" });
  const text = await response.text();
  if (text.length > 131_072) throw new Error("Meta returned an oversized response.");
  let body: JsonRecord = {};
  try { body = text ? JSON.parse(text) as JsonRecord : {}; } catch { throw new Error("Meta returned an unreadable response."); }
  if (!response.ok) throw new Error("Meta rejected the WhatsApp authorization. Please reconnect and try again.");
  return body;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createIntegrationApiClient();
    const user = await getAuthenticatedIntegrationUser(supabase);
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    const connection = await getIntegrationConnectionById(supabase, user.id, id);
    if (!connection || connection.providerId !== "whatsapp-business") return NextResponse.json({ success: false, error: "WhatsApp Business connection was not found." }, { status: 404 });

    const body = parseRequestObject(await request.json());
    const code = requiredString(body, "code", /^[A-Za-z0-9_.#=-]{20,4096}$/, "Authorization code");
    const wabaId = requiredString(body, "wabaId", /^\d{5,30}$/, "WhatsApp Business Account ID");
    const phoneNumberId = requiredString(body, "phoneNumberId", /^\d{5,30}$/, "Phone number ID");
    const appSecret = process.env.META_WHATSAPP_APP_SECRET ?? process.env.META_APP_SECRET;
    if (!appSecret) return NextResponse.json({ success: false, error: "J10 server setup is missing META_WHATSAPP_APP_SECRET." }, { status: 503 });

    const tokenUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", META_APP_ID);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("code", code);
    const tokenBody = await graphJson(tokenUrl);
    const accessToken = typeof tokenBody.access_token === "string" ? tokenBody.access_token.trim() : "";
    if (!accessToken || accessToken.length > 32_768) throw new Error("Meta did not return a valid access token.");

    const phones = await graphJson(new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating`), accessToken);
    const rows = Array.isArray(phones.data) ? phones.data : [];
    const phone = rows.find((entry) => entry && typeof entry === "object" && (entry as JsonRecord).id === phoneNumberId) as JsonRecord | undefined;
    if (!phone) return NextResponse.json({ success: false, error: "The selected phone number does not belong to the selected WhatsApp Business Account." }, { status: 409 });

    const existing = await getIntegrationCredentials(supabase, user.id, connection.id);
    await storeIntegrationCredentials(supabase, user.id, { connectionId: connection.id, values: { ...(existing?.values ?? {}), access_token: accessToken } });
    await updateIntegrationConnectionConfiguration(supabase, user.id, connection.id, {
      publicConfiguration: { ...connection.publicConfiguration, phone_number_id: phoneNumberId, business_account_id: wabaId, onboarding_method: "embedded_signup_coexistence", graph_api_version: GRAPH_VERSION },
      enabledCapabilities: connection.enabledCapabilities,
    });
    await updateIntegrationConnectionStatus(supabase, user.id, connection.id, { status: "connected", reason: "Meta Embedded Signup verified the WhatsApp account and phone number.", metadata: { source: "meta_embedded_signup", waba_id: wabaId, phone_number_id: phoneNumberId } });

    return NextResponse.json({ success: true, phone: { id: phoneNumberId, displayPhoneNumber: typeof phone.display_phone_number === "string" ? phone.display_phone_number : null, verifiedName: typeof phone.verified_name === "string" ? phone.verified_name : null, qualityRating: typeof phone.quality_rating === "string" ? phone.quality_rating : null } });
  } catch (error) {
    return integrationApiErrorResponse(error, "Could not complete WhatsApp Embedded Signup.");
  }
}
