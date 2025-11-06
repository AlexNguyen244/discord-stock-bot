import Database from "better-sqlite3";
import {
  getEarningsDate,
  createEarningsEvent,
  deleteEarningsEvent,
  deleteEarningsEvents
} from "./earnings.js";

// Initialize SQLite database
const db = new Database("watchlist.db");

// Create watchlist table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS watchlist (
    user_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, symbol)
  )
`);

/**
 * Handle /watch command and its subcommands
 * @param {Object} message - Discord message object
 * @param {string} text - Command text
 * @param {Function} getStockData - Function to fetch stock data
 * @param {Function} keepTyping - Function to keep typing indicator active
 */
export async function handleWatchCommand(message, text, getStockData, keepTyping) {
  const parts = text.split(/\s+/);
  const subcommand = parts[1]?.toLowerCase();
  const symbol = parts[2]?.toUpperCase();

  // /watch add SYMBOL
  if (subcommand === 'add') {
    if (!symbol || !/^[A-Z]{1,5}$/.test(symbol)) {
      message.reply("❌ Please provide a valid ticker symbol. Example: `/watch add AAPL`");
      return;
    }

    try {
      message.channel.sendTyping();
      const stopTyping = keepTyping(message.channel);

      // Verify the stock exists
      const stockData = await getStockData(symbol);
      if (!stockData) {
        stopTyping();
        message.reply(`❌ Couldn't find ticker "${symbol}". Please check the symbol and try again.`);
        return;
      }

      // Add to database
      const insert = db.prepare("INSERT OR IGNORE INTO watchlist (user_id, symbol) VALUES (?, ?)");
      const result = insert.run(message.author.id, symbol);

      if (result.changes > 0) {
        let replyMessage = `✅ Added **${symbol}** (${stockData.name}) to your watchlist!`;

        // Try to create earnings event if in a guild
        if (message.guild) {
          try {
            // Check if earnings event already exists
            const events = await message.guild.scheduledEvents.fetch();
            let eventExists = false;

            for (const [eventId, event] of events) {
              if (event.name.includes(symbol) && event.name.includes("Earnings")) {
                eventExists = true;
                break;
              }
            }

            if (!eventExists) {
              // Fetch earnings date
              const earningsData = await getEarningsDate(symbol);

              if (earningsData) {
                // Create the event
                const event = await createEarningsEvent(
                  message.guild,
                  symbol,
                  earningsData.earningsDate,
                  earningsData
                );

                if (event) {
                  // Use reportDate string to avoid timezone conversion issues
                  const dateStr = new Date(earningsData.reportDate + 'T12:00:00').toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    timeZone: 'America/Los_Angeles'
                  });
                  replyMessage += `\n📅 Created earnings event for ${dateStr}!`;
                }
              }
            }
          } catch (eventErr) {
            console.error(`Error creating earnings event for ${symbol}:`, eventErr);
            // Don't fail the whole operation if event creation fails
          }
        }

        stopTyping();
        message.reply(replyMessage);
      } else {
        stopTyping();
        message.reply(`⚠️ **${symbol}** is already in your watchlist.`);
      }
    } catch (err) {
      console.error("Error adding to watchlist:", err);
      message.reply("❌ An error occurred while adding to your watchlist.");
    }
    return;
  }

  // /watch remove SYMBOL
  if (subcommand === 'remove') {
    if (!symbol || !/^[A-Z]{1,5}$/.test(symbol)) {
      message.reply("❌ Please provide a valid ticker symbol. Example: `/watch remove AAPL`");
      return;
    }

    try {
      message.channel.sendTyping();
      const stopTyping = keepTyping(message.channel);

      const deleteStmt = db.prepare("DELETE FROM watchlist WHERE user_id = ? AND symbol = ?");
      const result = deleteStmt.run(message.author.id, symbol);

      if (result.changes > 0) {
        let replyMessage = `✅ Removed **${symbol}** from your watchlist.`;

        // Check if this symbol is still in any other user's watchlist
        const checkStmt = db.prepare("SELECT COUNT(*) as count FROM watchlist WHERE symbol = ?");
        const checkResult = checkStmt.get(symbol);

        // If no one else has this symbol, delete the earnings event
        if (checkResult.count === 0 && message.guild) {
          const eventDeleted = await deleteEarningsEvent(message.guild, symbol);
          if (eventDeleted) {
            replyMessage += `\n🗑️ Deleted earnings event for **${symbol}**.`;
          }
        }

        stopTyping();
        message.reply(replyMessage);
      } else {
        stopTyping();
        message.reply(`⚠️ **${symbol}** is not in your watchlist.`);
      }
    } catch (err) {
      console.error("Error removing from watchlist:", err);
      message.reply("❌ An error occurred while removing from your watchlist.");
    }
    return;
  }

  // /watch list
  if (subcommand === 'list') {
    try {
      const selectStmt = db.prepare("SELECT symbol FROM watchlist WHERE user_id = ? ORDER BY symbol");
      const watchlist = selectStmt.all(message.author.id);

      if (watchlist.length === 0) {
        message.reply("📋 Your watchlist is empty. Use `/watch add SYMBOL` to add stocks!");
        return;
      }

      // Fetch stock data for all symbols
      message.channel.sendTyping();
      const stopTyping = keepTyping(message.channel);
      const stockDataPromises = watchlist.map(row => getStockData(row.symbol));
      const stockDataResults = await Promise.all(stockDataPromises);

      let watchlistMessage = "**📋 Your Watchlist:**\n\n";
      stockDataResults.forEach((stock, index) => {
        if (stock) {
          const changeEmoji = stock.changePercent >= 0 ? "📈" : "📉";
          watchlistMessage += `${changeEmoji} **${stock.symbol}** - $${stock.price} (${stock.changePercent >= 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%)\n`;
        } else {
          watchlistMessage += `❌ **${watchlist[index].symbol}** - Error fetching data\n`;
        }
      });

      stopTyping();
      message.reply(watchlistMessage);
    } catch (err) {
      console.error("Error listing watchlist:", err);
      message.reply("❌ An error occurred while fetching your watchlist.");
    }
    return;
  }

  // /watch clear
  if (subcommand === 'clear') {
    try {
      message.channel.sendTyping();
      const stopTyping = keepTyping(message.channel);

      // Get user's current watchlist before clearing
      const selectStmt = db.prepare("SELECT symbol FROM watchlist WHERE user_id = ?");
      const userWatchlist = selectStmt.all(message.author.id);

      const deleteAllStmt = db.prepare("DELETE FROM watchlist WHERE user_id = ?");
      const result = deleteAllStmt.run(message.author.id);

      if (result.changes > 0) {
        let replyMessage = `✅ Cleared your watchlist (removed ${result.changes} stock${result.changes > 1 ? 's' : ''}).`;

        // Check which symbols are no longer in ANY watchlist and delete their events
        if (message.guild && userWatchlist.length > 0) {
          const symbolsToCheck = userWatchlist.map(row => row.symbol);
          const orphanedSymbols = [];

          for (const symbol of symbolsToCheck) {
            const checkStmt = db.prepare("SELECT COUNT(*) as count FROM watchlist WHERE symbol = ?");
            const checkResult = checkStmt.get(symbol);

            if (checkResult.count === 0) {
              orphanedSymbols.push(symbol);
            }
          }

          if (orphanedSymbols.length > 0) {
            const deleteResults = await deleteEarningsEvents(message.guild, orphanedSymbols);
            if (deleteResults.deleted.length > 0) {
              replyMessage += `\n🗑️ Also deleted ${deleteResults.deleted.length} earnings event(s).`;
            }
          }
        }

        stopTyping();
        message.reply(replyMessage);
      } else {
        stopTyping();
        message.reply("📋 Your watchlist is already empty.");
      }
    } catch (err) {
      console.error("Error clearing watchlist:", err);
      message.reply("❌ An error occurred while clearing your watchlist.");
    }
    return;
  }

  // Show help if no valid subcommand
  const watchHelp =
    "**📋 Watchlist Commands:**\n" +
    "• `/watch add SYMBOL` - Add a stock to your watchlist\n" +
    "• `/watch remove SYMBOL` - Remove a stock from watchlist\n" +
    "• `/watch list` - Show your watchlist with current prices\n" +
    "• `/watch clear` - Clear your entire watchlist\n\n" +
    "**Examples:**\n" +
    "• `/watch add AAPL`\n" +
    "• `/watch remove TSLA`\n" +
    "• `/watch list`";

  message.reply(watchHelp);
}

/**
 * Get all unique symbols from all watchlists
 * @returns {string[]} Array of unique symbols
 */
export function getAllWatchlistSymbols() {
  const allSymbolsStmt = db.prepare("SELECT DISTINCT symbol FROM watchlist ORDER BY symbol");
  return allSymbolsStmt.all().map(row => row.symbol);
}

export { db };
