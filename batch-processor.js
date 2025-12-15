#!/usr/bin/env node
/**
 * watsonx Batch Document Processor
 * Process multiple documents from external drive with watsonx.ai
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
const OUTPUT_PATH = "/Users/matthewkarsten/watsonx-mcp-server/batch-results";

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
 * Classify a document
 */
async function classifyDocument(text) {
  const watsonx = getClient();
  const truncated = text.substring(0, 2000);

  const response = await watsonx.generateText({
    modelId: "ibm/granite-3-3-8b-instruct",
    spaceId: WATSONX_SPACE_ID,
    input: `Classify this document into exactly one category. Reply with ONLY the category name, nothing else.

Categories: technical, business, creative, personal, code, legal, marketing, educational, other

Document:
${truncated}

Category:`,
    parameters: {
      max_new_tokens: 10,
      temperature: 0.1,
      stop_sequences: ["\n", ".", ","],
    },
  });

  const raw = response.result.results?.[0]?.generated_text?.trim().toLowerCase() || "other";
  // Extract just the first word
  const category = raw.split(/\s+/)[0].replace(/[^a-z]/g, '');
  const validCategories = ['technical', 'business', 'creative', 'personal', 'code', 'legal', 'marketing', 'educational', 'other'];
  return validCategories.includes(category) ? category : 'other';
}

/**
 * Extract key topics from a document
 */
async function extractTopics(text) {
  const watsonx = getClient();
  const truncated = text.substring(0, 2000);

  const response = await watsonx.generateText({
    modelId: "ibm/granite-3-3-8b-instruct",
    spaceId: WATSONX_SPACE_ID,
    input: `Extract 3-5 key topics from this document. Return only a comma-separated list.

Document:
${truncated}

Topics:`,
    parameters: {
      max_new_tokens: 100,
      temperature: 0.2,
    },
  });

  const topicsText = response.result.results?.[0]?.generated_text?.trim() || "";
  return topicsText.split(",").map(t => t.trim()).filter(t => t.length > 0);
}

/**
 * Generate a one-line summary
 */
async function generateOneliner(text) {
  const watsonx = getClient();
  const truncated = text.substring(0, 2000);

  const response = await watsonx.generateText({
    modelId: "ibm/granite-3-3-8b-instruct",
    spaceId: WATSONX_SPACE_ID,
    input: `Summarize this document in exactly one sentence (max 20 words).

Document:
${truncated}

One-line summary:`,
    parameters: {
      max_new_tokens: 50,
      temperature: 0.3,
    },
  });

  return response.result.results?.[0]?.generated_text?.trim() || "";
}

/**
 * Process a batch of documents
 */
