# Discord Stock Bot

A Discord bot that provides real-time stock market data and AI-powered financial conversations using Yahoo Finance and Ollama.

## Features

- **Real-time Stock Lookups**: Get instant stock prices, highs, lows, and market data
- **Personal Watchlist**: Track your favorite stocks with persistent storage using SQLite
- **AI-Powered Conversations**: Chat naturally about stocks and finances using Ollama Mistral
- **Contextual Responses**: Bot remembers your conversation for more relevant follow-ups
- **Natural Language Queries**: Ask questions like "What are the highs and lows of /META?"
- **Yahoo Finance Integration**: Pulls live market data including day ranges and 52-week ranges

## Commands

### Stock Lookup
```
/SYMBOL
```
Get comprehensive stock information including:
- Current price
- Daily change percentage
- Day high and low
- 52-week high and low

**Examples:**
- `/AAPL` - Apple Inc.
- `/TSLA` - Tesla
- `/META` - Meta Platforms
- `/AMD` - Advanced Micro Devices

### Watchlist Commands
Keep track of your favorite stocks with a personal watchlist:

**`/watch list`**
Display your watchlist with current prices and daily changes.

**`/watch add <TICKER>`**
Add a stock to your watchlist.
- Example: `/watch add AAPL`

**`/watch remove <TICKER>`**
Remove a stock from your watchlist.
- Example: `/watch remove AAPL`

**`/watch clear`**
Clear all stocks from your watchlist.

### Natural Language Queries
Simply mention a ticker symbol in your message to get AI-powered responses with real Yahoo Finance data:

**Examples:**
- "What are the highs and lows of /META?"
- "How is AAPL doing today?"
- "What's the 52-week range for TSLA?"

### General Chat
Talk naturally with the bot about stocks, markets, or anything else!

## Prerequisites

- Node.js (v16 or higher)
- [Ollama](https://ollama.ai/) installed and running locally
- Mistral model downloaded in Ollama (`ollama pull mistral`)
- Discord Bot Token

## Installation

1. Clone the repository:
```bash
cd discord-stock-bot
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```env
DISCORD_TOKEN=your_discord_bot_token_here
CHAT_CHANNEL_ID=your_channel_id_here
```

4. Make sure Ollama is running with Mistral model:
```bash
ollama pull mistral
ollama serve
```

## Getting Your Discord Bot Token

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to the "Bot" section
4. Click "Reset Token" and copy your bot token
5. Enable these Privileged Gateway Intents:
   - Message Content Intent
6. Go to OAuth2 → URL Generator
7. Select scopes: `bot`
8. Select bot permissions: `Send Messages`, `Read Message History`, `Read Messages/View Channels`
9. Use the generated URL to invite the bot to your server

## Getting Your Channel ID

1. Enable Developer Mode in Discord (User Settings → Advanced → Developer Mode)
2. Right-click on the channel you want the bot to monitor
3. Click "Copy Channel ID"
4. Paste it into your `.env` file

## Running the Bot

```bash
node app.js
```

The bot will:
- Connect to Discord
- Send a greeting message to the configured channel
- Start responding to commands and conversations
- Auto-shutdown after 10 minutes of inactivity

## Configuration

You can customize bot behavior by editing `app.js`:
- **Idle Timeout**: Bot shuts down after 10 minutes with no activity (default: `IDLE_TIMEOUT`)
- **AI Model**: Uses Mistral via Ollama (can be changed to other Ollama models)

## Tech Stack

- **[Discord.js](https://discord.js.org/)** - Discord bot framework
- **[Yahoo Finance 2](https://www.npmjs.com/package/yahoo-finance2)** - Real-time stock market data
- **[Ollama](https://ollama.ai/)** - Local AI model runtime
- **[Mistral](https://mistral.ai/)** - AI language model for conversations
- **[better-sqlite3](https://www.npmjs.com/package/better-sqlite3)** - SQLite database for watchlist storage
- **[dotenv](https://www.npmjs.com/package/dotenv)** - Environment variable management

## How It Works

1. **Stock Commands (`/SYMBOL`)**:
   - Fetches data from Yahoo Finance API
   - Displays formatted stock information with prices, highs, and lows

2. **Watchlist System**:
   - Stores user watchlists in SQLite database (`watchlist.db`)
   - Each user has their own independent watchlist
   - Fetches real-time data when displaying the watchlist
   - Validates ticker symbols before adding to watchlist

3. **Natural Language Queries**:
   - Detects ticker symbols in messages
   - Fetches Yahoo Finance data for mentioned stocks
   - Passes data as context to Ollama AI
   - AI generates conversational response using real data

## Troubleshooting

**Bot not responding:**
- Check if Ollama is running (`ollama serve`)
- Verify Mistral model is installed (`ollama list`)
- Check Discord bot token and channel ID in `.env`

**Stock lookup errors:**
- Verify ticker symbol is valid (1-5 uppercase letters)
- Check internet connection for Yahoo Finance API access

**AI offline message:**
- Start Ollama service: `ollama serve`
- Ensure Mistral model is downloaded: `ollama pull mistral`

## License

ISC

## Contributing

Feel free to submit issues and enhancement requests!

---

# Conversation Memory Feature

## Overview
The bot now remembers previous messages in the conversation and can connect context between messages!

## How It Works

### Per-User Memory
- Each user has their own conversation history
- The bot remembers the last 10 messages (5 exchanges) per user
- Conversations are kept for 15 minutes of inactivity, then cleaned up automatically

### What Gets Remembered
1. **Stock Lookups**: When you ask for a stock ticker, the bot remembers what it showed you
2. **AI Conversations**: All questions and answers with the AI are stored
3. **Context**: The bot can refer back to previous messages

## Example Conversations

### Example 1: Stock Context
```
User: AMD
Bot: [Shows AMD stock price: $250.05, -3.70%]

User: Does it look like a good stock to buy now?
Bot: [Remembers you asked about AMD and discusses AMD's current performance]
```

### Example 2: Follow-up Questions
```
User: What are the best tech stocks?
Bot: Some popular tech stocks include Apple (AAPL), Microsoft (MSFT), and NVIDIA (NVDA)...

User: Which one of those has the best growth potential?
Bot: [Remembers the list of stocks mentioned and provides analysis]
```

### Example 3: Multi-turn Analysis
```
User: I'm interested in renewable energy stocks
Bot: [Provides information about renewable energy sector]

User: Can you give me some examples?
Bot: [Remembers the topic and suggests specific tickers]

User: What about the first one?
Bot: [Remembers the examples given and discusses the first one]
```

## Technical Details

- **Storage**: In-memory Map structure (per-user)
- **Max History**: 10 messages per user (configurable in code)
- **Timeout**: 15 minutes of inactivity (configurable in code)
- **Cleanup**: Automatic cleanup every 5 minutes
- **Restart Behavior**: History is cleared when bot restarts (in-memory only)

## Configuration

You can adjust these values in `app.js`:

```javascript
const MAX_HISTORY_LENGTH = 10;        // Number of messages to keep
const CONVERSATION_TIMEOUT = 15 * 60 * 1000;  // 15 minutes
```

## Benefits

1. ✅ More natural conversations
2. ✅ Can reference previous topics
3. ✅ Better context understanding
4. ✅ Remembers stock lookups
5. ✅ No need to repeat information
6. ✅ Memory efficient (auto-cleanup)
