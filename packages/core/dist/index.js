// src/GeminiChat.ts
import { GoogleGenAI } from "@google/genai";

// src/ToolSystem.ts
var ToolSystem = class {
  tools = /* @__PURE__ */ new Map();
  registerTool(tool) {
    this.tools.set(tool.name, tool);
  }
  getTools() {
    return Array.from(this.tools.values());
  }
  async executeTool(name, args) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool ${name} not found`);
    }
    return tool.execute(args);
  }
};

// src/GeminiChat.ts
var GeminiChat = class {
  ai;
  history = [];
  toolSystem;
  constructor(apiKey) {
    this.ai = new GoogleGenAI({ apiKey });
    this.toolSystem = new ToolSystem();
  }
  getFunctionDeclarations() {
    return this.toolSystem.getTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }));
  }
  async sendMessage(prompt, onChunk, onToolCall) {
    this.history.push({ role: "user", parts: [{ text: prompt }] });
    return this.runGeneratorLoop(onChunk, onToolCall);
  }
  async runGeneratorLoop(onChunk, onToolCall) {
    const config = {
      systemInstruction: "You are a helpful coding assistant. You have access to tools. Always ask for permission via onToolCall (if provided) before taking destructive actions."
    };
    const declarations = this.getFunctionDeclarations();
    if (declarations.length > 0) {
      config.tools = [{ functionDeclarations: declarations }];
    }
    const responseStream = await this.ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: this.history,
      config
    });
    let fullText = "";
    let functionCalls = [];
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
    const modelParts = [];
    if (fullText)
      modelParts.push({ text: fullText });
    for (const fc of functionCalls) {
      modelParts.push({ functionCall: fc });
    }
    this.history.push({ role: "model", parts: modelParts });
    if (functionCalls.length > 0) {
      const functionResponses = [];
      for (const call of functionCalls) {
        try {
          let approved = true;
          if (onToolCall) {
            approved = await onToolCall(call.name, call.args);
          }
          if (approved) {
            const result = await this.toolSystem.executeTool(
              call.name,
              call.args
            );
            functionResponses.push({
              functionResponse: {
                name: call.name,
                response: result
              }
            });
          } else {
            functionResponses.push({
              functionResponse: {
                name: call.name,
                response: { error: "User denied execution." }
              }
            });
          }
        } catch (e) {
          functionResponses.push({
            functionResponse: {
              name: call.name,
              response: { error: e.message }
            }
          });
        }
      }
      this.history.push({ role: "user", parts: functionResponses });
      return this.runGeneratorLoop(onChunk, onToolCall);
    }
    return fullText;
  }
};

// src/tools/readFile.ts
import fs from "fs/promises";
var readFileTool = {
  name: "read_file",
  description: "Reads a file from the local file system.",
  parameters: {
    type: "OBJECT",
    properties: {
      path: {
        type: "STRING",
        description: "The absolute or relative path to the file to read."
      }
    },
    required: ["path"]
  },
  execute: async (args) => {
    try {
      const content = await fs.readFile(args.path, "utf8");
      return { content };
    } catch (e) {
      return { error: e.message };
    }
  }
};

// src/tools/executeCommand.ts
import { exec } from "child_process";
import util from "util";
var execAsync = util.promisify(exec);
var executeCommandTool = {
  name: "execute_command",
  description: "Executes a shell command on the user's system.",
  parameters: {
    type: "OBJECT",
    properties: {
      command: {
        type: "STRING",
        description: "The shell command to execute."
      }
    },
    required: ["command"]
  },
  execute: async (args) => {
    try {
      const { stdout, stderr } = await execAsync(args.command);
      return { stdout, stderr };
    } catch (e) {
      return { error: e.message, stdout: e.stdout, stderr: e.stderr };
    }
  }
};

// src/mcp/MCPClient.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
var MCPClientProvider = class {
  client;
  transport;
  constructor(command, args) {
    this.transport = new StdioClientTransport({
      command,
      args
    });
    this.client = new Client(
      {
        name: "gemini-code-cli",
        version: "0.0.1"
      },
      {
        capabilities: {}
      }
    );
  }
  async connect() {
    await this.client.connect(this.transport);
  }
  async getTools() {
    const response = await this.client.listTools();
    return response.tools.map((mcpTool) => ({
      name: mcpTool.name,
      description: mcpTool.description || "",
      parameters: mcpTool.inputSchema,
      execute: async (args) => {
        const result = await this.client.callTool({
          name: mcpTool.name,
          arguments: args
        });
        return result.content || result;
      }
    }));
  }
};
export {
  GeminiChat,
  MCPClientProvider,
  ToolSystem,
  executeCommandTool,
  readFileTool
};
