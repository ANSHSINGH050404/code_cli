# Building the Gemini-Style AI CLI Agent: Step-by-Step

This document outlines the step-by-step process used to architect and build the Gemini AI CLI Agent. The project is structured as a TypeScript monorepo to ensure high modularity, separation of concerns, and ease of testing.

## 1. Defining the Monorepo Structure

The first decision was to use a structural pattern that separates the UI from the business logic and the type definitions. We created the `packages/` folder to host three distinct sub-projects managed via `npm workspaces`.

### The Order of Creation & Why:

1. **`packages/sdk` (Software Development Kit)**
   - **Why first:** This package contains the fundamental TypeScript interfaces (like `Tool` and `MCPProvider`). It has zero dependencies on other internal packages. By defining the contracts here first, both the core logic and the UI can rely on a shared understanding of what a "Tool" is without circular dependencies.
2. **`packages/core` (The Brains)**
   - **Why second:** The core contains the orchestrator. It implements the definitions from the `sdk`. This is where the `GeminiChat` class (wrapping `@google/genai`) and the `ToolSystem` (for registering and executing tools) live. It's built independently of any visual representation, making it inherently testable and reusable (e.g., you could theoretically attach a web frontend instead of a CLI to this core).

3. **`packages/cli` (The Presentation Layer)**
   - **Why third:** The CLI is the outermost layer. It depends on both the `sdk` and the `core`. It uses `React` and `Ink` to render the terminal interface. It consumes the `GeminiChat` instance from the `core` package and wires it up to physical standard input/output streams and keyboard events.

## 2. Setting Up the Root Configuration

After deciding on the folders, the root configuration files were established:

- **`package.json`**: Configured the `"workspaces": ["packages/*"]` array. Added shared development dependencies like `esbuild` for hyper-fast bundling, `typescript` for type checking, and `vitest` for testing.
- **`tsconfig.json`**: Configured TypeScript paths (`paths: { "@gemini-code-cli/*": ... }`) so that the packages could seamlessly import each other during development without needing to be published to npm. Also, enabled `jsx: "react"` for the Ink component rendering.

## 3. Implementing the Packages (Inner to Outer)

### Step 3.1: The SDK

- Created `types.ts` defining exactly what a `Tool` is (name, description, JSON schema for parameters, and an execute function).

### Step 3.2: The Core

- **Tool System:** Built the `ToolSystem.ts` responsible for storing a registry of tools.
- **Built-in Tools:** Created functional tools like `readFile` and `executeCommand`.
- **Gemini Integration (`GeminiChat.ts`):** This was the most complex part. It required:
  - Managing conversation history.
  - Passing the tools from the `ToolSystem` into the Gemini API format (`functionDeclarations`).
  - Handling the streaming response `generateContentStream`.
  - Intercepting `functionCalls` requested by the model, pausing the loop, asking the CLI layer for permission, executing the tool, and sending the result back to the model.

### Step 3.3: The CLI

- Built `App.tsx` using `ink` and `ink-text-input`.
- Managed React state for `messages`, `input`, and a special `toolRequest` state.
- **Safety Confirmation:** Implemented the UI logic that catches the `onToolCall` callback from the core. When a tool is requested by the AI, the UI transitions to a confirmation state, asking the user to explicitly type `y` or `n` before the promise resolves and allows the core to execute the command.

## 4. Build System & Optimization

Instead of using the standard TypeScript compiler (`tsc`) which can be slow, `esbuild` was injected into the build pipelines of every package.

- Each package has a `build` script (e.g., `esbuild src/index.tsx --bundle --platform=node --format=esm --packages=external --outfile=dist/index.js`).
- This ensures that as the project grows, compilation into executable Node.js scripts remains virtually instantaneous.

## 5. Summary

By building from the "inside out" (SDK -> Core -> CLI), we ensured that the logic is strictly separated from the presentation. If we later decide to swap out `Ink` for a different GUI framework, or Gemini for another LLM provider, the highly decoupled nature of the monorepo makes those changes localized and much cleaner.
