package ollama

import (
	"context"
	"fmt"
	"strings"

	"github.com/ollama/ollama/api"
)

type Model = string

const (
	ModelDeepseekCoderV2 Model = "deepseek-coder-v2:latest"
	ModelMistral7B       Model = "mistral:7b"
	ModelQwen25Coder7B   Model = "qwen2.5-coder:7b"
)

func Chat(model Model, messages []api.Message, numCtx int) (string, error) {
	client, err := api.ClientFromEnvironment()
	if err != nil {
		return "", err
	}

	stream := false
	req := &api.ChatRequest{
		Model:    model,
		Messages: messages,
		Stream:   &stream,
	}
	if numCtx > 0 {
		req.Options = map[string]any{"num_ctx": numCtx}
	}

	var content string
	err = client.Chat(context.Background(), req, func(resp api.ChatResponse) error {
		content = resp.Message.Content
		return nil
	})
	if err != nil {
		return "", err
	}

	content = strings.TrimSpace(content)
	if content == "" {
		return "", fmt.Errorf("empty response from ollama")
	}
	return content, nil
}
