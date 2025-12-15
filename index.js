#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { WatsonXAI } from "@ibm-cloud/watsonx-ai";
import { IamAuthenticator } from "ibm-cloud-sdk-core";
// import KeyProtectV2 from "@ibm-cloud/key-protect"; // Temporarily disabled - package not available

// Configuration from environment
const WATSONX_API_KEY = process.env.WATSONX_API_KEY;
const WATSONX_PROJECT_ID = process.env.WATSONX_PROJECT_ID;
const WATSONX_SPACE_ID = process.env.WATSONX_SPACE_ID; // Deployment space (preferred)
const WATSONX_URL = process.env.WATSONX_URL || "https://us-south.ml.cloud.ibm.com";

// IBM Z / Key Protect configuration
const KEY_PROTECT_API_KEY = process.env.KEY_PROTECT_API_KEY || process.env.WATSONX_API_KEY;
const KEY_PROTECT_INSTANCE_ID = process.env.KEY_PROTECT_INSTANCE_ID;
const KEY_PROTECT_URL = process.env.KEY_PROTECT_URL || "https://us-south.kms.cloud.ibm.com";

// z/OS Connect configuration (optional - requires mainframe access)
const ZOS_CONNECT_URL = process.env.ZOS_CONNECT_URL;
const ZOS_CONNECT_API_KEY = process.env.ZOS_CONNECT_API_KEY;

// Initialize watsonx.ai client
let watsonxClient = null;
let keyProtectClient = null;

function getWatsonxClient() {
  if (!watsonxClient && WATSONX_API_KEY) {
    watsonxClient = WatsonXAI.newInstance({
      version: "2024-05-31",
      serviceUrl: WATSONX_URL,
      authenticator: new IamAuthenticator({
        apikey: WATSONX_API_KEY,
      }),
    });
  }
  return watsonxClient;
}

// Initialize Key Protect client (IBM Z HSM-backed key management)
function getKeyProtectClient() {
  // Temporarily disabled - @ibm-cloud/key-protect package not available
  // if (!keyProtectClient && KEY_PROTECT_API_KEY && KEY_PROTECT_INSTANCE_ID) {
  //   keyProtectClient = KeyProtectV2.newInstance({
  //     authenticator: new IamAuthenticator({
  //       apikey: KEY_PROTECT_API_KEY,
  //     }),
  //     serviceUrl: KEY_PROTECT_URL,
  //   });
  //   keyProtectClient.setServiceUrl(KEY_PROTECT_URL);
  // }
  return null; // Disabled
}

