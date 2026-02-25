import { Tool } from "@gemini-code-cli/sdk";
import fs from "fs/promises";

export const readFileTool: Tool = {
  name: "read_file",
  description: "Reads a file from the local file system.",
  parameters: {
    type: "OBJECT",
    properties: {
      path: {
        type: "STRING",
        description: "The absolute or relative path to the file to read.",
      },
    },
    required: ["path"],
  },
  execute: async (args: any) => {
    try {
      const content = await fs.readFile(args.path, "utf8");
      return { content };
    } catch (e: any) {
      return { error: e.message };
    }
  },
};
