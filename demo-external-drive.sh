#!/bin/bash
# watsonx Document Analyzer Demo
# Demonstrates IBM watsonx.ai integration with external drive data

export WATSONX_API_KEY="Xj6rt9ygHP2gtlqvs2ycE7HiEytDtaqEJVlu9wIcM-Fl"
export WATSONX_URL="https://us-south.ml.cloud.ibm.com"
export WATSONX_SPACE_ID="0f06720f-298e-47d6-8b5a-9baab8eda8f5"

cd ~/watsonx-mcp-server

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     watsonx + External Drive Integration Demo                ║"
echo "║     Powered by IBM Granite 3.3                               ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

echo "1️⃣  Document Catalog (9,168 documents)"
echo "─────────────────────────────────────────"
node document-analyzer.js catalog
echo ""

echo "2️⃣  Summarize IBM Cloud Document"
echo "─────────────────────────────────────────"
node document-analyzer.js summarize 1002519.txt
echo ""

echo "3️⃣  Semantic Search: 'cloud infrastructure'"
echo "─────────────────────────────────────────"
node document-analyzer.js search 'cloud infrastructure'
echo ""

echo "4️⃣  Semantic Search: 'movie poster'"
echo "─────────────────────────────────────────"
node document-analyzer.js search 'movie poster'
echo ""

echo "✅ Demo complete!"
echo ""
echo "Available commands:"
echo "  node document-analyzer.js catalog"
echo "  node document-analyzer.js summarize <filename>"
echo "  node document-analyzer.js analyze <filename>"
echo "  node document-analyzer.js question <filename> '<question>'"
echo "  node document-analyzer.js search '<query>'"
