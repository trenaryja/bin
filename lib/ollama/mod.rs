use serde_json::json;
use std::time::Duration;

pub const OLLAMA_URL: &str = "http://localhost:11434/api/chat";

pub const MODEL_DEEPSEEK_CODER_V2: &str = "deepseek-coder-v2:latest";
pub const MODEL_MISTRAL_7B: &str = "mistral:7b";
pub const MODEL_QWEN25_CODER_7B: &str = "qwen2.5-coder:7b";

pub struct Message {
    pub role: &'static str,
    pub content: String,
}

pub fn chat(
    model: &str,
    messages: &[Message],
    url: &str,
    num_ctx: Option<u32>,
) -> Result<String, Box<dyn std::error::Error>> {
    let mut body = json!({
        "model": model,
        "messages": messages.iter().map(|m| json!({
            "role": m.role,
            "content": m.content,
        })).collect::<Vec<_>>(),
        "stream": false,
    });

    if let Some(ctx) = num_ctx {
        body["options"] = json!({ "num_ctx": ctx });
    }

    let response = reqwest::blocking::Client::new()
        .post(url)
        .json(&body)
        .timeout(Duration::from_secs(120))
        .send()?
        .json::<serde_json::Value>()?;

    let content = response["message"]["content"]
        .as_str()
        .ok_or("Empty response from Ollama")?
        .trim()
        .to_string();

    Ok(content)
}
