#!/usr/bin/env node
/**
 * watsonx Embedding Index
 * Builds and queries a persistent embedding index for RAG
 */

import { WatsonXAI } from "@ibm-cloud/watsonx-ai";
import { IamAuthenticator } from "ibm-cloud-sdk-core";
import fs from "fs/promises";
import path from "path";

// Configuration
const WATSONX_API_KEY = process.env.WATSONX_API_KEY;
const WATSONX_URL = process.env.WATSONX_URL || "https://us-south.ml.cloud.ibm.com";
const WATSONX_SPACE_ID = process.env.WATSONX_SPACE_ID;

// Paths
const EXTERNAL_DRIVE = "/Volumes/Virtual Server/_NEW";
const DOCUMENTS_PATH = `${EXTERNAL_DRIVE}/Documents`;
const INDEX_PATH = "/Users/matthewkarsten/watsonx-mcp-server/embeddings-index.json";

let client = null;

function getClient() {
  if (!client && WATSONX_API_KEY) {
    client = WatsonXAI.newInstance({
      version: "2024-05-31",
      serviceUrl: WATSONX_URL,
      authenticator: new IamAuthenticator({
        apikey: WATSONX_API_KEY,
      }),
    });
  }
  return client;
}

/**
 * Generate embeddings for texts (batch)
 */
async function generateEmbeddings(texts) {
  const watsonx = getClient();
  const response = await watsonx.embedText({
    modelId: "ibm/slate-125m-english-rtrvr-v2",
    spaceId: WATSONX_SPACE_ID,
    inputs: texts,
  });
  return response.result.results?.map((r) => r.embedding) || [];
}

/**
 * Calculate cosine similarity
 */
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Load or create index
 */
async function loadIndex() {
  try {
    const data = await fs.readFile(INDEX_PATH, "utf-8");
    return JSON.parse(data);
  } catch {
    return { documents: [], embeddings: [], metadata: { created: new Date().toISOString(), count: 0 } };
  }
}

/**
 * Save index
 */
async function saveIndex(index) {
  index.metadata.updated = new Date().toISOString();
  index.metadata.count = index.documents.length;
  await fs.writeFile(INDEX_PATH, JSON.stringify(index, null, 2));
}

/**
 * Build index from documents
 */
async function buildIndex(maxDocs = 100) {
  console.log("📚 Building embedding index...");
  console.log(`   Source: ${DOCUMENTS_PATH}`);
  console.log(`   Max documents: ${maxDocs}`);

  const files = await fs.readdir(DOCUMENTS_PATH);
  const txtFiles = files.filter(f => f.endsWith(".txt")).slice(0, maxDocs);

  console.log(`   Found ${txtFiles.length} text files`);

  const index = { documents: [], embeddings: [], metadata: { created: new Date().toISOString() } };

  // Process in batches of 10
  const batchSize = 10;
  for (let i = 0; i < txtFiles.length; i += batchSize) {
    const batch = txtFiles.slice(i, i + batchSize);
    const texts = [];
    const docs = [];

    for (const file of batch) {
      try {
        const content = await fs.readFile(`${DOCUMENTS_PATH}/${file}`, "utf-8");
        const truncated = content.substring(0, 500); // First 500 chars for embedding
        texts.push(truncated);
        docs.push({
          filename: file,
          preview: truncated.substring(0, 200).replace(/\n/g, " "),
          length: content.length,
        });
      } catch {
        // Skip unreadable files
      }
    }

    if (texts.length > 0) {
      console.log(`   Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(txtFiles.length/batchSize)}...`);
      const embeddings = await generateEmbeddings(texts);

      for (let j = 0; j < docs.length; j++) {
        index.documents.push(docs[j]);
        index.embeddings.push(embeddings[j]);
      }
    }
  }

  await saveIndex(index);
  console.log(`\n✅ Index built with ${index.documents.length} documents`);
  console.log(`   Saved to: ${INDEX_PATH}`);

  return index;
}

/**
 * Query the index
 */
async function queryIndex(query, topK = 5) {
  console.log(`🔍 Searching: "${query}"`);

  const index = await loadIndex();
  if (index.documents.length === 0) {
    console.log("   Index is empty. Run 'build' first.");
    return [];
  }

  console.log(`   Searching ${index.documents.length} documents...`);

  const [queryEmbedding] = await generateEmbeddings([query]);

  const results = index.embeddings.map((emb, i) => ({
    ...index.documents[i],
    similarity: cosineSimilarity(queryEmbedding, emb),
  }));

  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, topK);
}