async function processBatch(files, options = {}) {
  const results = [];
  const startTime = Date.now();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    console.log(`   [${i + 1}/${files.length}] Processing: ${file.name}`);

    try {
      const content = await fs.readFile(file.path, "utf-8");

      const result = {
        filename: file.name,
        path: file.path,
        size: content.length,
        processed_at: new Date().toISOString(),
      };

      if (options.classify) {
        result.category = await classifyDocument(content);
      }

      if (options.topics) {
        result.topics = await extractTopics(content);
      }

      if (options.summarize) {
        result.summary = await generateOneliner(content);
      }

      results.push(result);
    } catch (err) {
      results.push({
        filename: file.name,
        error: err.message,
      });
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  return { results, elapsed, count: results.length };
}

/**
 * Generate batch report
 */
function generateReport(batchResults) {
  const { results, elapsed, count } = batchResults;

  // Category distribution
  const categories = {};
  results.forEach(r => {
    if (r.category) {
      categories[r.category] = (categories[r.category] || 0) + 1;
    }
  });

  // All topics
  const allTopics = {};
  results.forEach(r => {
    (r.topics || []).forEach(t => {
      allTopics[t] = (allTopics[t] || 0) + 1;
    });
  });

  const topTopics = Object.entries(allTopics)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return {
    summary: {
      total_documents: count,
      processing_time: `${elapsed}s`,
      avg_time_per_doc: `${(elapsed / count).toFixed(2)}s`,
    },
    category_distribution: categories,
    top_topics: topTopics.map(([topic, count]) => ({ topic, count })),
    documents: results,
  };
}

/**
 * Read documents from a directory
 */
async function getDocuments(dir, pattern = ".txt", limit = 20) {
  const files = await fs.readdir(dir);
  const matching = files.filter(f => f.endsWith(pattern)).slice(0, limit);
  return matching.map(name => ({
    name,
    path: `${dir}/${name}`,
  }));
}

// Main
async function main() {
  const command = process.argv[2];
  const arg = process.argv[3];

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║           watsonx Batch Document Processor                   ║");
  console.log("║           Powered by IBM Granite 3.3                         ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");

  if (!WATSONX_API_KEY || !WATSONX_SPACE_ID) {
    console.error("Error: WATSONX_API_KEY and WATSONX_SPACE_ID must be set");
    process.exit(1);
  }

  // Ensure output directory exists
  await fs.mkdir(OUTPUT_PATH, { recursive: true });

  switch (command) {
    case "classify": {
      const count = parseInt(arg) || 10;
      console.log(`📋 Classifying ${count} documents...\n`);

      const docs = await getDocuments(DOCUMENTS_PATH, ".txt", count);
      const batch = await processBatch(docs, { classify: true });
      const report = generateReport(batch);

      console.log("\n📊 Category Distribution:");
      Object.entries(report.category_distribution).forEach(([cat, cnt]) => {
        console.log(`   ${cat}: ${cnt}`);
      });

      const outFile = `${OUTPUT_PATH}/classify-${Date.now()}.json`;
      await fs.writeFile(outFile, JSON.stringify(report, null, 2));
      console.log(`\n✅ Results saved to: ${outFile}`);
      break;
    }

    case "topics": {
      const count = parseInt(arg) || 10;
      console.log(`🏷️  Extracting topics from ${count} documents...\n`);

      const docs = await getDocuments(DOCUMENTS_PATH, ".txt", count);
      const batch = await processBatch(docs, { topics: true });
      const report = generateReport(batch);

      console.log("\n📊 Top Topics:");
      report.top_topics.forEach(({ topic, count }, i) => {
        console.log(`   ${i + 1}. ${topic} (${count})`);
      });

      const outFile = `${OUTPUT_PATH}/topics-${Date.now()}.json`;
      await fs.writeFile(outFile, JSON.stringify(report, null, 2));
      console.log(`\n✅ Results saved to: ${outFile}`);
      break;
    }

    case "summarize": {
      const count = parseInt(arg) || 10;
      console.log(`📝 Summarizing ${count} documents...\n`);

      const docs = await getDocuments(DOCUMENTS_PATH, ".txt", count);
      const batch = await processBatch(docs, { summarize: true });

      console.log("\n📋 Summaries:");
      batch.results.forEach(r => {
        if (r.summary) {
          console.log(`   📄 ${r.filename}`);
          console.log(`      ${r.summary}\n`);
        }
      });

      const outFile = `${OUTPUT_PATH}/summaries-${Date.now()}.json`;
      await fs.writeFile(outFile, JSON.stringify(batch, null, 2));
      console.log(`✅ Results saved to: ${outFile}`);
      break;
    }

    case "full": {
      const count = parseInt(arg) || 10;
      console.log(`🔬 Full analysis of ${count} documents...\n`);

      const docs = await getDocuments(DOCUMENTS_PATH, ".txt", count);
      const batch = await processBatch(docs, { classify: true, topics: true, summarize: true });
      const report = generateReport(batch);

      console.log("\n" + "═".repeat(60));
      console.log("📊 BATCH ANALYSIS REPORT");
      console.log("═".repeat(60));

      console.log(`\n📈 Summary:`);
      console.log(`   Documents: ${report.summary.total_documents}`);
      console.log(`   Processing time: ${report.summary.processing_time}`);
      console.log(`   Avg per doc: ${report.summary.avg_time_per_doc}`);

      console.log(`\n📂 Categories:`);
      Object.entries(report.category_distribution).forEach(([cat, cnt]) => {
        const pct = ((cnt / report.summary.total_documents) * 100).toFixed(1);
        console.log(`   ${cat}: ${cnt} (${pct}%)`);
      });

      console.log(`\n🏷️  Top Topics:`);
      report.top_topics.slice(0, 5).forEach(({ topic, count }, i) => {
        console.log(`   ${i + 1}. ${topic} (${count})`);
      });

      const outFile = `${OUTPUT_PATH}/full-analysis-${Date.now()}.json`;
      await fs.writeFile(outFile, JSON.stringify(report, null, 2));
      console.log(`\n✅ Full report saved to: ${outFile}`);
      break;
    }

    default:
      console.log("Usage: batch-processor.js <command> [count]");
      console.log("");
      console.log("Commands:");
      console.log("  classify [n]   - Classify n documents into categories");
      console.log("  topics [n]     - Extract topics from n documents");
      console.log("  summarize [n]  - Generate one-line summaries for n docs");
      console.log("  full [n]       - Full analysis (classify + topics + summary)");
      console.log("");
      console.log("Examples:");
      console.log("  batch-processor.js classify 20");
      console.log("  batch-processor.js topics 15");
      console.log("  batch-processor.js full 10");
  }
}

main().catch(console.error);
