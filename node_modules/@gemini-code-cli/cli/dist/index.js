#!/usr/bin/env node

// src/index.tsx
import React2 from "react";
import { render } from "ink";

// src/App.tsx
import React, { useState, useEffect } from "react";
import { Text, Box } from "ink";
import TextInput from "ink-text-input";

// ../core/src/GeminiChat.ts
import { GoogleGenAI } from "@google/genai";

// ../core/src/ToolSystem.ts
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

// ../core/src/GeminiChat.ts
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

// ../core/src/tools/readFile.ts
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

// ../core/src/tools/executeCommand.ts
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

// ../core/src/mcp/MCPClient.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// src/App.tsx
function App() {
  const [input, setInput] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [messages, setMessages] = useState(
    []
  );
  const [chat, setChat] = useState(null);
  const [isTyping, setIsTyping] = useState(true);
  const [toolRequest, setToolRequest] = useState(null);
  useEffect(() => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      const c = new GeminiChat(apiKey);
      c.toolSystem.registerTool(readFileTool);
      c.toolSystem.registerTool(executeCommandTool);
      setChat(c);
      setMessages([
        {
          role: "model",
          content: "Hello! I am Gemini Code CLI. How can I help you today?"
        }
      ]);
    }
  }, []);
  const handleSubmit = async (query) => {
    if (!chat || !query.trim())
      return;
    if (query.trim() === "/logout") {
      setChat(null);
      setMessages([]);
      setApiKeyInput("");
      delete process.env.GEMINI_API_KEY;
      setInput("");
      return;
    }
    setInput("");
    setIsTyping(false);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: query },
      { role: "model", content: "" }
    ]);
    try {
      await chat.sendMessage(
        query,
        (chunk) => {
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1].content += chunk;
            return next;
          });
        },
        async (name, args) => {
          return new Promise((resolve) => {
            setToolRequest({ name, args, resolve });
          });
        }
      );
    } catch (e) {
      setMessages((prev) => [...prev, { role: "error", content: e.message }]);
    }
    setIsTyping(true);
  };
  if (!chat) {
    return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", padding: 1 }, /* @__PURE__ */ React.createElement(Text, { color: "red", bold: true }, "GEMINI_API_KEY environment variable is not set."), /* @__PURE__ */ React.createElement(Box, { flexDirection: "row", marginTop: 1 }, /* @__PURE__ */ React.createElement(Text, { color: "green" }, "Enter API Key: "), /* @__PURE__ */ React.createElement(
      TextInput,
      {
        mask: "*",
        value: apiKeyInput,
        onChange: setApiKeyInput,
        onSubmit: (val) => {
          if (val.trim()) {
            process.env.GEMINI_API_KEY = val.trim();
            const c = new GeminiChat(val.trim());
            c.toolSystem.registerTool(readFileTool);
            c.toolSystem.registerTool(executeCommandTool);
            setChat(c);
            setMessages([
              {
                role: "model",
                content: "Hello! I am Gemini Code CLI. How can I help you today?"
              }
            ]);
          }
        }
      }
    )), /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(Text, { color: "gray" }, "(This key is only stored in memory for this session. Type /logout to remove it from memory later.)")), /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(Text, { color: "gray" }, "(To clear it from your OS permanently, you must delete the GEMINI_API_KEY environment variable from your system configuration.)")));
  }
  return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", padding: 1 }, /* @__PURE__ */ React.createElement(Text, { color: "green", bold: true }, "Gemini Code CLI \u{1F916}"), /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", marginTop: 1, marginBottom: 1 }, messages.map((m, i) => /* @__PURE__ */ React.createElement(Box, { key: i, flexDirection: "row" }, /* @__PURE__ */ React.createElement(
    Text,
    {
      color: m.role === "user" ? "cyan" : m.role === "error" ? "red" : "white"
    },
    m.role === "user" ? "You >> " : m.role === "model" ? "Gemini >> " : "System >> "
  ), /* @__PURE__ */ React.createElement(Text, null, m.content)))), toolRequest && /* @__PURE__ */ React.createElement(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "yellow",
      padding: 1
    },
    /* @__PURE__ */ React.createElement(Text, { color: "yellow" }, "\u26A0\uFE0F Tool Execution Request"),
    /* @__PURE__ */ React.createElement(Text, null, "Tool: ", toolRequest.name),
    /* @__PURE__ */ React.createElement(Text, null, "Args: ", JSON.stringify(toolRequest.args)),
    /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(Text, null, "Allow this execution? (y/n): "), /* @__PURE__ */ React.createElement(
      TextInput,
      {
        value: "",
        onChange: (v) => {
          if (v.toLowerCase() === "y") {
            toolRequest.resolve(true);
            setToolRequest(null);
          } else if (v.toLowerCase() === "n") {
            toolRequest.resolve(false);
            setToolRequest(null);
          }
        }
      }
    ))
  ), isTyping && !toolRequest && /* @__PURE__ */ React.createElement(Box, { flexDirection: "row" }, /* @__PURE__ */ React.createElement(Text, { color: "green" }, "\u276F "), /* @__PURE__ */ React.createElement(
    TextInput,
    {
      value: input,
      onChange: setInput,
      onSubmit: handleSubmit
    }
  )));
}

// src/index.tsx
render(/* @__PURE__ */ React2.createElement(App, null));
