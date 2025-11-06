import { Client, GatewayIntentBits } from "discord.js";
import YahooFinance from "yahoo-finance2";
import dotenv from "dotenv";
import {
  respondToChat
} from "./ollama.js";
import {
  handleWatchCommand,
  getAllWatchlistSymbols
} from "./watchlist.js";
import {
  handleEarnCommand,
  syncEarningsEvents
} from "./earnings.js";
import {
  handleInsiderCommand
} from "./insider.js";
dotenv.config();

// Initialize Yahoo Finance
const yahooFinance = new YahooFinance();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildScheduledEvents
  ]
});

const CHAT_CHANNEL_ID = process.env.CHAT_CHANNEL_ID;

// Helper function to keep showing typing indicator during long operations
function keepTyping(channel) {
  const interval = setInterval(() => {
    channel.sendTyping().catch(() => clearInterval(interval));
  }, 8000); // Send typing every 8 seconds (Discord typing lasts ~10 seconds)

  return () => clearInterval(interval);
}

// Helper function to fetch all messages from a channel (last 100 messages)
async function fetchRecentMessages(channel, limit = 100) {
  try {
    const messages = await channel.messages.fetch({ limit });
    return Array.from(messages.values())
      .reverse() // Oldest first (chronological order)
      .map(msg => ({
        author: msg.author.username,
        content: msg.content,
        isBot: msg.author.bot,
        timestamp: msg.createdTimestamp
      }));
  } catch (error) {
    console.error('Error fetching messages:', error);
    return [];
  }
}

// Idle sleep timer (in ms, e.g., 10 minutes)
let lastActivity = Date.now();
const IDLE_TIMEOUT = 10 * 60 * 1000;

// Function to extract ticker symbols from text
function extractTickerSymbols(text) {
  // Match /SYMBOL pattern or standalone 2-5 letter uppercase words
  const tickerPattern = /\/([A-Z]{1,5})\b|(?:^|\s)([A-Z]{2,5})(?=\s|$|\?|,|\.)/g;
  const matches = [...text.matchAll(tickerPattern)];
  return matches.map(m => m[1] || m[2]).filter(Boolean);
}

// Function to fetch stock data from Yahoo Finance
async function getStockData(symbol) {
  try {
    const quote = await yahooFinance.quote(symbol);
    return {
      symbol: symbol,
      name: quote.shortName || symbol,
      price: quote.regularMarketPrice,
      change: quote.regularMarketChange,
      changePercent: quote.regularMarketChangePercent,
      dayHigh: quote.regularMarketDayHigh,
      dayLow: quote.regularMarketDayLow,
      fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
      volume: quote.regularMarketVolume,
      marketCap: quote.marketCap
    };
  } catch (error) {
    console.error(`Error fetching ${symbol}:`, error.message);
    return null;
  }
}

// Helper function to build stock data context for AI
async function buildStockDataContext(text) {
  const tickerSymbols = extractTickerSymbols(text);
  let stockDataContext = '';

  // If tickers are mentioned, fetch their data for context
  if (tickerSymbols.length > 0) {
    const stockDataPromises = tickerSymbols.map(symbol => getStockData(symbol));
    const stockDataResults = await Promise.all(stockDataPromises);

    // Build context with stock data
    const validStocks = stockDataResults.filter(data => data !== null);
    if (validStocks.length > 0) {
      stockDataContext = '\n\nCurrent stock data:\n' + validStocks.map(stock =>
        `${stock.symbol}: Price=$${stock.price}, DayHigh=$${stock.dayHigh}, DayLow=$${stock.dayLow}, 52WeekHigh=$${stock.fiftyTwoWeekHigh}, 52WeekLow=$${stock.fiftyTwoWeekLow}, Change=${stock.changePercent?.toFixed(2)}%`
      ).join('\n');
    }
  }

  return stockDataContext;
}

