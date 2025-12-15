#!/usr/bin/env node
/**
 * watsonx Document Analyzer
 * Analyzes documents from external drive using IBM watsonx.ai
 */

import { WatsonXAI } from "@ibm-cloud/watsonx-ai";
import { IamAuthenticator } from "ibm-cloud-sdk-core";
import fs from "fs/promises";
import path from "path";

// Configuration
const WATSONX_API_KEY = process.env.WATSONX_API_KEY;
const WATSONX_URL = process.env.WATSONX_URL || "https://us-south.ml.cloud.ibm.com";
const WATSONX_SPACE_ID = process.env.WATSONX_SPACE_ID;

// External drive paths
const EXTERNAL_DRIVE = "/Volumes/Virtual Server/_NEW";
const DOCUMENTS_PATH = `${EXTERNAL_DRIVE}/Documents`;
const TRAINING_PATH = `${EXTERNAL_DRIVE}/Code/AI/Training`;

// Initialize watsonx client
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
 * Summarize a document using watsonx Granite model
 */
async function summarizeDocument(text, maxLength = 200) {
  const watsonx = getClient();
  if (!watsonx) throw new Error("watsonx client not initialized");

  // Truncate very long documents
  const truncatedText = text.length > 4000 ? text.substring(0, 4000) + "..." : text;

  const response = await watsonx.generateText({
    modelId: "ibm/granite-3-3-8b-instruct",
    spaceId: WATSONX_SPACE_ID,
    input: `Summarize the following document in ${maxLength} words or less. Focus on the key points and main ideas.

Document:
${truncatedText}

Summary:`,
    parameters: {
      max_new_tokens: 300,
      temperature: 0.3,
      stop_sequences: ["\n\n"],
    },
  });

  return response.result.results?.[0]?.generated_text?.trim() || "";
}

/**
 * Generate embeddings for a list of texts
 */
async function generateEmbeddings(texts) {
  const watsonx = getClient();
  if (!watsonx) throw new Error("watsonx client not initialized");

  const response = await watsonx.embedText({
    modelId: "ibm/slate-125m-english-rtrvr-v2",
    spaceId: WATSONX_SPACE_ID,
    inputs: texts,
  });

  return response.result.results?.map((r) => r.embedding) || [];
}

/**
 * Analyze document type and extract key information
 */
async function analyzeDocument(text) {
  const watsonx = getClient();
  if (!watsonx) throw new Error("watsonx client not initialized");

  const truncatedText = text.length > 3000 ? text.substring(0, 3000) + "..." : text;

  const response = await watsonx.generateText({
    modelId: "ibm/granite-3-3-8b-instruct",
    spaceId: WATSONX_SPACE_ID,
    input: `Analyze the following document and provide:
1. Document Type (e.g., technical documentation, article, notes, code, etc.)
2. Main Topics (comma-separated list of 3-5 topics)
3. Key Entities (people, organizations, technologies mentioned)
4. Sentiment (positive, negative, neutral)

Document:
${truncatedText}

Analysis:`,
    parameters: {
      max_new_tokens: 300,
      temperature: 0.2,
    },
  });

  return response.result.results?.[0]?.generated_text?.trim() || "";
}

/**
 * Answer questions about a document
 */
