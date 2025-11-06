import { Ollama } from "ollama";

const ollama = new Ollama();

// Function to convert Discord messages to Ollama message array
function structureChatForOllama(messageHistory) {
  return messageHistory
    .filter(msg => {
      if (msg.isBot && msg.content) {
        const isMetaMessage =
          msg.content.includes("I only respond based on Discord chat history") ||
          msg.content.includes("I don't have that information in the chat history") ||
          msg.content.includes("My AI brain is offline");
        return !isMetaMessage;
      }
      return true;
    })
    .map(msg => ({
      role: 'user', // everything from Discord users is treated as "user"
      content: `[${new Date(msg.timestamp).toLocaleString()}] ${msg.isBot ? '[BOT]' : ''}${msg.author}: ${msg.content || '[No text content]'}`
    }));
}

// Function for smart chat using Ollama Mistral with structured message array
async function respondToChat(text, username, userId, messageHistory = []) {
  try {
    // Last 100 messages
    const recentMessages = messageHistory.slice(-100);
    const structuredMessages = structureChatForOllama(recentMessages);

    // Append the current user query as the last message
    structuredMessages.push({
      role: 'user',
      content: `${username}: ${text}`
    });

    // System prompt as the first message
    const currentDate = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const messages = [
      {
        role: 'system',
        content: `SYSTEM PROMPT:
You are a Discord chatbot. Today's date is ${currentDate}.

CRITICAL RULES:
1. ONLY use the Discord messages provided below. Do NOT reference any external knowledge.
2. NEVER invent information. If the answer is not in the messages, respond EXACTLY: "I don't have that information in the chat history."
3. ONLY summarize or repeat information from the messages.
4. DO NOT interpret, infer, or give advice outside of what is explicitly in the messages.
5. Each Discord message is a separate entry in the history array; answer based ONLY on these messages.`
      },
      ...structuredMessages
    ];

    const response = await ollama.chat({
      model: 'mistral',
      messages,
      options: {
        temperature: 0,
        max_tokens: 200
      }
    });

    const aiReply = response.message.content;

    return aiReply;

  } catch (error) {
    console.error('Ollama error:', error.message || error);

    if (/hello|hi|hey/i.test(text)) return "Hey! Want to look up a stock?";
    if (/how are you/i.test(text)) return "I'm just chilling in the cloud 😎";
    if (/thanks|thank you/i.test(text)) return "You're welcome!";
    if (error.code === 'ECONNREFUSED' || error.message?.includes('connect')) {
      return "🤖 My AI brain is offline right now. I can still look up stock tickers for you though! Just mention a ticker symbol (like AAPL, TSLA, AMD).";
    }

    return null;
  }
}

export { respondToChat };
