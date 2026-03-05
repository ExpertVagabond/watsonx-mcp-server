use serde::Deserialize;
use serde_json::{json, Value};
use std::io::BufRead;
use tracing::info;

struct Config {
    api_key: Option<String>,
    project_id: Option<String>,
    space_id: Option<String>,
    url: String,
    kp_api_key: Option<String>,
    kp_instance_id: Option<String>,
    kp_url: String,
    zos_url: Option<String>,
    zos_api_key: Option<String>,
    client: reqwest::Client,
    iam_token: Option<String>,
}

impl Config {
    fn new() -> Self {
        Self {
            api_key: std::env::var("WATSONX_API_KEY").ok(),
            project_id: std::env::var("WATSONX_PROJECT_ID").ok(),
            space_id: std::env::var("WATSONX_SPACE_ID").ok(),
            url: std::env::var("WATSONX_URL").unwrap_or_else(|_| "https://us-south.ml.cloud.ibm.com".to_string()),
            kp_api_key: std::env::var("KEY_PROTECT_API_KEY").ok().or_else(|| std::env::var("WATSONX_API_KEY").ok()),
            kp_instance_id: std::env::var("KEY_PROTECT_INSTANCE_ID").ok(),
            kp_url: std::env::var("KEY_PROTECT_URL").unwrap_or_else(|_| "https://us-south.kms.cloud.ibm.com".to_string()),
            zos_url: std::env::var("ZOS_CONNECT_URL").ok(),
            zos_api_key: std::env::var("ZOS_CONNECT_API_KEY").ok(),
            client: reqwest::Client::new(),
            iam_token: None,
        }
    }

    async fn get_iam_token(&mut self) -> Result<String, String> {
        if let Some(ref token) = self.iam_token {
            return Ok(token.clone());
        }
        let api_key = self.api_key.as_ref().ok_or("WATSONX_API_KEY not set")?;
        let resp = self.client.post("https://iam.cloud.ibm.com/identity/token")
            .form(&[("grant_type", "urn:ibm:params:oauth:grant-type:apikey"), ("apikey", api_key.as_str())])
            .send().await.map_err(|e| format!("IAM token error: {e}"))?;
        let body: Value = resp.json().await.map_err(|e| format!("IAM parse error: {e}"))?;
        let token = body["access_token"].as_str().ok_or("No access_token in IAM response")?.to_string();
        self.iam_token = Some(token.clone());
        Ok(token)
    }

    fn scope_params(&self) -> Value {
        if let Some(ref sid) = self.space_id {
            json!({"space_id": sid})
        } else if let Some(ref pid) = self.project_id {
            json!({"project_id": pid})
        } else {
            json!({})
        }
    }
}

#[derive(Deserialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: Option<Value>,
    method: String,
    #[serde(default)]
    params: Value,
}

