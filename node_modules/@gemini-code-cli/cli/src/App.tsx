import React, { useState, useEffect } from "react";
import { Text, Box } from "ink";
import TextInput from "ink-text-input";
import {
  GeminiChat,
  readFileTool,
  executeCommandTool,
} from "@gemini-code-cli/core";

export function App() {
  const [input, setInput] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [messages, setMessages] = useState<{ role: string; content: string }[]>(
    [],
  );
  const [chat, setChat] = useState<GeminiChat | null>(null);
  const [isTyping, setIsTyping] = useState(true);
  const [toolRequest, setToolRequest] = useState<{
    name: string;
    args: any;
    resolve: (b: boolean) => void;
  } | null>(null);

  useEffect(() => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      const c = new GeminiChat(apiKey);
      c.toolSystem.registerTool(readFileTool);
      c.toolSystem.registerTool(executeCommandTool);
      setChat(c);

      // Start with a small welcome
      setMessages([
        {
          role: "model",
          content: "Hello! I am Gemini Code CLI. How can I help you today?",
        },
      ]);
    }
  }, []);

  const handleSubmit = async (query: string) => {
    if (!chat || !query.trim()) return;

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
      { role: "model", content: "" },
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
          return new Promise<boolean>((resolve) => {
            setToolRequest({ name, args, resolve });
          });
        },
      );
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "error", content: e.message }]);
    }

    setIsTyping(true);
  };

  if (!chat) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red" bold>
          GEMINI_API_KEY environment variable is not set.
        </Text>
        <Box flexDirection="row" marginTop={1}>
          <Text color="green">Enter API Key: </Text>
          <TextInput
            mask="*"
            value={apiKeyInput}
            onChange={setApiKeyInput}
            onSubmit={(val) => {
              if (val.trim()) {
                process.env.GEMINI_API_KEY = val.trim();
                const c = new GeminiChat(val.trim());
                c.toolSystem.registerTool(readFileTool);
                c.toolSystem.registerTool(executeCommandTool);
                setChat(c);
                setMessages([
                  {
                    role: "model",
                    content:
                      "Hello! I am Gemini Code CLI. How can I help you today?",
                  },
                ]);
              }
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text color="gray">
            (This key is only stored in memory for this session. Type /logout to
            remove it from memory later.)
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">
            (To clear it from your OS permanently, you must delete the
            GEMINI_API_KEY environment variable from your system configuration.)
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text color="green" bold>
        Gemini Code CLI 🤖
      </Text>

      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        {messages.map((m, i) => (
          <Box key={i} flexDirection="row">
            <Text
              color={
                m.role === "user"
                  ? "cyan"
                  : m.role === "error"
                    ? "red"
                    : "white"
              }
            >
              {m.role === "user"
                ? "You >> "
                : m.role === "model"
                  ? "Gemini >> "
                  : "System >> "}
            </Text>
            <Text>{m.content}</Text>
          </Box>
        ))}
      </Box>

      {toolRequest && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="yellow"
          padding={1}
        >
          <Text color="yellow">⚠️ Tool Execution Request</Text>
          <Text>Tool: {toolRequest.name}</Text>
          <Text>Args: {JSON.stringify(toolRequest.args)}</Text>
          <Box marginTop={1}>
            <Text>Allow this execution? (y/n): </Text>
            <TextInput
              value=""
              onChange={(v) => {
                if (v.toLowerCase() === "y") {
                  toolRequest.resolve(true);
                  setToolRequest(null);
                } else if (v.toLowerCase() === "n") {
                  toolRequest.resolve(false);
                  setToolRequest(null);
                }
              }}
            />
          </Box>
        </Box>
      )}

      {isTyping && !toolRequest && (
        <Box flexDirection="row">
          <Text color="green">❯ </Text>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
          />
        </Box>
      )}
    </Box>
  );
}