/**
 * RAG: Retrieve and Generate
 */
async function ragQuery(question, topK = 3) {
  console.log(`💡 RAG Query: "${question}"`);

  // Retrieve relevant documents
  const results = await queryIndex(question, topK);

  if (results.length === 0) {
    console.log("   No documents found. Build index first.");
    return;
  }

  // Load full content of top documents
  const contexts = [];
  for (const result of results) {
    try {
      const content = await fs.readFile(`${DOCUMENTS_PATH}/${result.filename}`, "utf-8");
      contexts.push({
        filename: result.filename,
        content: content.substring(0, 1500),
        similarity: result.similarity,
      });
    } catch {
      // Skip
    }
  }

  console.log(`\n   Retrieved ${contexts.length} relevant documents:`);
  contexts.forEach((c, i) => {
    console.log(`   ${i + 1}. ${c.filename} (similarity: ${c.similarity.toFixed(4)})`);
  });

  // Generate answer using watsonx
  const watsonx = getClient();
  const contextText = contexts.map(c => `[${c.filename}]\n${c.content}`).join("\n\n---\n\n");

  console.log("\n   Generating answer with Granite 3.3...\n");

  const response = await watsonx.generateText({
    modelId: "ibm/granite-3-3-8b-instruct",
    spaceId: WATSONX_SPACE_ID,
    input: `You are a helpful assistant. Answer the question based on the provided context documents. If the answer is not in the context, say so.

Context Documents:
${contextText}

Question: ${question}

Answer:`,
    parameters: {
      max_new_tokens: 400,
      temperature: 0.3,
    },
  });

  const answer = response.result.results?.[0]?.generated_text?.trim() || "No answer generated";

  console.log("   " + "─".repeat(60));
  console.log("   Answer:");
  console.log("   " + answer.split("\n").join("\n   "));
  console.log("   " + "─".repeat(60));
  console.log("\n   Sources:");
  contexts.forEach(c => console.log(`   - ${c.filename}`));
}

/**
 * Show index stats
 */
async function showStats() {
  const index = await loadIndex();
  console.log("📊 Index Statistics");
  console.log("   " + "─".repeat(40));
  console.log(`   Documents indexed: ${index.documents.length}`);
  console.log(`   Created: ${index.metadata.created || "N/A"}`);
  console.log(`   Updated: ${index.metadata.updated || "N/A"}`);
  console.log(`   Index file: ${INDEX_PATH}`);

  if (index.documents.length > 0) {
    console.log("\n   Sample documents:");
    index.documents.slice(0, 5).forEach(d => {
      console.log(`   - ${d.filename} (${d.length} chars)`);
    });
  }
}

// Main
async function main() {
  const command = process.argv[2];
  const arg = process.argv[3];

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║           watsonx Embedding Index & RAG                      ║");
  console.log("║           Powered by IBM Granite 3.3 + Slate                 ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");

  if (!WATSONX_API_KEY || !WATSONX_SPACE_ID) {
    console.error("Error: WATSONX_API_KEY and WATSONX_SPACE_ID must be set");
    process.exit(1);
  }

  switch (command) {
    case "build": {
      const maxDocs = parseInt(arg) || 100;
      await buildIndex(maxDocs);
      break;
    }

    case "search": {
      if (!arg) {
        console.log("Usage: embedding-index.js search '<query>'");
        process.exit(1);
      }
      const results = await queryIndex(arg, 10);
      console.log("\n   Top results:");
      results.forEach((r, i) => {
        console.log(`   ${i + 1}. ${r.filename} (${r.similarity.toFixed(4)})`);
        console.log(`      ${r.preview.substring(0, 80)}...`);
      });
      break;
    }

    case "rag": {
      if (!arg) {
        console.log("Usage: embedding-index.js rag '<question>'");
        process.exit(1);
      }
      await ragQuery(arg);
      break;
    }

    case "stats": {
      await showStats();
      break;
    }

    default:
      console.log("Usage: embedding-index.js <command> [args]");
      console.log("");
      console.log("Commands:");
      console.log("  build [count]     - Build embedding index (default: 100 docs)");
      console.log("  search <query>    - Search the index");
      console.log("  rag <question>    - RAG: Retrieve docs and generate answer");
      console.log("  stats             - Show index statistics");
      console.log("");
      console.log("Examples:");
      console.log("  embedding-index.js build 200");
      console.log("  embedding-index.js search 'IBM Cloud'");
      console.log("  embedding-index.js rag 'How do I set up AWS for Satellite?'");
  }
}

main().catch(console.error);