fn tool_definitions() -> Value {
    json!([
        {
            "name": "watsonx_generate",
            "description": "Generate text using IBM watsonx.ai foundation models (Granite, Llama, Mistral, etc.)",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "prompt": {"type": "string", "description": "The prompt to send to the model"},
                    "model_id": {"type": "string", "description": "Model ID (e.g. ibm/granite-3-3-8b-instruct)", "default": "ibm/granite-3-3-8b-instruct"},
                    "max_new_tokens": {"type": "number", "default": 500},
                    "temperature": {"type": "number", "default": 0.7},
                    "top_p": {"type": "number", "default": 1.0},
                    "top_k": {"type": "number", "default": 50}
                },
                "required": ["prompt"]
            }
        },
        {
            "name": "watsonx_list_models",
            "description": "List available foundation models in watsonx.ai",
            "inputSchema": {"type": "object", "properties": {}}
        },
        {
            "name": "watsonx_embeddings",
            "description": "Generate text embeddings using watsonx.ai embedding models",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "texts": {"type": "array", "items": {"type": "string"}, "description": "Array of texts to embed"},
                    "model_id": {"type": "string", "default": "ibm/slate-125m-english-rtrvr-v2"}
                },
                "required": ["texts"]
            }
        },
        {
            "name": "watsonx_chat",
            "description": "Have a conversation with watsonx.ai chat models",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "messages": {"type": "array", "items": {"type": "object", "properties": {"role": {"type": "string"}, "content": {"type": "string"}}}, "description": "Chat messages"},
                    "model_id": {"type": "string", "default": "ibm/granite-3-3-8b-instruct"},
                    "max_new_tokens": {"type": "number", "default": 500},
                    "temperature": {"type": "number", "default": 0.7}
                },
                "required": ["messages"]
            }
        },
        {
            "name": "key_protect_list_keys",
            "description": "List encryption keys from IBM Key Protect (HSM-backed)",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "limit": {"type": "number", "default": 100},
                    "offset": {"type": "number", "default": 0}
                }
            }
        },
        {
            "name": "key_protect_create_key",
            "description": "Create a new encryption key in IBM Key Protect (FIPS 140-2 Level 3 HSM)",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Key name"},
                    "description": {"type": "string"},
                    "type": {"type": "string", "enum": ["root_key", "standard_key"], "default": "standard_key"},
                    "extractable": {"type": "boolean", "default": false}
                },
                "required": ["name"]
            }
        },
        {
            "name": "key_protect_get_key",
            "description": "Get details of a specific key from IBM Key Protect",
            "inputSchema": {
                "type": "object",
                "properties": {"key_id": {"type": "string", "description": "Key ID"}},
                "required": ["key_id"]
            }
        },
        {
            "name": "key_protect_wrap_key",
            "description": "Wrap (encrypt) data using a root key in IBM Key Protect",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "key_id": {"type": "string"},
                    "plaintext": {"type": "string", "description": "Base64-encoded data to wrap"},
                    "aad": {"type": "array", "items": {"type": "string"}}
                },
                "required": ["key_id", "plaintext"]
            }
        },
        {
            "name": "key_protect_unwrap_key",
            "description": "Unwrap (decrypt) data using a root key in IBM Key Protect",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "key_id": {"type": "string"},
                    "ciphertext": {"type": "string", "description": "Base64-encoded wrapped data"},
                    "aad": {"type": "array", "items": {"type": "string"}}
                },
                "required": ["key_id", "ciphertext"]
            }
        },
        {
            "name": "zos_connect_list_services",
            "description": "List available z/OS Connect services (RESTful APIs to mainframe programs)",
            "inputSchema": {"type": "object", "properties": {}}
        }
    ])
}

