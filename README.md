# 🎬 `youtubegist`

`youtubegist` is a fast, open-source web app that transforms YouTube videos into concise, readable summaries. Skip the fluff and get straight to the key insights. I initially created this for myself because I spend a little too much there.

Try it at **[youtubegist.com](https://youtubegist.com)**.

## Features

- **⚡ Fast**: Get video summaries in seconds
- **🎯 Clutter-Free**: Clean, distraction-free interface
- **🔓 Open Source**: Fully transparent and community-driven
- **📱 Installable PWA**: Share video into the PWA on your phone from YouTube app
- **🚀 Easy Usage**: Just add `gist` after `youtube` in a URL

## Run locally

Follow this step-by-step tutorial to set up youtubegist on your local machine:

### 1. Clone the repository

```bash
git clone https://github.com/shajidhasan/youtubegist.git
cd youtubegist
```

### 2. Set up Appwrite (Database for Caching)

1. Go to [cloud.appwrite.io](https://cloud.appwrite.io) and create a free account
2. Create a new project and note down your **Project ID**
3. Under **Integrations**, find the **API keys** tab and create one with **Databases** permission.
4. Navigate to **Databases** → **Create Database**
   - Name it `main`
5. Inside the `main` database, **Create Collection**:
   - Name it `summaries`
   - Add these **required attributes**:
     - `title` (String, required)
     - `summary` (String, required) 
     - `keyPoints` (String, required)
     - `keyTakeaway` (String, required)
     - `coreTerms` (String, required)
     - `videoId` (String, required)
     - `meta` (JSON, required)
     - `hits` (Integer, required, default: 1)

### 3. Set up OpenRouter (AI Models)

1. Go to [openrouter.ai](https://openrouter.ai) and create an account
2. Navigate to **Keys** and create a new API key
3. Choose a model for `OPENROUTER_MODEL` (there are many free options)

### 4. Configure environment variables

```bash
# Copy the example environment file
cp .env.example .env

# Edit the environment file
nano .env
```

Fill in the **required variables**:
```env
APPWRITE_PROJECT="your-project-id-from-step-2"
APPWRITE_API_KEY="your-api-key-from-step-2" 
OPENROUTER_API_KEY="your-openrouter-api-key"
OPENROUTER_MODEL="meta-llama/llama-3.2-3b-instruct:free"
NONCE_SECRET="any-random-32-character-string"
OPENAI_API_KEY="your-openai-api-key"  # Required for embedding generation (clustering feature)
```

Optional variables (leave empty if not needed):
```env
PROXY_URI="" # A rotating proxy URI to bypass YouTube IP blocks (from webshare.io for example)
FREE_TRANSCRIPT_ENDPOINT="" # I am using a transcript endpoint that I'm keeping a secret
YOUTUBE_DATA_API_KEY="" # YouTube Data API Key for fetching data quickly
YTDLP_BIN="" # Optional: full path to yt-dlp (defaults to "yt-dlp" on PATH)
TRANSCRIPT_YTDLP_TIMEOUT_MS="" # Optional: max wait for yt-dlp (default 120000 ms)
```

### 5. Install dependencies and run

Install a recent **[yt-dlp](https://github.com/yt-dlp/yt-dlp)** and put it on your `PATH` (or set `YTDLP_BIN` to the executable). When `FREE_TRANSCRIPT_ENDPOINT` is empty or fails, the server uses `yt-dlp` to download **JSON3** subtitles for YouTube transcripts (no `--sub-langs`; yt-dlp’s defaults apply). **Auto-translated** subtitle tracks (YouTube’s machine translation from another language) are skipped via `--extractor-args youtube:skip=translated_subs`. Production Node deployments should include `yt-dlp` on the host or image.

```bash
# Install Node.js dependencies (you can use npm too)
pnpm install

# Install Python dependencies (for clustering feature)
pip install -r requirements.txt

# Start development server
pnpm dev

# Or with npm
npm install
npm run dev
```

The app will be available at `http://localhost:5173`

## Contributing

PRs are welcome.

## License

This project is open source and available under the [MIT License](LICENSE).

## Support This Project

If `youtubegist` has been helpful to you, consider supporting.

- ☕ **[Buy me a coffee](https://buymeacoffee.com/sh4jid)** - Help fuel late-night coding sessions
- 💝 **[Sponsor this project](https://buymeacoffee.com/sh4jid/membership)** - Support ongoing development and hosting costs
- ⭐ Or just star the repository :)

Your support helps keep `youtubegist` free and accessible for everyone!
