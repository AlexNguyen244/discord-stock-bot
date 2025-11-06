import YahooFinance from "yahoo-finance2";
import dotenv from "dotenv";
dotenv.config();

// Initialize Yahoo Finance instance (required for v2)
const yf = new YahooFinance();

/**
 * Fetch earnings date for a given stock symbol from Yahoo Finance
 * @param {string} symbol - Stock ticker symbol
 * @returns {Promise<Object|null>} Earnings data with date and estimate, or null if not found
 */
export async function getEarningsDate(symbol) {
  try {
    // Fetch calendar events from Yahoo Finance
    const result = await yf.quoteSummary(symbol, {
      modules: ["calendarEvents", "earnings"]
    });

    const earnings = result.calendarEvents?.earnings || result.earnings;

    if (!earnings || !earnings.earningsDate || earnings.earningsDate.length === 0) {
      console.log(`No earnings date found for ${symbol}`);
      return null;
    }

    // Yahoo Finance returns earnings date as a Date object or array of Date objects
    const earningsDate = Array.isArray(earnings.earningsDate)
      ? earnings.earningsDate[0]
      : earnings.earningsDate;

    // Format the date as YYYY-MM-DD string
    const reportDate = earningsDate.toISOString().split('T')[0];

    console.log(`✅ Found earnings date for ${symbol}: ${reportDate}`);

    return {
      symbol: symbol,
      earningsDate: earningsDate,
      reportDate: reportDate,
      earningsAverage: earnings.earningsAverage || null,
      earningsLow: earnings.earningsLow || null,
      earningsHigh: earnings.earningsHigh || null,
      revenueAverage: earnings.revenueAverage || null,
      revenueLow: earnings.revenueLow || null,
      revenueHigh: earnings.revenueHigh || null
    };
  } catch (error) {
    console.error(`Error fetching earnings for ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Create a Discord scheduled event for an earnings report
 * @param {Object} guild - Discord guild object
 * @param {string} symbol - Stock ticker symbol
 * @param {Date} earningsDate - Date of earnings report
 * @param {Object} earningsInfo - Additional earnings information
 * @returns {Promise<Object|null>} Created event or null if failed
 */
export async function createEarningsEvent(guild, symbol, earningsDate, earningsInfo = {}) {
  try {
    // Parse the date string in PST timezone
    // Yahoo Finance returns a Date object, convert to YYYY-MM-DD format
    const dateStr = earningsDate instanceof Date ? earningsDate.toISOString().split('T')[0] : earningsDate;

    // Create date at 1:00 PM PST on the given date
    // PST is UTC-8, so 1:00 PM PST = 21:00 UTC
    // For date "2025-11-19", we want 1PM PST on Nov 19, which is 9PM UTC on Nov 19
    // So we parse the date and manually set PST time
    const [year, month, day] = dateStr.split('-').map(Number);
    const eventDate = new Date(Date.UTC(year, month - 1, day, 21, 0, 0, 0));

    // Check if date is in the past
    if (eventDate < new Date()) {
      console.log(`Earnings date for ${symbol} is in the past, skipping event creation`);
      return null;
    }

    // Check if event date is too far in the future (Discord has a limit)
    const maxFutureDate = new Date();
    maxFutureDate.setDate(maxFutureDate.getDate() + 90); // 90 days limit

    if (eventDate > maxFutureDate) {
      console.log(`Earnings date for ${symbol} is too far in the future (>90 days), skipping`);
      return null;
    }

    // Format event description
    let description = `📊 **${symbol} Earnings Report**\n\nUpcoming earnings announcement for ${symbol}.`;

    if (earningsInfo.earningsAverage) {
      description += `\n\n**EPS Estimate:** $${earningsInfo.earningsAverage.toFixed(2)}`;
    }

    if (earningsInfo.revenueAverage) {
      const revenueInBillions = (earningsInfo.revenueAverage / 1e9).toFixed(2);
      description += `\n**Revenue Estimate:** $${revenueInBillions}B`;
    }

    // Create the scheduled event
    const event = await guild.scheduledEvents.create({
      name: `${symbol} Earnings Report`,
      scheduledStartTime: eventDate,
      scheduledEndTime: new Date(eventDate.getTime() + 60 * 60 * 1000), // 1 hour duration
      privacyLevel: 2, // GUILD_ONLY
      entityType: 3, // EXTERNAL
      description: description,
      entityMetadata: {
        location: `https://finance.yahoo.com/quote/${symbol}`
      }
    });

    console.log(`✅ Created earnings event for ${symbol} on ${eventDate.toLocaleDateString()} at 1:00 PM PST`);
    return event;
  } catch (error) {
    console.error(`Error creating event for ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Check if an earnings event already exists for a symbol
 * @param {Object} guild - Discord guild object
 * @param {string} symbol - Stock ticker symbol
 * @returns {Promise<boolean>} True if event exists, false otherwise
 */
export async function hasEarningsEvent(guild, symbol) {
  try {
    const events = await guild.scheduledEvents.fetch();

    // Check if any event name includes the symbol and "Earnings"
    for (const [eventId, event] of events) {
      if (event.name.includes(symbol) && event.name.includes("Earnings")) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error(`Error checking events for ${symbol}:`, error.message);
    return false;
  }
}

/**
 * Delete earnings event for a specific symbol
 * @param {Object} guild - Discord guild object
 * @param {string} symbol - Stock ticker symbol
 * @returns {Promise<boolean>} True if event was deleted, false otherwise
 */
export async function deleteEarningsEvent(guild, symbol) {
  try {
    const events = await guild.scheduledEvents.fetch();

    // Find and delete all earnings events for this symbol
    let deleted = false;
    for (const [eventId, event] of events) {
      if (event.name.includes(symbol) && event.name.includes("Earnings")) {
        await event.delete();
        console.log(`🗑️  Deleted earnings event for ${symbol}`);
        deleted = true;
      }
    }

    return deleted;
  } catch (error) {
    console.error(`Error deleting event for ${symbol}:`, error.message);
    return false;
  }
}

/**
 * Delete earnings events for multiple symbols
 * @param {Object} guild - Discord guild object
 * @param {string[]} symbols - Array of stock ticker symbols
 * @returns {Promise<Object>} Summary of deletion operation
 */
export async function deleteEarningsEvents(guild, symbols) {
  const results = {
    deleted: [],
    notFound: []
  };

  for (const symbol of symbols) {
    const deleted = await deleteEarningsEvent(guild, symbol);
    if (deleted) {
      results.deleted.push(symbol);
    } else {
      results.notFound.push(symbol);
    }
  }

  return results;
}

/**
 * Get detailed earnings estimate for a symbol
 * @param {string} symbol - Stock ticker symbol
 * @returns {Promise<Object|null>} Earnings estimate data or null
 */
export async function getEarningsEstimate(symbol) {
  try {
    const result = await yf.quoteSummary(symbol, {
      modules: ["calendarEvents", "earnings"]
    });

    const earnings = result.calendarEvents?.earnings;

    if (!earnings) {
      return null;
    }

    const earningsDate = Array.isArray(earnings.earningsDate)
      ? earnings.earningsDate[0]
      : earnings.earningsDate;

    return {
      symbol: symbol,
      earningsDate: earningsDate,
      isEstimate: earnings.isEarningsDateEstimate || false,
      epsAverage: earnings.earningsAverage || null,
      epsLow: earnings.earningsLow || null,
      epsHigh: earnings.earningsHigh || null,
      revenueAverage: earnings.revenueAverage || null,
      revenueLow: earnings.revenueLow || null,
      revenueHigh: earnings.revenueHigh || null,
      currentQuarterEstimate: result.earnings?.earningsChart?.currentQuarterEstimate || null
    };
  } catch (error) {
    console.error(`Error fetching earnings estimate for ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Get earnings history for a symbol
 * @param {string} symbol - Stock ticker symbol
 * @returns {Promise<Object|null>} Earnings history data or null
 */
export async function getEarningsHistory(symbol) {
  try {
    const result = await yf.quoteSummary(symbol, {
      modules: ["earningsHistory", "earnings"]
    });

    if (!result.earningsHistory?.history && !result.earnings?.earningsChart?.quarterly) {
      return null;
    }

    return {
      symbol: symbol,
      history: result.earningsHistory?.history || [],
      quarterly: result.earnings?.earningsChart?.quarterly || []
    };
  } catch (error) {
    console.error(`Error fetching earnings history for ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Sync earnings events for all symbols in watchlist
 * Creates events for symbols that don't already have one
 * @param {Object} guild - Discord guild object
 * @param {string[]} symbols - Array of stock ticker symbols from watchlist
 * @returns {Promise<Object>} Summary of sync operation
 */
export async function syncEarningsEvents(guild, symbols) {
  console.log(`📅 Syncing earnings events for ${symbols.length} stocks...`);

  const results = {
    created: [],
    skipped: [],
    alreadyExists: [],
    failed: []
  };

  for (const symbol of symbols) {
    try {
      // Check if event already exists
      const exists = await hasEarningsEvent(guild, symbol);

      if (exists) {
        console.log(`⏭️  Event already exists for ${symbol}`);
        results.alreadyExists.push(symbol);
        continue;
      }

      // Fetch earnings date from Yahoo Finance
      const earningsData = await getEarningsDate(symbol);

      if (!earningsData) {
        results.failed.push(symbol);
        continue;
      }

      // Create Discord event
      const event = await createEarningsEvent(
        guild,
        symbol,
        earningsData.earningsDate,
        earningsData
      );

      if (event) {
        results.created.push({ symbol: symbol, date: earningsData.earningsDate });
      } else {
        results.skipped.push(symbol);
      }

      // Add small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`Error processing ${symbol}:`, error.message);
      results.failed.push(symbol);
    }
  }

  console.log(`✅ Sync complete: ${results.created.length} created, ${results.alreadyExists.length} already exist, ${results.skipped.length} skipped, ${results.failed.length} failed`);

  return results;
}

/**
 * Handle /earn command and its subcommands
 * @param {Object} message - Discord message object
 * @param {string} text - Command text
 * @param {Function} keepTyping - Function to keep typing indicator active
 */
export async function handleEarnCommand(message, text, keepTyping) {
  const parts = text.split(/\s+/);
  const subcommand = parts[1]?.toLowerCase();
  const symbol = parts[2]?.toUpperCase();

  // /earn estimate SYMBOL
  if (subcommand === 'estimate') {
    if (!symbol || !/^[A-Z]{1,5}$/.test(symbol)) {
      message.reply("❌ Please provide a valid ticker symbol. Example: `/earn estimate AAPL`");
      return;
    }

    try {
      message.channel.sendTyping();
      const stopTyping = keepTyping(message.channel);
      const estimate = await getEarningsEstimate(symbol);

      if (!estimate) {
        stopTyping();
        message.reply(`❌ No earnings data found for **${symbol}**.`);
        return;
      }

      const dateStr = estimate.earningsDate
        ? new Date(estimate.earningsDate).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'America/Los_Angeles'
          })
        : 'Not available';

      const dateType = estimate.isEstimate ? '📅 (Estimated)' : '📅 (Confirmed)';

      let replyMessage = `**${symbol} Earnings Estimate**\n\n`;
      replyMessage += `${dateType} **${dateStr}**\n\n`;

      if (estimate.epsAverage) {
        replyMessage += `📊 **EPS Estimate:**\n`;
        replyMessage += `   Average: $${estimate.epsAverage.toFixed(2)}\n`;
        if (estimate.epsLow && estimate.epsHigh) {
          replyMessage += `   Range: $${estimate.epsLow.toFixed(2)} - $${estimate.epsHigh.toFixed(2)}\n`;
        }
        replyMessage += `\n`;
      }

      if (estimate.revenueAverage) {
        const revAvg = (estimate.revenueAverage / 1e9).toFixed(2);
        replyMessage += `💰 **Revenue Estimate:**\n`;
        replyMessage += `   Average: $${revAvg}B\n`;
        if (estimate.revenueLow && estimate.revenueHigh) {
          const revLow = (estimate.revenueLow / 1e9).toFixed(2);
          const revHigh = (estimate.revenueHigh / 1e9).toFixed(2);
          replyMessage += `   Range: $${revLow}B - $${revHigh}B\n`;
        }
      }

      stopTyping();
      message.reply(replyMessage);
    } catch (err) {
      console.error("Error fetching earnings estimate:", err);
      message.reply("❌ An error occurred while fetching earnings data.");
    }
    return;
  }

  // /earn history SYMBOL
  if (subcommand === 'history') {
    if (!symbol || !/^[A-Z]{1,5}$/.test(symbol)) {
      message.reply("❌ Please provide a valid ticker symbol. Example: `/earn history AAPL`");
      return;
    }

    try {
      message.channel.sendTyping();
      const stopTyping = keepTyping(message.channel);
      const history = await getEarningsHistory(symbol);

      if (!history || (history.quarterly.length === 0 && history.history.length === 0)) {
        stopTyping();
        message.reply(`❌ No earnings history found for **${symbol}**.`);
        return;
      }

      let responseMessage = `**${symbol} Earnings History**\n\n`;

      // Show last 4 quarters
      if (history.quarterly && history.quarterly.length > 0) {
        responseMessage += `📈 **Recent Quarters:**\n`;
        history.quarterly.slice(-4).reverse().forEach(q => {
          const actual = q.actual || 'N/A';
          const estimate = q.estimate || 'N/A';
          let surprise = '';

          if (q.actual && q.estimate) {
            const diff = ((q.actual - q.estimate) / q.estimate * 100).toFixed(1);
            surprise = diff >= 0 ? `(+${diff}% 📈)` : `(${diff}% 📉)`;
          }

          responseMessage += `\n**${q.date}**\n`;
          responseMessage += `   Actual: $${actual}   Estimate: $${estimate}   ${surprise}\n`;
        });
      }

      // Alternative: Show from earningsHistory if available
      if (history.history && history.history.length > 0 && history.quarterly.length === 0) {
        responseMessage += `📈 **Recent Earnings:**\n`;
        history.history.slice(0, 4).forEach(h => {
          const surprise = h.surprisePercent ? `(${(h.surprisePercent * 100).toFixed(1)}%)` : '';
          responseMessage += `\n**${h.quarter}**\n`;
          responseMessage += `   EPS: $${h.epsActual || 'N/A'}   Est: $${h.epsEstimate || 'N/A'}   ${surprise}\n`;
        });
      }

      stopTyping();
      message.reply(responseMessage);
    } catch (err) {
      console.error("Error fetching earnings history:", err);
      message.reply("❌ An error occurred while fetching earnings history.");
    }
    return;
  }

  // Show earnings help
  const earningsHelp =
    "**📊 Earnings Commands:**\n" +
    "• `/earn estimate SYMBOL` - View upcoming earnings estimates\n" +
    "• `/earn history SYMBOL` - View past earnings history\n\n" +
    "**Examples:**\n" +
    "• `/earn estimate AAPL`\n" +
    "• `/earn history NVDA`";

  message.reply(earningsHelp);
}
