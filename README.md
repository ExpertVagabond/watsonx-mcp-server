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
- `ibm/slate-125m-english-rtrvr-v2` - Embedding model

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
- **Project**: claude-mcp-integration (ID: d10531c9-281c-45d9-9559-7bd2b30b4ad0)
- **Deployment Space**: claude-mcp-space (ID: 0f06720f-298e-47d6-8b5a-9baab8eda8f5)
- **WML Instance**: watson-ml (guid: b0c2aa31-3746-4ffa-a43e-813254c610a8)

## Integration with IBM Z MCP Server

This watsonx MCP server works alongside the IBM Z MCP server:

```
Claude Code (Opus 4.5)
         │
         ├──▶ watsonx MCP Server
         │         └── Text generation, embeddings, chat
         │
         └──▶ ibmz MCP Server
                   └── Key Protect HSM, z/OS Connect
```

Demo scripts in the ibmz-mcp-server:
- `demo-full-stack.js` - Full 5-service pipeline
- `demo-rag.js` - RAG with watsonx embeddings + Granite

## Document Analyzer

The document analyzer (`document-analyzer.js`) provides powerful tools for analyzing your external drive data using watsonx.ai:

### Commands

```bash
# View document catalog (9,168 documents)
node document-analyzer.js catalog

# Summarize a document
node document-analyzer.js summarize 1002519.txt

# Analyze document type, topics, entities
node document-analyzer.js analyze 1002519.txt

# Ask questions about a document
node document-analyzer.js question 1002519.txt 'What AWS credentials are needed?'

# Generate embeddings for documents
node document-analyzer.js embed

# Semantic search across documents
node document-analyzer.js search 'IBM Cloud infrastructure'
```

### Features

- **Summarization**: Generate concise summaries of any document
- **Analysis**: Extract document type, topics, entities, and sentiment
- **Q&A**: Ask natural language questions about document content
- **Embeddings**: Generate 768-dimensional vectors for semantic search
- **Semantic Search**: Find similar documents using vector similarity

### Demo

Run the full demo:
```bash
./demo-external-drive.sh
```

## Embedding Index & RAG

The `embedding-index.js` tool provides semantic search and RAG (Retrieval Augmented Generation):

```bash
# Build an embedding index (50 documents)
node embedding-index.js build 50

# Semantic search
node embedding-index.js search 'cloud infrastructure'

# RAG query - retrieves relevant docs and generates answer
node embedding-index.js rag 'How do I set up AWS for Satellite?'

# Show index statistics
node embedding-index.js stats
```

## Batch Processor

The `batch-processor.js` tool processes multiple documents at once:

```bash
# Classify documents into categories
node batch-processor.js classify 20

# Extract topics from documents
node batch-processor.js topics 15

# Generate one-line summaries
node batch-processor.js summarize 10

# Full analysis (classify + topics + summary)
node batch-processor.js full 10
```

Categories: technical, business, creative, personal, code, legal, marketing, educational, other

## Files

- `index.js` - MCP server implementation
- `document-analyzer.js` - Document analysis CLI tool
- `embedding-index.js` - Embedding index and RAG tool
- `batch-processor.js` - Batch document processor
- `demo-external-drive.sh` - Demo script
- `package.json` - Dependencies
- `README.md` - This file

## Author

Matthew Karsten

## License

MIT
