# Troubleshooting Guide

Common issues and solutions for the watsonx MCP Server.

## Authentication Errors

### `WATSONX_API_KEY not set`

**Cause**: The API key environment variable is missing or empty.

**Solution**:
```bash
# Set your IBM Cloud API key
export WATSONX_API_KEY="your-ibm-cloud-api-key"

# Or add to your Claude Code MCP config in ~/.claude.json
```

### `401 Unauthorized`

**Cause**: Invalid or expired API key.

**Solutions**:
1. Verify your API key is correct in IBM Cloud console
2. Generate a new API key if expired
3. Ensure the API key has access to watsonx.ai services

### `403 Forbidden`

**Cause**: API key lacks permissions for watsonx.ai.

**Solutions**:
1. Check IAM permissions in IBM Cloud
2. Ensure your account has watsonx.ai service enabled
3. Verify the API key is associated with the correct account

## Configuration Errors

### `Space ID or Project ID required`

**Cause**: Neither `WATSONX_SPACE_ID` nor `WATSONX_PROJECT_ID` is set.

**Solution**:
```bash
# Use a deployment space (recommended)
export WATSONX_SPACE_ID="your-deployment-space-id"

# OR use a project
export WATSONX_PROJECT_ID="your-project-id"
```

**Finding your Space/Project ID**:
1. Go to [IBM watsonx.ai](https://dataplatform.cloud.ibm.com)
2. Open your deployment space or project
3. Go to Settings/Manage tab
4. Copy the Space ID or Project ID

### `Invalid region URL`

**Cause**: `WATSONX_URL` points to wrong region or is malformed.

**Valid regions**:
```bash
# US South (Dallas)
WATSONX_URL=https://us-south.ml.cloud.ibm.com

# EU Germany (Frankfurt)
WATSONX_URL=https://eu-de.ml.cloud.ibm.com

# EU Great Britain (London)
WATSONX_URL=https://eu-gb.ml.cloud.ibm.com

# Asia Pacific (Tokyo)
WATSONX_URL=https://jp-tok.ml.cloud.ibm.com
```

## Model Errors

### `Model not found`

**Cause**: The specified model ID doesn't exist or isn't available.

**Solution**:
1. Use `watsonx_list_models` to see available models
2. Check model ID spelling (case-sensitive)
3. Some models require specific deployment space types

**Common model IDs**:
- `ibm/granite-3-3-8b-instruct`
- `ibm/granite-13b-chat-v2`
- `meta-llama/llama-3-70b-instruct`
- `mistralai/mistral-large`

### `Token limit exceeded`

**Cause**: Input or output exceeds model's maximum token limit.

**Solutions**:
1. Reduce input text length
2. Set `max_new_tokens` to a lower value
3. Use a model with higher token limits

**Token limits by model**:
| Model | Max Input | Max Output |
|-------|-----------|------------|
| granite-3-3-8b-instruct | 8192 | 8192 |
| granite-13b-chat-v2 | 8192 | 4096 |
| llama-3-70b-instruct | 8192 | 4096 |

## Connection Errors

### `ECONNREFUSED` or `ETIMEDOUT`

**Cause**: Cannot reach IBM Cloud endpoints.

**Solutions**:
1. Check internet connectivity
2. Verify no firewall blocking IBM Cloud IPs
3. Check IBM Cloud status page for outages
4. Try a different region endpoint

### `Rate limit exceeded`

**Cause**: Too many API requests in a short period.

**Solutions**:
1. Add delays between requests
2. Implement exponential backoff
3. Check your service plan limits
4. Upgrade to higher tier if needed

## MCP Server Errors

### Server not appearing in Claude Code

**Solutions**:
1. Verify `~/.claude.json` syntax is valid JSON
2. Check the path to `index.js` is correct
3. Restart Claude Code after config changes
4. Check server logs: `node /path/to/index.js`

### `Cannot find module` errors

**Cause**: Dependencies not installed.

**Solution**:
```bash
cd ~/watsonx-mcp-server
npm install
```

## Debugging

### Enable verbose logging

```bash
# Run server directly to see errors
node /Users/matthewkarsten/watsonx-mcp-server/index.js

# Check for syntax errors
node --check /Users/matthewkarsten/watsonx-mcp-server/index.js
```

### Test API connection

```bash
# Test with curl
curl -X GET "https://us-south.ml.cloud.ibm.com/ml/v1/foundation_model_specs?version=2024-01-01" \
  -H "Authorization: Bearer $(ibmcloud iam oauth-tokens | grep IAM | awk '{print $4}')"
```

## Getting Help

- [IBM watsonx.ai Documentation](https://cloud.ibm.com/docs/watsonx-ai)
- [IBM Cloud Status](https://cloud.ibm.com/status)
- [GitHub Issues](https://github.com/PurpleSquirrelMedia/watsonx-mcp-server/issues)
