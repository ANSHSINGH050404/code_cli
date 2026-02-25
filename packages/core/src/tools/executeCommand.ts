import { Tool } from "@gemini-code-cli/sdk";
import { exec } from "child_process";
import util from "util";

const execAsync = util.promisify(exec);

export const executeCommandTool: Tool = {
  name: "execute_command",
  description: "Executes a shell command on the user's system.",
  parameters: {
    type: "OBJECT",
    properties: {
      command: {
        type: "STRING",
        description: "The shell command to execute.",
      },
    },
    required: ["command"],
  },
  execute: async (args: any) => {
    try {
      const { stdout, stderr } = await execAsync(args.command);
      return { stdout, stderr };
    } catch (e: any) {
      return { error: e.message, stdout: e.stdout, stderr: e.stderr };
    }
  },
};