// Bot startup
client.once("clientReady", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // List all servers (guilds) the bot is in
  console.log("\n📋 Servers the bot is in:");
  client.guilds.cache.forEach(guild => {
    console.log(`  - ${guild.name} (ID: ${guild.id})`);
    console.log("    Channels:");
    guild.channels.cache.forEach(channel => {
      console.log(`      • ${channel.name} (ID: ${channel.id}) [Type: ${channel.type}]`);
    });
  });

  console.log(`\n🔍 Looking for channel ID: ${CHAT_CHANNEL_ID}\n`);

  // Send a greeting message automatically (only if channel ID is valid)
  if (CHAT_CHANNEL_ID) {
    try {
      const channel = await client.channels.fetch(CHAT_CHANNEL_ID);
      if (channel) {
        // Typing simulation
        channel.sendTyping();
        setTimeout(() => {
          channel.send(
            "👋 Hello! I'm online and ready to chat!\n\n" +
            "Type `/help` to see all available commands!\n\n" +
            "**Quick Start:**\n" +
            "• `/AAPL` - Get stock price\n" +
            "• `/watch add NVDA` - Add to watchlist\n" +
            "• `/earn estimate META` - View earnings\n" +
            "• `/insider TSLA` - View insider trades (default: 5)\n" +
            "• Mention @Stoink to chat with AI!"
          );
        }, 1500); // 1.5 seconds typing delay
        console.log("✅ Successfully sent greeting to channel!");
      }
    } catch (err) {
      console.log("❌ Could not fetch chat channel. Please check CHAT_CHANNEL_ID in .env");
      console.log("   Use one of the channel IDs listed above.");
    }
  }

  // Auto-sync earnings events for all watchlist stocks
  console.log("\n📅 Starting earnings events auto-sync...");
  try {
    // Get all unique symbols from all users' watchlists
    const allSymbols = getAllWatchlistSymbols();

    if (allSymbols.length > 0) {
      console.log(`Found ${allSymbols.length} unique stocks across all watchlists`);

      // Sync earnings events for each guild the bot is in
      for (const [guildId, guild] of client.guilds.cache) {
        console.log(`\nSyncing earnings events for guild: ${guild.name}`);
        const results = await syncEarningsEvents(guild, allSymbols);

        // Log summary
        if (results.created.length > 0) {
          console.log(`✅ Created ${results.created.length} new earnings event(s)`);
        }
        if (results.alreadyExists.length > 0) {
          console.log(`ℹ️  ${results.alreadyExists.length} event(s) already exist`);
        }
        if (results.skipped.length > 0) {
          console.log(`⏭️  Skipped ${results.skipped.length} event(s) (past dates or >90 days)`);
        }
        if (results.failed.length > 0) {
          console.log(`❌ Failed to fetch data for ${results.failed.length} stock(s)`);
        }
      }

      console.log("\n✅ Earnings events auto-sync complete!");
    } else {
      console.log("No stocks in watchlist, skipping earnings sync");
    }
  } catch (err) {
    console.error("❌ Error during earnings auto-sync:", err.message);
  }

  // Idle check interval
  setInterval(() => {
    if (Date.now() - lastActivity > IDLE_TIMEOUT) {
      console.log("💤 No activity for 10 minutes. Bot is sleeping...");
      process.exit(0); // shuts down bot
    }
  }, 60 * 1000); // check every minute
});