// z/OS Connect API caller (for mainframe integration)
async function callZosConnect(endpoint, method = "GET", body = null) {
  if (!ZOS_CONNECT_URL) {
    throw new Error("z/OS Connect not configured. Set ZOS_CONNECT_URL environment variable.");
  }

  const url = `${ZOS_CONNECT_URL}${endpoint}`;
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
  };

  if (ZOS_CONNECT_API_KEY) {
    headers["Authorization"] = `Bearer ${ZOS_CONNECT_API_KEY}`;
  }

  const options = { method, headers };
  if (body && (method === "POST" || method === "PUT")) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`z/OS Connect error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// Create MCP server
const server = new Server(
  {
    name: "watsonx-ibmz-mcp-server",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "watsonx_generate",
        description: "Generate text using IBM watsonx.ai foundation models (Granite, Llama, Mistral, etc.)",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "The prompt to send to the model",
            },
            model_id: {
              type: "string",
              description: "Model ID (e.g., 'ibm/granite-13b-chat-v2', 'meta-llama/llama-3-70b-instruct')",
              default: "ibm/granite-13b-chat-v2",
            },
            max_new_tokens: {
              type: "number",
              description: "Maximum number of tokens to generate",
              default: 500,
            },
            temperature: {
              type: "number",
              description: "Temperature for sampling (0-2)",
              default: 0.7,
            },
            top_p: {
              type: "number",
              description: "Top-p nucleus sampling",
              default: 1.0,
            },
            top_k: {
              type: "number",
              description: "Top-k sampling",
              default: 50,
            },
          },
          required: ["prompt"],
        },
      },
      {
        name: "watsonx_list_models",
        description: "List available foundation models in watsonx.ai",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "watsonx_embeddings",
        description: "Generate text embeddings using watsonx.ai embedding models",
        inputSchema: {
          type: "object",
          properties: {
            texts: {
              type: "array",
              items: { type: "string" },
              description: "Array of texts to embed",
            },
            model_id: {
              type: "string",
              description: "Embedding model ID",
              default: "ibm/slate-125m-english-rtrvr",
            },
          },
          required: ["texts"],
        },
      },
      {
        name: "watsonx_chat",
        description: "Have a conversation with watsonx.ai chat models",
        inputSchema: {
          type: "object",
          properties: {
            messages: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  role: { type: "string", enum: ["system", "user", "assistant"] },
                  content: { type: "string" },
                },
              },
              description: "Array of chat messages",
            },
            model_id: {
              type: "string",
              description: "Chat model ID",
              default: "ibm/granite-13b-chat-v2",
            },
            max_new_tokens: {
              type: "number",
              default: 500,
            },
            temperature: {
              type: "number",
              default: 0.7,
            },
          },
          required: ["messages"],
        },
      },
      // IBM Z / Key Protect Tools
      {
        name: "key_protect_list_keys",
        description: "List encryption keys from IBM Key Protect (HSM-backed key management on IBM Z infrastructure)",
        inputSchema: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "Maximum number of keys to return",
              default: 100,
            },
            offset: {
              type: "number",
              description: "Offset for pagination",
              default: 0,
            },
          },
        },
      },
      {
        name: "key_protect_create_key",
        description: "Create a new encryption key in IBM Key Protect (stored in FIPS 140-2 Level 3 HSM)",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Name for the new key",
            },
            description: {
              type: "string",
              description: "Description of the key's purpose",
            },
            type: {
              type: "string",
              enum: ["root_key", "standard_key"],
              description: "Key type: root_key (for wrapping) or standard_key (for encryption)",
              default: "standard_key",
            },
            extractable: {
              type: "boolean",
              description: "Whether the key material can be extracted",
              default: false,
            },
          },
          required: ["name"],
        },
      },
      {
        name: "key_protect_get_key",
        description: "Get details of a specific key from IBM Key Protect",
        inputSchema: {
          type: "object",
          properties: {
            key_id: {
              type: "string",
              description: "The ID of the key to retrieve",
            },
          },
          required: ["key_id"],
        },
      },
      {
        name: "key_protect_wrap_key",
        description: "Wrap (encrypt) data using a root key in IBM Key Protect - for envelope encryption",
        inputSchema: {
          type: "object",
          properties: {
            key_id: {
              type: "string",
              description: "The ID of the root key to use for wrapping",
            },
            plaintext: {
              type: "string",
              description: "Base64-encoded data encryption key to wrap",
            },
            aad: {
              type: "array",
              items: { type: "string" },
              description: "Additional authentication data (AAD) for AEAD encryption",
            },
          },
          required: ["key_id", "plaintext"],
        },
      },
      {
        name: "key_protect_unwrap_key",
        description: "Unwrap (decrypt) data using a root key in IBM Key Protect",
        inputSchema: {
          type: "object",
          properties: {
            key_id: {
              type: "string",
              description: "The ID of the root key to use for unwrapping",
            },
            ciphertext: {
              type: "string",
              description: "Base64-encoded wrapped data encryption key",
            },
            aad: {
              type: "array",
              items: { type: "string" },
              description: "Additional authentication data (must match wrap AAD)",
            },
          },
          required: ["key_id", "ciphertext"],
        },
      },
      {
        name: "key_protect_delete_key",
        description: "Delete an encryption key from IBM Key Protect (irreversible)",
        inputSchema: {
          type: "object",
          properties: {
            key_id: {
              type: "string",
              description: "The ID of the key to delete",
            },
            force: {
              type: "boolean",
              description: "Force deletion even if key has associated resources",
              default: false,
            },
          },
          required: ["key_id"],
        },
      },
      // z/OS Connect Tools (requires mainframe access)
      {
        name: "zos_connect_list_services",
        description: "List available z/OS Connect services (RESTful APIs to mainframe programs). Requires ZOS_CONNECT_URL to be configured.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "zos_connect_call_service",
        description: "Call a z/OS Connect service to interact with mainframe programs (CICS, IMS, batch). Requires ZOS_CONNECT_URL to be configured.",
        inputSchema: {
          type: "object",
          properties: {
            service_name: {
              type: "string",
              description: "Name of the z/OS Connect service to call",
            },
            operation: {
              type: "string",
              description: "Operation/method to invoke (e.g., GET, POST)",
              default: "POST",
            },
            payload: {
              type: "object",
              description: "JSON payload to send to the mainframe service",
            },
          },
          required: ["service_name"],
        },
      },
      {
        name: "zos_connect_get_service_info",
        description: "Get detailed information about a z/OS Connect service including its OpenAPI specification",
        inputSchema: {
          type: "object",
          properties: {
            service_name: {
              type: "string",
              description: "Name of the z/OS Connect service",
            },
          },
          required: ["service_name"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const client = getWatsonxClient();

  if (!client) {
    return {
      content: [
        {
          type: "text",
          text: "Error: watsonx.ai not configured. Set WATSONX_API_KEY environment variable.",
        },
      ],
    };
  }

  try {
    switch (name) {
      case "watsonx_generate": {
        const params = {
          input: args.prompt,
          modelId: args.model_id || "ibm/granite-13b-chat-v2",
          parameters: {
            max_new_tokens: args.max_new_tokens || 500,
            temperature: args.temperature || 0.7,
            top_p: args.top_p || 1.0,
            top_k: args.top_k || 50,
          },
        };

        // Add spaceId (preferred) or projectId
        if (WATSONX_SPACE_ID) {
          params.spaceId = WATSONX_SPACE_ID;
        } else if (WATSONX_PROJECT_ID) {
          params.projectId = WATSONX_PROJECT_ID;
        }

        const response = await client.generateText(params);

        const generatedText = response.result.results?.[0]?.generated_text || "";
        return {
          content: [
            {
              type: "text",
              text: generatedText,
            },
          ],
        };
      }

      case "watsonx_list_models": {
        const response = await client.listFoundationModelSpecs({
          limit: 100,
        });

        const models = response.result.resources?.map((m) => ({
          id: m.model_id,
          name: m.label,
          provider: m.provider,
          tasks: m.tasks,
        })) || [];

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(models, null, 2),
            },
          ],
        };
      }

      case "watsonx_embeddings": {
        const params = {
          inputs: args.texts,
          modelId: args.model_id || "ibm/slate-125m-english-rtrvr",
        };

        // Add spaceId (preferred) or projectId
        if (WATSONX_SPACE_ID) {
          params.spaceId = WATSONX_SPACE_ID;
        } else if (WATSONX_PROJECT_ID) {
          params.projectId = WATSONX_PROJECT_ID;
        }

        const response = await client.embedText(params);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.result, null, 2),
            },
          ],
        };
      }

      case "watsonx_chat": {
        // Format messages for chat completion
        const formattedPrompt = args.messages
          .map((m) => {
            if (m.role === "system") return `System: ${m.content}`;
            if (m.role === "user") return `User: ${m.content}`;
            if (m.role === "assistant") return `Assistant: ${m.content}`;
            return m.content;
          })
          .join("\n\n");

        const params = {
          input: formattedPrompt + "\n\nAssistant:",
          modelId: args.model_id || "ibm/granite-13b-chat-v2",
          parameters: {
            max_new_tokens: args.max_new_tokens || 500,
            temperature: args.temperature || 0.7,
            stop_sequences: ["User:", "System:"],
          },
        };

        // Add spaceId (preferred) or projectId
        if (WATSONX_SPACE_ID) {
          params.spaceId = WATSONX_SPACE_ID;
        } else if (WATSONX_PROJECT_ID) {
          params.projectId = WATSONX_PROJECT_ID;
        }

        const response = await client.generateText(params);

        const generatedText = response.result.results?.[0]?.generated_text || "";
        return {
          content: [
            {
              type: "text",
              text: generatedText.trim(),
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${name}`,
            },
          ],
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error calling watsonx.ai: ${error.message}`,
        },
      ],
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("watsonx MCP server running on stdio");
}

main().catch(console.error);
