# watsonx MCP Server

MCP server for IBM watsonx.ai integration with Claude Code. Enables Claude to delegate tasks to IBM's foundation models (Granite, Llama, Mistral, etc.).

## Features

- **Text Generation** - Generate text using watsonx.ai foundation models
- **Chat** - Have conversations with watsonx.ai chat models
- **Embeddings** - Generate text embeddings
- **Model Listing** - List all available foundation models

## Available Tools

| Tool | Description |
|------|-------------|
| `watsonx_generate` | Generate text using watsonx.ai models |
| `watsonx_chat` | Chat with watsonx.ai models |
| `watsonx_embeddings` | Generate text embeddings |
| `watsonx_list_models` | List available models |

## Setup

### 1. Install Dependencies

```bash
cd ~/watsonx-mcp-server
npm install
```

### 2. Configure Environment

Set these environment variables:

```bash
WATSONX_API_KEY=your-ibm-cloud-api-key
WATSONX_URL=https://us-south.ml.cloud.ibm.com
WATSONX_SPACE_ID=your-deployment-space-id  # Recommended: deployment space
WATSONX_PROJECT_ID=your-project-id          # Alternative: project ID
```

**Note**: Either `WATSONX_SPACE_ID` or `WATSONX_PROJECT_ID` is required for text generation, embeddings, and chat. Deployment spaces are recommended as they have Watson Machine Learning (WML) pre-configured.

### 3. Add to Claude Code

The MCP server is already configured in `~/.claude.json`:

```json
{
  "mcpServers": {
    "watsonx": {
      "type": "stdio",
      "command": "node",
      "args": ["/Users/matthewkarsten/watsonx-mcp-server/index.js"],
      "env": {
        "WATSONX_API_KEY": "your-api-key",
        "WATSONX_URL": "https://us-south.ml.cloud.ibm.com",
        "WATSONX_SPACE_ID": "your-deployment-space-id"
      }
    }
  }
}
```

## Usage

Once configured, Claude can use watsonx.ai tools:

```
User: Use watsonx to generate a haiku about coding

Claude: [Uses watsonx_generate tool]
Result: Code flows like water
       Bugs arise, then disappear
       Programs come alive
```

## Available Models

Some notable models available:

- `ibm/granite-3-3-8b-instruct` - IBM Granite 3.3 8B (recommended)
- `ibm/granite-13b-chat-v2` - IBM Granite chat model
- `ibm/granite-3-8b-instruct` - Granite 3 instruct model
- `meta-llama/llama-3-70b-instruct` - Meta's Llama 3 70B
- `mistralai/mistral-large` - Mistral AI large model
- `ibm/slate-125m-english-rtrvr` - Embedding model

Use `watsonx_list_models` to see all available models.

## Architecture

```
Claude Code (Opus 4.5)
         │
         └──▶ watsonx MCP Server
                    │
                    └──▶ IBM watsonx.ai API
                              │
                              ├── Granite Models
                              ├── Llama Models
                              ├── Mistral Models
                              └── Embedding Models
```

## Two-Agent System

This enables a two-agent architecture where:

1. **Claude (Opus 4.5)** - Primary reasoning agent, handles complex tasks
2. **watsonx.ai** - Secondary agent for specific workloads

Claude can delegate tasks to watsonx.ai when:
- IBM-specific model capabilities are needed
- Running batch inference on enterprise data
- Using specialized Granite models
- Generating embeddings for RAG pipelines

## IBM Cloud Resources

This MCP server uses:
- **Service**: watsonx.ai Studio (data-science-experience)
- **Plan**: Lite (free tier)
- **Region**: us-south
- **Instance**: watsonx-ai-claude
- **Deployment Space**: claude-mcp-space (ID: 0f06720f-298e-47d6-8b5a-9baab8eda8f5)
- **WML Instance**: watson-ml (guid: b0c2aa31-3746-4ffa-a43e-813254c610a8)

## Files

- `index.js` - MCP server implementation
- `package.json` - Dependencies
- `README.md` - This file

## Author

Matthew Karsten

## License

MIT
