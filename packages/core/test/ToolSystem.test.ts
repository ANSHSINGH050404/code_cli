import { expect, test, describe } from "vitest";
import { ToolSystem } from "../src/ToolSystem.js";
import { Tool } from "@gemini-code-cli/sdk";

describe("ToolSystem", () => {
  test("registers and executes a tool", async () => {
    const system = new ToolSystem();
    const mockTool: Tool = {
      name: "mock_tool",
      description: "A mock tool",
      parameters: {},
      execute: async (args: any) => {
        return { result: args.input * 2 };
      },
    };

    system.registerTool(mockTool);

    const tools = system.getTools();
    expect(tools.length).toBe(1);
    expect(tools[0].name).toBe("mock_tool");

    const result = await system.executeTool("mock_tool", { input: 10 });
    expect(result.result).toBe(20);
  });

  test("throws on invalid tool", async () => {
    const system = new ToolSystem();
    await expect(system.executeTool("invalid", {})).rejects.toThrow(
      "Tool invalid not found",
    );
  });
});
