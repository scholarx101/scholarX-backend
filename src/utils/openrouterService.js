const axios = require("axios");

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

// Free/cheap models optimized for cost
const MODELS = {
  // DeepSeek - very cheap and capable
  chat: process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat",
  // Llama 3.1 - free tier friendly
  research: "meta-llama/llama-3.1-8b-instruct",
  // Mistral - balanced and cheap
  code: "mistralai/mistral-7b-instruct",
};

/**
 * Call OpenRouter API
 * @param {string} model - Model name
 * @param {array} messages - Chat messages
 * @param {object} options - Additional options (temperature, max_tokens, etc)
 */
const callOpenRouter = async (model, messages, options = {}) => {
  try {
    if (!OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY not configured in .env");
    }

    const payload = {
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 1500,
      top_p: options.top_p ?? 0.9,
      ...options,
    };

    const response = await axios.post(`${OPENROUTER_BASE_URL}/chat/completions`, payload, {
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://scholarx.ai",
        "X-Title": "ScholarX Lab AI Tools",
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });

    if (!response.data?.choices?.[0]?.message?.content) {
      throw new Error("No response from AI model");
    }

    return {
      success: true,
      content: response.data.choices[0].message.content,
      usage: response.data.usage || {},
      model: response.data.model,
    };
  } catch (error) {
    console.error("OpenRouter API Error:", error.message);
    return {
      success: false,
      error: error.message,
      content: null,
    };
  }
};

/**
 * General chat with AI (lab discussions, Q&A)
 */
exports.chat = async (userMessage, conversationHistory = []) => {
  const messages = [
    ...conversationHistory,
    { role: "user", content: userMessage },
  ];

  return callOpenRouter(MODELS.chat, messages, {
    temperature: 0.7,
    max_tokens: 1500,
  });
};

/**
 * Analyze research paper or document
 */
exports.analyzeDocument = async (documentText, analysisType = "summarize") => {
  const prompts = {
    summarize: `Please provide a concise summary of the following document:\n\n${documentText}`,
    keyfindings: `Extract the key findings and conclusions from:\n\n${documentText}`,
    methodology: `Explain the methodology used in:\n\n${documentText}`,
    critique: `Provide a critical analysis of:\n\n${documentText}`,
  };

  const userMessage = prompts[analysisType] || prompts.summarize;

  return callOpenRouter(MODELS.research, [
    { role: "user", content: userMessage },
  ], {
    temperature: 0.5,
    max_tokens: 2000,
  });
};

/**
 * Explain code or data
 */
exports.explainCode = async (code, language = "javascript") => {
  const userMessage = `Explain this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\``;

  return callOpenRouter(MODELS.code, [
    { role: "user", content: userMessage },
  ], {
    temperature: 0.5,
    max_tokens: 1500,
  });
};

/**
 * Generate research ideas or suggestions
 */
exports.generateIdeas = async (topic, context = "") => {
  const userMessage = `Generate 5 innovative research ideas for: ${topic}${
    context ? `\n\nContext: ${context}` : ""
  }`;

  return callOpenRouter(MODELS.research, [
    { role: "user", content: userMessage },
  ], {
    temperature: 0.8,
    max_tokens: 2000,
  });
};

/**
 * Tutor/explain concept
 */
exports.tutorExplain = async (concept, level = "beginner") => {
  const levels = {
    beginner: "a beginner with no prior knowledge",
    intermediate: "an intermediate student",
    advanced: "an advanced researcher",
  };

  const userMessage = `Explain this concept to ${levels[level] || levels.beginner}: ${concept}. Include examples and practical applications in the lab context.`;

  return callOpenRouter(MODELS.chat, [
    { role: "user", content: userMessage },
  ], {
    temperature: 0.6,
    max_tokens: 1500,
  });
};

/**
 * Review and give feedback on text (lab report, proposal, etc)
 */
exports.reviewText = async (text, reviewType = "academic") => {
  const prompts = {
    academic: `Review this academic text for clarity, structure, and quality:\n\n${text}`,
    technical: `Review this technical documentation:\n\n${text}`,
    proposal: `Review this research proposal:\n\n${text}`,
  };

  const userMessage = prompts[reviewType] || prompts.academic;

  return callOpenRouter(MODELS.chat, [
    { role: "user", content: userMessage },
  ], {
    temperature: 0.5,
    max_tokens: 1500,
  });
};

/**
 * Get available models (for admin/testing)
 */
exports.getModels = () => MODELS;
