import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Tool, MCPProvider } from "@gemini-code-cli/sdk";

export class MCPClientProvider implements MCPProvider {
  private client: Client;
  private transport: StdioClientTransport;

  constructor(command: string, args: string[]) {
    this.transport = new StdioClientTransport({
      command,
      args,
    });
    this.client = new Client(
      {
        name: "gemini-code-cli",
        version: "0.0.1",
      },
      {
        capabilities: {},
      },
    );
  }

  async connect(): Promise<void> {
    await this.client.connect(this.transport);
  }

  async getTools(): Promise<Tool[]> {
    const response = await this.client.listTools();
    return response.tools.map((mcpTool: any) => ({
      name: mcpTool.name,
      description: mcpTool.description || "",
      parameters: mcpTool.inputSchema,
      execute: async (args: any) => {
        const result = await this.client.callTool({
          name: mcpTool.name,
          arguments: args,
        });
        return result.content || result;
      },
    }));
  }
}
