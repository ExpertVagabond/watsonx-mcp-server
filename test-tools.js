#!/usr/bin/env node
import { WatsonXAI } from '@ibm-cloud/watsonx-ai';
import { IamAuthenticator } from 'ibm-cloud-sdk-core';

const WATSONX_API_KEY = process.env.WATSONX_API_KEY || 'Xj6rt9ygHP2gtlqvs2ycE7HiEytDtaqEJVlu9wIcM-Fl';
const WATSONX_PROJECT_ID = process.env.WATSONX_PROJECT_ID || 'd10531c9-281c-45d9-9559-7bd2b30b4ad0';
const WATSONX_URL = process.env.WATSONX_URL || 'https://us-south.ml.cloud.ibm.com';

const client = WatsonXAI.newInstance({
  version: '2024-05-31',
  serviceUrl: WATSONX_URL,
  authenticator: new IamAuthenticator({
    apikey: WATSONX_API_KEY,
  }),
});

console.log('=== Testing watsonx MCP Server Tools ===\n');

// Test 1: List models
console.log('1. Testing watsonx_list_models...');
try {
  const response = await client.listFoundationModelSpecs({ limit: 10 });
  const models = response.result.resources || [];
  console.log(`   ✓ Success! Found ${models.length} models:`);
  models.slice(0, 5).forEach(m => {
    console.log(`   - ${m.model_id}`);
  });
  if (models.length > 5) {
    console.log(`   ... and ${models.length - 5} more`);
  }
} catch (error) {
  console.log(`   ✗ Error: ${error.message}`);
}

// Test 2: Generate text
console.log('\n2. Testing watsonx_generate...');
try {
  const response = await client.generateText({
    input: 'Explain blockchain in one sentence',
    modelId: 'ibm/granite-13b-chat-v2',
    projectId: WATSONX_PROJECT_ID,
    parameters: {
      max_new_tokens: 100,
      temperature: 0.7,
    },
  });

  const generatedText = response.result.results?.[0]?.generated_text || '';
  console.log(`   ✓ Success! Generated text:`);
  console.log(`   "${generatedText.trim()}"`);
} catch (error) {
  console.log(`   ✗ Error: ${error.message}`);
  if (error.status) {
    console.log(`   Status: ${error.status}`);
  }
  if (error.body) {
    console.log(`   Body: ${JSON.stringify(error.body, null, 2)}`);
  }
}

console.log('\n=== Test Complete ===');
