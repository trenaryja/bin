use serde_json::json;
use std::time::Duration;

pub const OLLAMA_URL: &str = "http://localhost:11434/v1/chat/completions";

pub struct Message {
    pub role: &'static str,
    pub content: String,
}

pub fn chat(
    model: &str,
    messages: &[Message],
    url: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    let body = json!({
        "model": model,
        "messages": messages.iter().map(|m| json!({
            "role": m.role,
            "content": m.content,
        })).collect::<Vec<_>>(),
        "stream": false,
    });

    let response = reqwest::blocking::Client::new()
        .post(url)
        .json(&body)
        .timeout(Duration::from_secs(120))
        .send()?
        .json::<serde_json::Value>()?;

    let content = response["choices"][0]["message"]["content"]
        .as_str()
        .ok_or("Empty response from Ollama")?
        .trim()
        .to_string();

    Ok(content)
}
