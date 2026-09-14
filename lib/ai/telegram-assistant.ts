import { SupabaseClient } from "@supabase/supabase-js";
import https from "https";

interface TelegramAIMessageInput {
  supabase: SupabaseClient;
  workspaceId: string;
  threadId: string;
  chatId: string | number;
  messageText: string;
  senderName: string;
  token?: string;
}

/**
 * Robust Google Gemini generator with multi-model fallback and spike retry.
 */
async function callGeminiAPI(apiKey: string, prompt: string, history: Array<{ role: "user" | "model"; text: string }> = []): Promise<string | null> {
  const candidateModels = [
    "gemini-3-flash-preview",
    "gemini-flash-latest",
    "gemini-2.5-flash"
  ];

  const systemInstruction = `You are J10 AI, the official 24/7 AI Revenue & Operations Assistant for J10 NEXUS.
You can answer ANYTHING and EVERYTHING:
- High-level business strategy, revenue intelligence, and money tracking
- Full service booking, scheduling, consultations, and onboarding
- Automation, lead qualification, workflows, marketing, and tech questions
- General conversational topics and inquiries

Special Command Context:
- /book: Cheerfully ask for their preferred day/time and primary project goal to schedule their session.
- /services: Summarize J10 NEXUS's pillars: 24/7 AI Lead Capture across all social channels, Omnichannel Unified Inbox, Autopilot Follow-ups, and Real-Time Revenue Tracking.
- /revenue: Explain how J10 tracks actual closed deals, proposal cash flow, and ROI directly from leads in real time.
- /human: Confirm that a human specialist has been alerted in the J10 Unified Inbox, and ask if they prefer a callback or email.
- /help or /start: Greet warmly and present clear next steps.

Personality & Tone:
- Charismatic, intelligent, executive-level, and helpful
- Keep responses concise and formatted cleanly for Telegram (2 to 4 punchy sentences or clear bullet points)
- If the user provides short numbers or choices (like '1', '2', '110'), interpret them smartly in context and take the next step
- Always address the user directly and proactively offer to book them or solve their request.`;

  // Format contents with conversation history
  const contents = history.map((h) => ({
    role: h.role,
    parts: [{ text: h.text }],
  }));

  contents.push({
    role: "user",
    parts: [{ text: prompt }],
  });

  for (const model of candidateModels) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const reply = await new Promise<string>((resolve, reject) => {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
          const body = JSON.stringify({
            system_instruction: { parts: [{ text: systemInstruction }] },
            contents,
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 400,
            },
          });

          const req = https.request(
            url,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body),
              },
            },
            (res) => {
              let data = "";
              res.on("data", (d) => (data += d));
              res.on("end", () => {
                try {
                  const json = JSON.parse(data);
                  if (json.candidates?.[0]?.content?.parts?.[0]?.text) {
                    resolve(json.candidates[0].content.parts[0].text.trim());
                  } else if (res.statusCode === 503 || res.statusCode === 429) {
                    reject(new Error(`API busy (${res.statusCode})`));
                  } else {
                    reject(new Error(json.error?.message || `HTTP ${res.statusCode}`));
                  }
                } catch (e) {
                  reject(e);
                }
              });
            }
          );

          req.on("error", reject);
          req.write(body);
          req.end();
        });

        if (reply) return reply;
      } catch {
        // Wait 750ms before retry or next model
        await new Promise((r) => setTimeout(r, 750));
      }
    }
  }

  return null;
}

/**
 * Intelligent 24/7 AI conversational engine for Telegram.
 * Uses Google Gemini for full conversational reasoning.
 */
export async function generateAndSendTelegramAIResponse(input: TelegramAIMessageInput): Promise<string> {
  const { supabase, workspaceId, threadId, chatId, messageText, senderName, token } = input;
  const lower = messageText.toLowerCase().trim();

  // 1. Resolve Gemini Key from env or integration metadata
  let geminiKey = process.env.GEMINI_API_KEY?.trim();
  let botToken = token || process.env.TELEGRAM_BOT_TOKEN;

  if (!geminiKey || !botToken) {
    const { data: integration } = await supabase
      .from("integrations")
      .select("metadata")
      .eq("workspace_id", workspaceId)
      .eq("provider", "telegram")
      .maybeSingle();

    if (!geminiKey) {
      geminiKey = integration?.metadata?.gemini_api_key;
    }
    if (!botToken) {
      botToken = integration?.metadata?.bot_token;
    }
  }

  // 2. Fetch last 6 messages in this thread for conversational context
  const history: Array<{ role: "user" | "model"; text: string }> = [];
  try {
    const { data: pastMsgs } = await supabase
      .from("inbox_messages")
      .select("direction, content")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(6);

    if (pastMsgs && pastMsgs.length > 0) {
      // reverse to chronological order
      for (const m of pastMsgs.reverse()) {
        if (m.content && m.content.trim()) {
          history.push({
            role: m.direction === "inbound" ? "user" : "model",
            text: m.content.trim(),
          });
        }
      }
    }
  } catch (err) {
    console.warn("Could not fetch past message history:", err);
  }

  let replyText = "";

  // 3. Call Google Gemini LLM
  if (geminiKey) {
    try {
      const aiReply = await callGeminiAPI(geminiKey, messageText, history);
      if (aiReply) {
        replyText = aiReply;
      }
    } catch (err) {
      console.warn("Gemini call failed:", err);
    }
  }

  // 4. Safety Fallback if API completely unreachable
  if (!replyText) {
    if (lower === "/start") {
      replyText = `👋 Hello ${senderName}! Welcome to J10 NEXUS.\n\nI am your 24/7 AI Revenue & Booking Assistant. How can I help your business today?`;
    } else if (lower.includes("book") || lower.includes("schedule") || lower.includes("appointment")) {
      replyText = `I would be thrilled to get you scheduled! 📅 What day and time works best for you, and what would you like to discuss?`;
    } else {
      replyText = `Got it, ${senderName}! I'm on it. Could you share a few more details so I can get this handled for you immediately?`;
    }
  }

  // 5. Dispatch to Telegram via Bot API sendMessage
  if (botToken) {
    try {
      const telegramRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: replyText,
        }),
      });

      const telegramData = await telegramRes.json();
      const externalMessageId = telegramData?.result?.message_id ? String(telegramData.result.message_id) : undefined;

      // 6. Record outbound message in Supabase
      await supabase.from("inbox_messages").insert({
        workspace_id: workspaceId,
        thread_id: threadId,
        direction: "outbound",
        provider: "telegram",
        external_message_id: externalMessageId,
        content: replyText,
        delivery_status: "sent",
        message_type: "text",
        metadata: {
          senderName: "J10 AI (24/7 Assistant)",
          isAiGenerated: true,
          telegram_chat_id: String(chatId),
        },
      });

      // 7. Update thread timestamp & snippet
      await supabase
        .from("inbox_threads")
        .update({
          last_message_at: new Date().toISOString(),
          metadata: {
            lastMessageSnippet: replyText.slice(0, 150),
          },
        })
        .eq("id", threadId)
        .eq("workspace_id", workspaceId);

    } catch (err) {
      console.error("Failed to send Telegram AI response:", err);
    }
  }

  return replyText;
}