// Listen for messages
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.channel.id !== CHAT_CHANNEL_ID) return;

  lastActivity = Date.now(); // reset idle timer

  const text = message.content.trim();

  // Check if message starts with / for stock command
  if (text.startsWith('/')) {
    // Check for /help command
    if (text.toLowerCase() === '/help') {
      const helpMessage =
        "**📚 Stoink Bot Commands**\n\n" +
        "**Stock Lookups:**\n" +
        "• `/SYMBOL` - Get stock price (e.g., `/AMD`, `/AAPL`, `/TSLA`)\n\n" +
        "**Watchlist:**\n" +
        "• `/watch add SYMBOL` - Add a stock to your watchlist\n" +
        "• `/watch remove SYMBOL` - Remove a stock from watchlist\n" +
        "• `/watch list` - Show your watchlist\n" +
        "• `/watch clear` - Clear your entire watchlist\n\n" +
        "**Earnings:**\n" +
        "• `/earn estimate SYMBOL` - View earnings estimates\n" +
        "• `/earn history SYMBOL` - View earnings history\n\n" +
        "**Insider Trading:**\n" +
        "• `/insider SYMBOL` - View last 5 insider transactions (default)\n" +
        "• `/insider <limit> SYMBOL` - View custom number of transactions\n\n" +
        "**AI Chat:**\n" +
        "• Mention @Stoink to chat with AI!\n\n" +
        "**Examples:**\n" +
        "• `/NVDA`\n" +
        "• `/watch add AAPL`\n" +
        "• `/insider TSLA`\n" +
        "• `/insider 10 AAPL`";

      message.reply(helpMessage);
      return;
    }

    // Check for /watch command
    if (text.toLowerCase().startsWith('/watch')) {
      await handleWatchCommand(message, text, getStockData, keepTyping);
      return;
    }

    // Check for /earn command
    if (text.toLowerCase().startsWith('/earn')) {
      await handleEarnCommand(message, text, keepTyping);
      return;
    }

    // Check for /insider command
    if (text.toLowerCase().startsWith('/insider')) {
      await handleInsiderCommand(message, text, keepTyping);
      return;
    }

    const symbol = text.slice(1).toUpperCase().trim();

    // Validate ticker symbol (1-5 characters, letters only)
    if (/^[A-Z]{1,5}$/.test(symbol)) {
      try {
        const stockData = await getStockData(symbol);

        if (!stockData) {
          message.reply(`❌ Couldn't find ticker "${symbol}". Try another? (Example: /AAPL)`);
          return;
        }

        const stockInfo = `**${stockData.name} (${stockData.symbol})**\n` +
          `💰 Price: $${stockData.price}\n` +
          `📊 Change Today: ${stockData.changePercent.toFixed(2)}%\n` +
          `📈 Day High: $${stockData.dayHigh}\n` +
          `📉 Day Low: $${stockData.dayLow}\n` +
          `🔼 52-Week High: $${stockData.fiftyTwoWeekHigh}\n` +
          `🔽 52-Week Low: $${stockData.fiftyTwoWeekLow}`;

        message.channel.sendTyping();
        setTimeout(() => {
          message.reply(stockInfo);
        }, 1500); // typing delay
        return;
      } catch (err) {
        message.reply(`❌ Couldn't find ticker "${symbol}". Try another? (Example: /AAPL)`);
        return;
      }
    } else {
      message.reply("❌ Invalid ticker format. Use /SYMBOL (e.g., /AMD, /AAPL, /TSLA)");
      return;
    }
  }

  // Only respond with AI if bot is mentioned
  if (message.mentions.has(client.user)) {
    // Remove the mention from the text before sending to AI
    const textWithoutMention = text.replace(/<@!?\d+>/g, '').trim();

    if (textWithoutMention) {
      message.channel.sendTyping();
      const stopTyping = keepTyping(message.channel);

      // Fetch recent message history from Discord (last 100 messages)
      const messageHistory = await fetchRecentMessages(message.channel, 100);

      // Build stock data context for AI
      const stockDataContext = await buildStockDataContext(textWithoutMention);
      const aiResponse = await respondToChat(textWithoutMention, message.author.username, message.author.id, stockDataContext, messageHistory);
      stopTyping();
      if (aiResponse) {
        message.channel.sendTyping();
        setTimeout(() => {
          message.reply(aiResponse);
        }, 1000);
      }
    }
  }
});

// Login the bot
client.login(process.env.DISCORD_TOKEN);