async function questionDocument(text, question) {
  const watsonx = getClient();
  if (!watsonx) throw new Error("watsonx client not initialized");

  const truncatedText = text.length > 3500 ? text.substring(0, 3500) + "..." : text;

  const response = await watsonx.generateText({
    modelId: "ibm/granite-3-3-8b-instruct",
    spaceId: WATSONX_SPACE_ID,
    input: `Based on the following document, answer the question.

Document:
${truncatedText}

Question: ${question}

Answer:`,
    parameters: {
      max_new_tokens: 300,
      temperature: 0.3,
    },
  });

  return response.result.results?.[0]?.generated_text?.trim() || "";
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Search documents by semantic similarity
 */
async function semanticSearch(query, documentEmbeddings, documents, topK = 5) {
  const [queryEmbedding] = await generateEmbeddings([query]);

  const similarities = documentEmbeddings.map((embedding, index) => ({
    index,
    similarity: cosineSimilarity(queryEmbedding, embedding),
    document: documents[index],
  }));

  similarities.sort((a, b) => b.similarity - a.similarity);
  return similarities.slice(0, topK);
}

/**
 * Load documents from the training catalog
 */
async function loadDocumentCatalog() {
  const catalogPath = `${TRAINING_PATH}/documents_catalog.json`;
  const data = await fs.readFile(catalogPath, "utf-8");
  return JSON.parse(data);
}

/**
 * Read a sample of documents
 */
async function readSampleDocuments(count = 10) {
  const files = await fs.readdir(DOCUMENTS_PATH);
  const txtFiles = files.filter((f) => f.endsWith(".txt")).slice(0, count);

  const documents = [];
  for (const file of txtFiles) {
    try {
      const content = await fs.readFile(`${DOCUMENTS_PATH}/${file}`, "utf-8");
      documents.push({
        filename: file,
        content: content.substring(0, 5000), // Limit size
      });
    } catch (err) {
      // Skip files that can't be read
    }
  }
  return documents;
}

// Main execution
async function main() {
  const command = process.argv[2];
  const arg = process.argv[3];

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║           watsonx Document Analyzer                          ║");
  console.log("║           Powered by IBM Granite 3.3                         ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");

  if (!WATSONX_API_KEY || !WATSONX_SPACE_ID) {
    console.error("Error: WATSONX_API_KEY and WATSONX_SPACE_ID must be set");
    process.exit(1);
  }

  switch (command) {
    case "catalog": {
      console.log("📚 Loading document catalog...");
      const catalog = await loadDocumentCatalog();
      console.log(`   Total documents: ${catalog.total}`);
      console.log(`   Sample documents:`);
      catalog.documents.slice(0, 10).forEach((doc) => {
        console.log(`   - ${doc.filename} (${doc.type}, ${doc.size_bytes} bytes)`);
      });
      break;
    }

    case "summarize": {
      const filename = arg || "1002519.txt";
      console.log(`📝 Summarizing: ${filename}`);
      try {
        const content = await fs.readFile(`${DOCUMENTS_PATH}/${filename}`, "utf-8");
        console.log(`   Document length: ${content.length} characters`);
        console.log("\n   Generating summary with watsonx...\n");
        const summary = await summarizeDocument(content);
        console.log("   Summary:");
        console.log("   " + "-".repeat(60));
        console.log("   " + summary.split("\n").join("\n   "));
        console.log("   " + "-".repeat(60));
      } catch (err) {
        console.error(`   Error: ${err.message}`);
      }
      break;
    }

    case "analyze": {
      const filename = arg || "1002519.txt";
      console.log(`🔍 Analyzing: ${filename}`);
      try {
        const content = await fs.readFile(`${DOCUMENTS_PATH}/${filename}`, "utf-8");
        console.log(`   Document length: ${content.length} characters`);
        console.log("\n   Analyzing with watsonx...\n");
        const analysis = await analyzeDocument(content);
        console.log("   Analysis:");
        console.log("   " + "-".repeat(60));
        console.log("   " + analysis.split("\n").join("\n   "));
        console.log("   " + "-".repeat(60));
      } catch (err) {
        console.error(`   Error: ${err.message}`);
      }
      break;
    }

    case "question": {
      const filename = arg;
      const question = process.argv[4];
      if (!filename || !question) {
        console.log("Usage: document-analyzer.js question <filename> '<question>'");
        process.exit(1);
      }
      console.log(`❓ Asking question about: ${filename}`);
      console.log(`   Question: ${question}`);
      try {
        const content = await fs.readFile(`${DOCUMENTS_PATH}/${filename}`, "utf-8");
        console.log("\n   Answering with watsonx...\n");
        const answer = await questionDocument(content, question);
        console.log("   Answer:");
        console.log("   " + "-".repeat(60));
        console.log("   " + answer.split("\n").join("\n   "));
        console.log("   " + "-".repeat(60));
      } catch (err) {
        console.error(`   Error: ${err.message}`);
      }
      break;
    }

    case "embed": {
      console.log("🔢 Generating embeddings for sample documents...");
      const docs = await readSampleDocuments(5);
      console.log(`   Loaded ${docs.length} documents`);

      const texts = docs.map((d) => d.content.substring(0, 500));
      console.log("   Generating embeddings with watsonx...");
      const embeddings = await generateEmbeddings(texts);

      console.log("\n   Embeddings generated:");
      docs.forEach((doc, i) => {
        console.log(`   - ${doc.filename}: ${embeddings[i]?.length || 0} dimensions`);
      });
      break;
    }

    case "search": {
      const query = arg;
      if (!query) {
        console.log("Usage: document-analyzer.js search '<query>'");
        process.exit(1);
      }
      console.log(`🔍 Semantic search: "${query}"`);
      console.log("   Loading sample documents...");
      const docs = await readSampleDocuments(20);
      console.log(`   Loaded ${docs.length} documents`);

      console.log("   Generating embeddings...");
      const texts = docs.map((d) => d.content.substring(0, 500));
      const embeddings = await generateEmbeddings(texts);

      console.log("   Searching...\n");
      const results = await semanticSearch(query, embeddings, docs, 5);

      console.log("   Top results:");
      results.forEach((r, i) => {
        console.log(`   ${i + 1}. ${r.document.filename} (similarity: ${r.similarity.toFixed(4)})`);
        console.log(`      ${r.document.content.substring(0, 100).replace(/\n/g, " ")}...`);
      });
      break;
    }

    default:
      console.log("Usage: document-analyzer.js <command> [args]");
      console.log("");
      console.log("Commands:");
      console.log("  catalog              - List documents from training catalog");
      console.log("  summarize [file]     - Summarize a document");
      console.log("  analyze [file]       - Analyze document type and topics");
      console.log("  question <file> <q>  - Ask a question about a document");
      console.log("  embed                - Generate embeddings for sample docs");
      console.log("  search <query>       - Semantic search across documents");
      console.log("");
      console.log("Examples:");
      console.log("  document-analyzer.js summarize 1002519.txt");
      console.log("  document-analyzer.js analyze 1002519.txt");
      console.log("  document-analyzer.js question 1002519.txt 'What is this about?'");
      console.log("  document-analyzer.js search 'IBM Cloud Satellite'");
  }
}

main().catch(console.error);
