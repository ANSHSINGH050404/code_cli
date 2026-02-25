import { GoogleGenAI, Type, Content } from "@google/genai";
import { ToolSystem } from "./ToolSystem.js";

type HistoryItem = {
  role: "user" | "model";
  parts: any[];
};

export class GeminiChat {
  private ai: GoogleGenAI;
  private history: HistoryItem[] = [];
  public toolSystem: ToolSystem;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
    this.toolSystem = new ToolSystem();
  }

  private getFunctionDeclarations() {
    return this.toolSystem.getTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  async sendMessage(
    prompt: string,
    onChunk?: (chunk: string) => void,
    onToolCall?: (name: string, args: any) => Promise<boolean>,
  ): Promise<string> {
    this.history.push({ role: "user", parts: [{ text: prompt }] });

    return this.runGeneratorLoop(onChunk, onToolCall);
  }

  private async runGeneratorLoop(
    onChunk?: (chunk: string) => void,
    onToolCall?: (name: string, args: any) => Promise<boolean>,
  ): Promise<string> {
    const config: any = {
      systemInstruction:
        "You are a helpful coding assistant. You have access to tools. Always ask for permission via onToolCall (if provided) before taking destructive actions.",
    };

    const declarations = this.getFunctionDeclarations();
    if (declarations.length > 0) {
      config.tools = [{ functionDeclarations: declarations }];
    }

    const responseStream = await this.ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: this.history,
      config,
    });

    let fullText = "";
    let functionCalls: any[] = [];

    for await (const chunk of responseStream) {
      if (chunk.text && onChunk) {
        onChunk(chunk.text);
      }
      if (chunk.text) {
        fullText += chunk.text;
      }
      if (chunk.functionCalls && chunk.functionCalls.length > 0) {
        functionCalls.push(...chunk.functionCalls);
      }
    }

    const modelParts: any[] = [];
    if (fullText) modelParts.push({ text: fullText });
    for (const fc of functionCalls) {
      modelParts.push({ functionCall: fc });
    }

    this.history.push({ role: "model", parts: modelParts });

    if (functionCalls.length > 0) {
      const functionResponses: any[] = [];
      for (const call of functionCalls) {
        try {
          let approved = true;
          if (onToolCall) {
            approved = await onToolCall(call.name, call.args);
          }
          if (approved) {
            const result = await this.toolSystem.executeTool(
              call.name,
              call.args,
            );
            functionResponses.push({
              functionResponse: {
                name: call.name,
                response: result,
              },
            });
          } else {
            functionResponses.push({
              functionResponse: {
                name: call.name,
                response: { error: "User denied execution." },
              },
            });
          }
        } catch (e: any) {
          functionResponses.push({
            functionResponse: {
              name: call.name,
              response: { error: e.message },
            },
          });
        }
      }

      this.history.push({ role: "user", parts: functionResponses });
      return this.runGeneratorLoop(onChunk, onToolCall);
    }

    return fullText;
  }
}
