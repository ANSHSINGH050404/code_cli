export interface Tool {
  name: string;
  description: string;
  parameters: any; // JSON Schema for parameters
  execute: (args: any) => Promise<any>;
}

export interface Extension {
  name: string;
  tools: Tool[];
}

export interface MCPProvider {
  connect(): Promise<void>;
  getTools(): Promise<Tool[]>;
}
