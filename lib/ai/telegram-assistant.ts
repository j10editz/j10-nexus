import OpenAI from "openai";
import { SupabaseClient } from "@supabase/supabase-js";

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
 * Intelligent 24/7 AI conversational engine for Telegram.
 * Attempts OpenAI generation first. If quota is exhausted or unconfigured,
 * provides rich, context-aware conversational booking & customer qualification responses.
 */
export async function generateAndSendTelegramAIResponse(input: TelegramAIMessageInput): Promise<string> {
  const { supabase, workspaceId, threadId, chatId, messageText, senderName, token } = input;
  const lower = messageText.toLowerCase().trim();

  let replyText = "";

  // 1. Try OpenAI if key is present
  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  if (openAiKey) {
    try {
      const openai = new OpenAI({ apiKey: openAiKey });
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are J10 AI, the official 24/7 AI Revenue & Booking Assistant for J10 NEXUS.
Your job is to assist leads, answer questions, qualify their business needs, and book appointments/consultations.
Keep answers friendly, concise (2-3 sentences), professional, and invite the user to take the next step (share their preferred date/time or describe their project).
Address the user respectfully.`,
          },
          {
            role: "user",
            content: messageText,
          },
        ],
        max_tokens: 250,
      });

      const aiChoice = completion.choices[0]?.message?.content?.trim();
      if (aiChoice) {
        replyText = aiChoice;
      }
    } catch (openAiErr: any) {
      console.warn("OpenAI generation unavailable (falling back to J10 Intent Engine):", openAiErr?.message || openAiErr);
    }
  }

  // 2. Fallback to J10 24/7 Intent Engine if OpenAI was unavailable or failed
  if (!replyText) {
    if (lower === "/start") {
      replyText = `👋 Hello ${senderName}! Welcome to J10 NEXUS.\n\nI am your 24/7 AI Assistant. I can help you with bookings, service inquiries, and project consultations.\n\nHow can I help you today?`;
    } else if (lower === "/help" || lower.includes("help")) {
      replyText = `I'm here to help you 24/7! 🤝\n\nYou can:\n1. 📅 Book an appointment or call with our team\n2. 💼 Ask about our growth and automation services\n3. 💬 Leave your contact details for an executive consultation\n\nWhat would you like to explore?`;
    } else if (lower.includes("book") || lower.includes("schedule") || lower.includes("appointment") || lower.includes("call")) {
      replyText = `I would be happy to get you booked! 📅\n\nWhat day and time works best for you this week, and what is the primary goal for your session?`;
    } else if (lower.includes("price") || lower.includes("cost") || lower.includes("pricing") || lower.includes("plan")) {
      replyText = `Our solutions are tailored to your business tier (Starter, Growth, and Enterprise). What specific services or automation are you looking to implement?`;
    } else if (lower.includes("hello") || lower.includes("hi") || lower.includes("hey")) {
      replyText = `Hey ${senderName}! Thanks for reaching out to J10 NEXUS. How can I assist your business today?`;
    } else {
      replyText = `Thank you for your message, ${senderName}! I've logged your inquiry into our active workspace. Could you tell me a bit more about what you need so I can get you the exact solution?`;
    }
  }

  // 3. Resolve Telegram Bot Token from params, env, or integration metadata
  let activeToken = token || process.env.TELEGRAM_BOT_TOKEN;
  if (!activeToken) {
    const { data: integration } = await supabase
      .from("integrations")
      .select("metadata")
      .eq("workspace_id", workspaceId)
      .eq("provider", "telegram")
      .maybeSingle();

    activeToken = integration?.metadata?.bot_token;
  }

  if (!activeToken) {
    console.error("No Telegram bot token found for workspace", workspaceId);
    return replyText;
  }

  // 4. Dispatch to Telegram via Bot API sendMessage
  try {
    const telegramRes = await fetch(`https://api.telegram.org/bot${activeToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: replyText,
      }),
    });

    const telegramData = await telegramRes.json();
    const externalMessageId = telegramData?.result?.message_id ? String(telegramData.result.message_id) : undefined;

    // 4. Record outbound message in Supabase so it shows in the Unified Inbox
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

    // 5. Update thread timestamp & snippet
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

  return replyText;
}
