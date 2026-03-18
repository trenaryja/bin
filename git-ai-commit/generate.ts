import { chat, type OllamaModel } from "@/lib";
import config from "./config.json";

export const generate = (diff: string): Promise<string> =>
  chat(config.model as OllamaModel, [
    { role: "system", content: config.systemPrompt },
    { role: "user", content: `Here is the staged diff:\n\n${diff}` },
  ]);
