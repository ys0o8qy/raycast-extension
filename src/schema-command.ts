import { spawn } from "node:child_process";
import { LibraryEntry } from "./types";

export interface SchemaCommandConfig {
  command: string;
  args: string[];
}

export function getSchemaCommandConfig(
  entry: LibraryEntry,
): SchemaCommandConfig | undefined {
  const command = entry.properties.SCHEMA_COMMAND?.trim();
  if (!command) {
    return undefined;
  }

  return {
    command,
    args: splitSchemaCommandArgs(entry.properties.SCHEMA_ARGS || ""),
  };
}

export function splitSchemaCommandArgs(value: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  let escaping = false;

  for (const char of value.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    args.push(current);
  }

  return args;
}

export async function runSchemaCommand(entry: LibraryEntry): Promise<void> {
  const config = getSchemaCommandConfig(entry);
  if (!config) {
    throw new Error("Schema command is not configured");
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(config.command, config.args, {
      env: {
        ...process.env,
        ORG_LIBRARY_ENTRY_ID: entry.id,
        ORG_LIBRARY_ENTRY_TITLE: entry.title,
        ORG_LIBRARY_ENTRY_TYPE: entry.type,
        ORG_LIBRARY_ENTRY_TAGS: entry.tags.join(","),
      },
      stdio: ["pipe", "ignore", "pipe"],
    });

    let stderr = "";

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `Command exited with code ${code}`));
    });

    child.stdin.end(entry.body);
  });
}
