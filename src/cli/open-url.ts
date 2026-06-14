import { spawn } from "node:child_process";
import { platform } from "node:os";

export function openUrl(url: string): void {
  const command = opener();
  if (command == null) return;
  const child = spawn(command.command, [...command.args, url], {
    detached: true,
    stdio: "ignore",
  });
  child.on("error", () => {});
  child.unref();
}

function opener(): { command: string; args: string[] } | null {
  const current = platform();
  if (current === "darwin") return { command: "open", args: [] };
  if (current === "win32") return { command: "cmd", args: ["/c", "start", ""] };
  if (current === "linux") return { command: "xdg-open", args: [] };
  return null;
}
