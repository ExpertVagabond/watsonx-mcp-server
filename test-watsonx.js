#!/usr/bin/env node
import { WatsonXAI } from '@ibm-cloud/watsonx-ai';
import { IamAuthenticator } from 'ibm-cloud-sdk-core';

const client = WatsonXAI.newInstance({
  version: '2024-05-31',
  serviceUrl: process.env.WATSONX_URL || 'https://us-south.ml.cloud.ibm.com',
  authenticator: new IamAuthenticator({
    apikey: process.env.WATSONX_API_KEY,
  }),
});

console.log('=== watsonx.ai MCP Server Test ===\n');

// List available models
console.log('1. Listing foundation models...');
const modelsResp = await client.listFoundationModelSpecs({ limit: 10 });
const models = modelsResp.result.resources || [];
console.log(`   Found ${models.length} models:`);
models.slice(0, 5).forEach(m => {
  console.log(`   - ${m.model_id}`);
});
if (models.length > 5) {
  console.log(`   ... and ${models.length - 5} more`);
}

console.log('\n✅ watsonx.ai connection successful!');
console.log('\nNote: Text generation requires a Project ID. Create a project at:');
console.log('https://dataplatform.cloud.ibm.com');
