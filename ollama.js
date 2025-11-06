import { Ollama } from "ollama";

// Initialize Ollama
const ollama = new Ollama();

// Function to format Discord message history as plain text for Ollama
function formatChatHistoryAsText(messageHistory) {
  return messageHistory
    .filter(msg => {
      // Filter out bot's meta messages like "I only respond based on Discord chat history"
      if (msg.isBot && msg.content) {
        const isMetaMessage =
          msg.content.includes("I only respond based on Discord chat history") ||
          msg.content.includes("I don't have that information in the chat history") ||
          msg.content.includes("My AI brain is offline");
        return !isMetaMessage;
      }
      return true;
    })
    .map(msg => {
      const timestamp = new Date(msg.timestamp).toLocaleString();
      const author = msg.isBot ? `[BOT] ${msg.author}` : msg.author;
      const content = msg.content || '[No text content]';
      return `[${timestamp}] ${author}: ${content}`;
    }).join('\n');
}

// Function to check if relevant data exists in chat history
function hasRelevantDataInHistory(text, chatHistoryText, stockDataContext) {
  // If stock data context is provided, we have current data
  if (stockDataContext && stockDataContext.trim()) {
    return true;
  }

  // Extract potential stock symbols from the user's question
  const symbolPattern = /\b[A-Z]{2,5}\b/g;
  const mentionedSymbols = text.match(symbolPattern) || [];

  // If user is asking about specific stocks
  if (mentionedSymbols.length > 0) {
    // Check if those symbols appear in chat history
    const symbolsInHistory = mentionedSymbols.filter(symbol =>
      chatHistoryText.includes(symbol) || chatHistoryText.includes(`/${symbol}`)
    );

    // If asking about stocks but none are in history, we don't have data
    if (symbolsInHistory.length === 0) {
      return false;
    }
  }

  // For general questions (not about specific stocks), allow them
  const isGeneralQuestion = /^(hello|hi|hey|thanks|thank you|how are you|what can you do|help)/i.test(text);
  if (isGeneralQuestion) {
    return true;
  }

  // If there's some chat history, assume we can answer
  if (chatHistoryText.trim().length > 0) {
    return true;
  }

  return false;
}

// Function for smart chat using Ollama Mistral with Discord message history
async function respondToChat(text, username, userId, stockDataContext = '', messageHistory = []) {
  try {
    // Format the entire chat history as plain text (last 100 messages)
    const recentMessages = messageHistory.slice(-100);
    const chatHistoryText = formatChatHistoryAsText(recentMessages);

    // Check if we have relevant data in chat history first
    if (!hasRelevantDataInHistory(text, chatHistoryText, stockDataContext)) {
      return "I don't have that information in the chat history. Please use the available commands to look it up first (e.g., `/SYMBOL` for stock prices, `/watch list` for your watchlist, `/earn estimate SYMBOL` for earnings).";
    }

    // Build messages array with system prompt and chat history as a TEXT BLOCK
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
1. You can ONLY reference information from the DISCORD CHAT HISTORY provided below
2. Do NOT use any pre-trained knowledge about stocks, companies, or market data
3. Your ONLY job is to read the chat history and answer questions based on what's there
4. If the information is not in the chat history, say "I don't have that information in the chat history"
5. Simply repeat/summarize data found in the chat - don't add your own knowledge

DISCORD CHAT HISTORY:
${chatHistoryText}

${stockDataContext ? `\nCURRENT STOCK DATA CONTEXT:\n${stockDataContext}` : ''}

Now answer the user's question using ONLY the information above.`
      },
      {
        role: 'user',
        content: `${username}: ${text}`
      }
    ];

    const response = await ollama.chat({
      model: 'mistral',
      messages: messages,
      options: {
        temperature: 0.7,
        max_tokens: 150
      }
    });

    const aiReply = response.message.content;

    return aiReply;
  } catch (error) {
    console.error('Ollama error:', error.message || error);
    // Fallback to simple responses if Ollama is not available
    if (/hello|hi|hey/i.test(text)) return "Hey! Want to look up a stock?";
    if (/how are you/i.test(text)) return "I'm just chilling in the cloud 😎";
    if (/thanks|thank you/i.test(text)) return "You're welcome!";

    // If Ollama is not running, provide a helpful message for complex queries
    if (error.code === 'ECONNREFUSED' || error.message?.includes('connect')) {
      return "🤖 My AI brain is offline right now. I can still look up stock tickers for you though! Just mention a ticker symbol (like AAPL, TSLA, AMD).";
    }

    return null;
  }
}

export {
  respondToChat
};
