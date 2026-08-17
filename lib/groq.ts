// Single source of truth for the Groq chat model.
//
// llama-3.3-70b-versatile was decommissioned on 2026-08-16. Groq's suggested
// replacements were openai/gpt-oss-120b and qwen/qwen3.6-27b; we use the former
// because qwen3.6 emits its <think> reasoning block inside message.content,
// which would surface raw reasoning to users in the improve flow. gpt-oss keeps
// reasoning in a separate message.reasoning field and leaves content clean.
export const GROQ_MODEL = "openai/gpt-oss-120b";
