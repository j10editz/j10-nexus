export function answerPublicQuestion(question: string): string {
  const q = question.toLowerCase();
  if (/password|secret|token|api key|delete my|rotate/.test(q)) return "I cannot access accounts or change credentials. Please use your authenticated account settings. Never share passwords or API keys here.";
  if (/price|pricing|cost|plan|annual/.test(q)) return "Starter is $19/month or $190/year, Growth is $49/month or $490/year, and Business is $99/month or $990/year. Provider usage fees are separate. See Pricing for plan details.";
  if (/trial|72|free/.test(q)) return "Your 72-hour free trial starts after you complete and approve Outcome Onboarding, not simply when you create an account.";
  if (/sign|account|google|apple|register/.test(q)) return "Use Start Free to create your account, or Sign in if you already have one. Google sign-in is available when enabled for the current environment. Apple sign-in is not currently offered.";
  if (/whatsapp|telegram|instagram|channel|connect|messenger/.test(q)) return "WhatsApp and Telegram have connection flows. Check J10 Connections in your workspace for your actual connection status. I cannot confirm that another channel is available for your account.";
  if (/book|appointment|deposit|payment/.test(q)) return "The conversation on this page illustrates a booking and deposit workflow. It does not create a real appointment or payment. Actual availability depends on your workspace setup and connected services.";
  return "I can help with pricing, the 72-hour trial, signup, and supported connections. Choose a topic below, or visit Contact for a question I cannot answer. This is an automated FAQ assistant; it cannot access your workspace.";
}