async fn call_tool(cfg: &mut Config, name: &str, args: &Value) -> Result<Value, String> {
    match name {
        "watsonx_generate" => {
            let token = cfg.get_iam_token().await?;
            let prompt = args["prompt"].as_str().ok_or("prompt required")?;
            let model = args["model_id"].as_str().unwrap_or("ibm/granite-3-3-8b-instruct");
            let max_tokens = args["max_new_tokens"].as_u64().unwrap_or(500);
            let temp = args["temperature"].as_f64().unwrap_or(0.7);
            let top_p = args["top_p"].as_f64().unwrap_or(1.0);
            let top_k = args["top_k"].as_u64().unwrap_or(50);

            let mut body = json!({
                "input": prompt,
                "model_id": model,
                "parameters": {
                    "max_new_tokens": max_tokens,
                    "temperature": temp,
                    "top_p": top_p,
                    "top_k": top_k
                }
            });
            let scope = cfg.scope_params();
            if let Some(obj) = scope.as_object() {
                for (k, v) in obj { body[k] = v.clone(); }
            }

            let resp = cfg.client.post(format!("{}/ml/v1/text/generation?version=2024-05-31", cfg.url))
                .bearer_auth(&token)
                .json(&body)
                .send().await.map_err(|e| format!("watsonx error: {e}"))?;
            let result: Value = resp.json().await.map_err(|e| format!("parse error: {e}"))?;
            let text = result["results"][0]["generated_text"].as_str().unwrap_or("");
            Ok(json!({"generated_text": text, "model": model}))
        }
        "watsonx_list_models" => {
            let token = cfg.get_iam_token().await?;
            let resp = cfg.client.get(format!("{}/ml/v1/foundation_model_specs?version=2024-05-31&limit=100", cfg.url))
                .bearer_auth(&token)
                .send().await.map_err(|e| format!("error: {e}"))?;
            let result: Value = resp.json().await.map_err(|e| format!("parse error: {e}"))?;
            let models: Vec<Value> = result["resources"].as_array().unwrap_or(&vec![]).iter().map(|m| {
                json!({"id": m["model_id"], "name": m["label"], "provider": m["provider"], "tasks": m["tasks"]})
            }).collect();
            Ok(json!({"models": models, "count": models.len()}))
        }
        "watsonx_embeddings" => {
            let token = cfg.get_iam_token().await?;
            let texts = args["texts"].as_array().ok_or("texts array required")?;
            let model = args["model_id"].as_str().unwrap_or("ibm/slate-125m-english-rtrvr-v2");

            let mut body = json!({"inputs": texts, "model_id": model});
            let scope = cfg.scope_params();
            if let Some(obj) = scope.as_object() {
                for (k, v) in obj { body[k] = v.clone(); }
            }

            let resp = cfg.client.post(format!("{}/ml/v1/text/embeddings?version=2024-05-31", cfg.url))
                .bearer_auth(&token)
                .json(&body)
                .send().await.map_err(|e| format!("error: {e}"))?;
            let result: Value = resp.json().await.map_err(|e| format!("parse error: {e}"))?;
            Ok(result)
        }
        "watsonx_chat" => {
            let token = cfg.get_iam_token().await?;
            let messages = args["messages"].as_array().ok_or("messages required")?;
            let model = args["model_id"].as_str().unwrap_or("ibm/granite-3-3-8b-instruct");
            let max_tokens = args["max_new_tokens"].as_u64().unwrap_or(500);
            let temp = args["temperature"].as_f64().unwrap_or(0.7);

            let formatted: String = messages.iter().map(|m| {
                let role = m["role"].as_str().unwrap_or("user");
                let content = m["content"].as_str().unwrap_or("");
                match role {
                    "system" => format!("System: {content}"),
                    "assistant" => format!("Assistant: {content}"),
                    _ => format!("User: {content}"),
                }
            }).collect::<Vec<_>>().join("\n\n");

            let prompt = format!("{formatted}\n\nAssistant:");
            let mut body = json!({
                "input": prompt,
                "model_id": model,
                "parameters": {
                    "max_new_tokens": max_tokens,
                    "temperature": temp,
                    "stop_sequences": ["User:", "System:"]
                }
            });
            let scope = cfg.scope_params();
            if let Some(obj) = scope.as_object() {
                for (k, v) in obj { body[k] = v.clone(); }
            }

            let resp = cfg.client.post(format!("{}/ml/v1/text/generation?version=2024-05-31", cfg.url))
                .bearer_auth(&token)
                .json(&body)
                .send().await.map_err(|e| format!("error: {e}"))?;
            let result: Value = resp.json().await.map_err(|e| format!("parse error: {e}"))?;
            let text = result["results"][0]["generated_text"].as_str().unwrap_or("").trim();
            Ok(json!({"response": text, "model": model}))
        }
        "key_protect_list_keys" => {
            let token = cfg.get_iam_token().await?;
            let instance_id = cfg.kp_instance_id.as_ref().ok_or("KEY_PROTECT_INSTANCE_ID not set")?;
            let limit = args["limit"].as_u64().unwrap_or(100);
            let offset = args["offset"].as_u64().unwrap_or(0);
            let resp = cfg.client.get(format!("{}/api/v2/keys?limit={limit}&offset={offset}", cfg.kp_url))
                .bearer_auth(&token)
                .header("Bluemix-Instance", instance_id.as_str())
                .send().await.map_err(|e| format!("error: {e}"))?;
            let result: Value = resp.json().await.map_err(|e| format!("parse error: {e}"))?;
            Ok(result)
        }
        "key_protect_create_key" => {
            let token = cfg.get_iam_token().await?;
            let instance_id = cfg.kp_instance_id.as_ref().ok_or("KEY_PROTECT_INSTANCE_ID not set")?;
            let key_name = args["name"].as_str().ok_or("name required")?;
            let key_type = args["type"].as_str().unwrap_or("standard_key");
            let extractable = args["extractable"].as_bool().unwrap_or(false);
            let body = json!({
                "metadata": {"collectionType": "application/vnd.ibm.kms.key+json", "collectionTotal": 1},
                "resources": [{"type": key_type, "name": key_name, "extractable": extractable}]
            });
            let resp = cfg.client.post(format!("{}/api/v2/keys", cfg.kp_url))
                .bearer_auth(&token)
                .header("Bluemix-Instance", instance_id.as_str())
                .json(&body)
                .send().await.map_err(|e| format!("error: {e}"))?;
            let result: Value = resp.json().await.map_err(|e| format!("parse error: {e}"))?;
            Ok(result)
        }
        "key_protect_get_key" => {
            let token = cfg.get_iam_token().await?;
            let instance_id = cfg.kp_instance_id.as_ref().ok_or("KEY_PROTECT_INSTANCE_ID not set")?;
            let key_id = args["key_id"].as_str().ok_or("key_id required")?;
            let resp = cfg.client.get(format!("{}/api/v2/keys/{key_id}", cfg.kp_url))
                .bearer_auth(&token)
                .header("Bluemix-Instance", instance_id.as_str())
                .send().await.map_err(|e| format!("error: {e}"))?;
            let result: Value = resp.json().await.map_err(|e| format!("parse error: {e}"))?;
            Ok(result)
        }
        "key_protect_wrap_key" => {
            let token = cfg.get_iam_token().await?;
            let instance_id = cfg.kp_instance_id.as_ref().ok_or("KEY_PROTECT_INSTANCE_ID not set")?;
            let key_id = args["key_id"].as_str().ok_or("key_id required")?;
            let plaintext = args["plaintext"].as_str().ok_or("plaintext required")?;
            let mut body = json!({"plaintext": plaintext});
            if let Some(aad) = args["aad"].as_array() {
                body["aad"] = json!(aad);
            }
            let resp = cfg.client.post(format!("{}/api/v2/keys/{key_id}/actions/wrap", cfg.kp_url))
                .bearer_auth(&token)
                .header("Bluemix-Instance", instance_id.as_str())
                .json(&body)
                .send().await.map_err(|e| format!("error: {e}"))?;
            let result: Value = resp.json().await.map_err(|e| format!("parse error: {e}"))?;
            Ok(result)
        }
        "key_protect_unwrap_key" => {
            let token = cfg.get_iam_token().await?;
            let instance_id = cfg.kp_instance_id.as_ref().ok_or("KEY_PROTECT_INSTANCE_ID not set")?;
            let key_id = args["key_id"].as_str().ok_or("key_id required")?;
            let ciphertext = args["ciphertext"].as_str().ok_or("ciphertext required")?;
            let mut body = json!({"ciphertext": ciphertext});
            if let Some(aad) = args["aad"].as_array() {
                body["aad"] = json!(aad);
            }
            let resp = cfg.client.post(format!("{}/api/v2/keys/{key_id}/actions/unwrap", cfg.kp_url))
                .bearer_auth(&token)
                .header("Bluemix-Instance", instance_id.as_str())
                .json(&body)
                .send().await.map_err(|e| format!("error: {e}"))?;
            let result: Value = resp.json().await.map_err(|e| format!("parse error: {e}"))?;
            Ok(result)
        }
        "zos_connect_list_services" => {
            let zos_url = cfg.zos_url.as_ref().ok_or("ZOS_CONNECT_URL not set")?;
            let mut req = cfg.client.get(format!("{zos_url}/zosConnect/services"));
            if let Some(ref key) = cfg.zos_api_key {
                req = req.bearer_auth(key);
            }
            let resp = req.send().await.map_err(|e| format!("error: {e}"))?;
            let result: Value = resp.json().await.map_err(|e| format!("parse error: {e}"))?;
            Ok(result)
        }
        _ => Err(format!("Unknown tool: {name}")),
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_env_filter("info").with_writer(std::io::stderr).init();
    info!("watsonx-mcp-server starting on stdio");

    let mut cfg = Config::new();
    let stdin = std::io::stdin();
    let stdout = std::io::stdout();

    let mut line = String::new();
    loop {
        line.clear();
        if stdin.lock().read_line(&mut line).unwrap_or(0) == 0 { break; }
        let trimmed = line.trim();
        if trimmed.is_empty() { continue; }

        let req: JsonRpcRequest = match serde_json::from_str(trimmed) {
            Ok(r) => r,
            Err(_) => continue,
        };

        let response = match req.method.as_str() {
            "initialize" => json!({
                "jsonrpc": "2.0",
                "id": req.id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "watsonx-mcp-server", "version": "0.1.0"}
                }
            }),
            "notifications/initialized" => continue,
            "tools/list" => json!({
                "jsonrpc": "2.0",
                "id": req.id,
                "result": {"tools": tool_definitions()}
            }),
            "tools/call" => {
                let tool_name = req.params["name"].as_str().unwrap_or("");
                let arguments = &req.params["arguments"];
                match call_tool(&mut cfg, tool_name, arguments).await {
                    Ok(result) => json!({
                        "jsonrpc": "2.0",
                        "id": req.id,
                        "result": {
                            "content": [{"type": "text", "text": serde_json::to_string_pretty(&result).unwrap_or_default()}]
                        }
                    }),
                    Err(e) => json!({
                        "jsonrpc": "2.0",
                        "id": req.id,
                        "result": {
                            "content": [{"type": "text", "text": format!("Error: {e}")}],
                            "isError": true
                        }
                    }),
                }
            }
            _ => json!({
                "jsonrpc": "2.0",
                "id": req.id,
                "error": {"code": -32601, "message": format!("Unknown method: {}", req.method)}
            }),
        };

        use std::io::Write;
        let out = serde_json::to_string(&response).unwrap();
        let mut lock = stdout.lock();
        let _ = writeln!(lock, "{out}");
        let _ = lock.flush();
    }
}
