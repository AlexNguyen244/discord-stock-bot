import YahooFinance from "yahoo-finance2";
import dotenv from "dotenv";
dotenv.config();

// Initialize Yahoo Finance instance
const yf = new YahooFinance();

/**
 * Get insider transactions for a symbol
 * @param {string} symbol - Stock ticker symbol
 * @returns {Promise<Object|null>} Insider transactions data or null
 */
export async function getInsiderTransactions(symbol) {
  try {
    const result = await yf.quoteSummary(symbol, {
      modules: ["insiderTransactions", "insiderHolders"]
    });

    if (!result.insiderTransactions?.transactions && !result.insiderHolders?.holders) {
      console.log(`No insider transaction data found for ${symbol}`);
      return null;
    }

    return {
      symbol: symbol,
      transactions: result.insiderTransactions?.transactions || [],
      holders: result.insiderHolders?.holders || [],
      maxAge: result.insiderTransactions?.maxAge || null
    };
  } catch (error) {
    console.error(`Error fetching insider transactions for ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Format insider transaction data for display
 * @param {Object} data - Insider transaction data
 * @param {number} limit - Number of transactions to show
 * @returns {string} Formatted message
 */
export function formatInsiderTransactions(data, limit = 10) {
  if (!data || (data.transactions.length === 0 && data.holders.length === 0)) {
    return `❌ No insider transaction data available for **${data?.symbol || 'this stock'}**.`;
  }

  let message = `**${data.symbol} Insider Transactions**\n\n`;

  // Show recent transactions
  if (data.transactions && data.transactions.length > 0) {
    message += `📋 **Recent Transactions (Last ${Math.min(limit, data.transactions.length)}):**\n\n`;

    const recentTransactions = data.transactions.slice(0, limit);

    recentTransactions.forEach((transaction, index) => {
      const filerName = transaction.filerName || 'Unknown';
      const filerRelation = transaction.filerRelation || '';
      const transactionText = transaction.transactionText || 'Transaction';
      const shares = transaction.shares ? transaction.shares.toLocaleString() : 'N/A';

      // Handle value - can be a number or object
      let value = 'N/A';
      if (transaction.value) {
        if (typeof transaction.value === 'number') {
          value = `$${(transaction.value / 1000000).toFixed(2)}M`;
        } else if (transaction.value.raw) {
          value = `$${(transaction.value.raw / 1000000).toFixed(2)}M`;
        } else if (transaction.value.fmt) {
          value = transaction.value.fmt;
        }
      }

      // Handle date - can be a Date object or object with fmt
      let startDate = 'N/A';
      if (transaction.startDate) {
        if (transaction.startDate instanceof Date) {
          startDate = transaction.startDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          });
        } else if (transaction.startDate.fmt) {
          startDate = transaction.startDate.fmt;
        } else if (typeof transaction.startDate === 'string') {
          const date = new Date(transaction.startDate);
          startDate = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          });
        }
      }

      const nameWithTitle = filerRelation ? `${filerName} (${filerRelation})` : filerName;
      message += `**${index + 1}. ${nameWithTitle}**`;
      message += `   ${transactionText}\n`;
      message += `   Shares: ${shares}   Value: ${value}\n`;
      message += `   Date: ${startDate}\n\n`;
    });
  }

  // Show top insider holders if transactions are limited
  if (data.holders && data.holders.length > 0 && data.transactions.length < 3) {
    message += `\n👥 **Top Insider Holders:**\n\n`;

    data.holders.slice(0, 5).forEach((holder, index) => {
      const name = holder.name || 'Unknown';
      const position = holder.positionDirect?.fmt || holder.positionDirect?.raw?.toLocaleString() || 'N/A';
      const latestTransDate = holder.latestTransDate?.fmt || 'N/A';

      message += `**${index + 1}. ${name}**\n`;
      if (holder.relation) {
        message += `   Position: ${holder.relation}\n`;
      }
      message += `   Shares: ${position}\n`;
      message += `   Latest Transaction: ${latestTransDate}\n\n`;
    });
  }

  return message;
}

/**
 * Handle /insider command
 * @param {Object} message - Discord message object
 * @param {string} text - Command text
 * @param {Function} keepTyping - Function to keep typing indicator active
 */
export async function handleInsiderCommand(message, text, keepTyping) {
  const parts = text.split(/\s+/);

  // Check if first argument is a number (limit) or symbol
  let limit = 5; // default
  let symbol;

  if (parts.length >= 3) {
    // Format: /insider 10 AAPL
    const possibleLimit = parseInt(parts[1]);
    if (!isNaN(possibleLimit) && possibleLimit > 0) {
      limit = Math.min(possibleLimit, 50); // Cap at 50
      symbol = parts[2]?.toUpperCase();
    } else {
      message.reply("❌ Invalid format. Use: `/insider AAPL` or `/insider 10 AAPL`");
      return;
    }
  } else if (parts.length === 2) {
    // Format: /insider AAPL
    symbol = parts[1]?.toUpperCase();
  } else {
    message.reply("❌ Please provide a valid ticker symbol. Example: `/insider AAPL` or `/insider 10 AAPL`");
    return;
  }

  if (!symbol || !/^[A-Z]{1,5}$/.test(symbol)) {
    message.reply("❌ Please provide a valid ticker symbol. Example: `/insider AAPL` or `/insider 10 AAPL`");
    return;
  }

  try {
    message.channel.sendTyping();
    const stopTyping = keepTyping(message.channel);
    const insiderData = await getInsiderTransactions(symbol);

    if (!insiderData) {
      stopTyping();
      message.reply(`❌ No insider transaction data found for **${symbol}**.`);
      return;
    }

    const formattedMessage = formatInsiderTransactions(insiderData, limit);
    stopTyping();
    message.reply(formattedMessage);
  } catch (err) {
    console.error("Error fetching insider transactions:", err);
    message.reply("❌ An error occurred while fetching insider transactions.");
  }
}
