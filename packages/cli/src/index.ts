import { BridgeClient } from "./client";
import { resolveBridge } from "./discovery";
import { fail } from "./output";
import { cmdActiveEditor, cmdSelection } from "./commands/readonly";
import { cmdDiff } from "./commands/diff";
import { cmdDiagnostics } from "./commands/diagnostics";
import { cmdPermission } from "./commands/permission";
import { cmdReadFile, cmdApplyEdit, cmdSave } from "./commands/workspace";
import { cmdTerminalCreate, cmdTerminalSend } from "./commands/terminal";
import { cmdSessions } from "./commands/sessions";

interface ParsedArgs {
  command: string;
  json: boolean;
  workspace?: string;
  title?: string;
  all: boolean;
  wholeFile?: string;
  reuse: boolean;
  terminalId?: number;
  noNewLine: boolean;
  positional: string[];
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  let command = "";
  let json = false;
  let workspace: string | undefined;
  let title: string | undefined;
  let all = false;
  let wholeFile: string | undefined;
  let reuse = false;
  let terminalId: number | undefined;
  let noNewLine = false;
  let help = false;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-h" || a === "--help") {
      help = true;
    } else if (a === "--all") {
      all = true;
    } else if (a === "--reuse") {
      reuse = true;
    } else if (a === "--no-newline") {
      noNewLine = true;
    } else if (a === "--title") {
      title = args[++i];
    } else if (a.startsWith("--title=")) {
      title = a.slice("--title=".length);
    } else if (a === "--whole-file") {
      wholeFile = args[++i];
    } else if (a.startsWith("--whole-file=")) {
      wholeFile = a.slice("--whole-file=".length);
    } else if (a === "--id") {
      terminalId = Number(args[++i]);
    } else if (a.startsWith("-")) {
      // unknown flag; ignore
    } else if (!command) {
      command = a;
    } else {
      positional.push(a);
    }
  }

  return { command, json, workspace, title, all, wholeFile, reuse, terminalId, noNewLine, positional, help };
}

const HELP = `vchb — vscode-cli-harness-bridge CLI

Usage:
  vchb active-editor [--json]
  vchb selection [--json]
  vchb diagnostics [path] [--all] [--json]
  vchb diff <original-path> <proposed-path> [--title <title>]
  vchb sessions [--json]

Options:
  --json              Emit compact JSON to stdout (default for data commands)
  --workspace <path>  Target a specific VS Code window by workspace root
  -h, --help          Show this help

Environment:
  VCHB_BRIDGE_URL     Explicit bridge URL (skips discovery)
  VCHB_BRIDGE_TOKEN   Explicit bridge token
  VCHB_WORKSPACE      Target workspace root
  VCHB_PATH_MAP       containerRoot=hostRoot path mapping override
  VCHB_DEBUG=1        Debug logging to stderr
  VCHB_TIMEOUT_MS     Request timeout in ms
`;

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);

  if (opts.help || !opts.command) {
    process.stdout.write(HELP);
    process.exit(opts.help ? 0 : 1);
  }

  const debug = !!process.env.VCHB_DEBUG;
  const timeoutMs = process.env.VCHB_TIMEOUT_MS ? Number(process.env.VCHB_TIMEOUT_MS) : undefined;

  try {
    if (opts.command === "sessions") {
      await cmdSessions({ json: opts.json });
      return;
    }

    const resolved = await resolveBridge(process.env, {
      workspace: opts.workspace,
      bridgeUrl: process.env.VCHB_BRIDGE_URL,
      token: process.env.VCHB_BRIDGE_TOKEN,
    });
    const client = new BridgeClient({
      url: resolved.url,
      token: resolved.token,
      timeoutMs,
      debug,
    });

    switch (opts.command) {
      case "active-editor":
      case "activeEditor":
        await cmdActiveEditor(client);
        break;
      case "selection":
        await cmdSelection(client);
        break;
      case "diff":
        if (opts.positional.length < 2) {
          process.stderr.write("vchb: diff requires <original-path> <proposed-path>\n");
          process.exit(1);
        }
        await cmdDiff(client, {
          originalPath: opts.positional[0],
          proposedPath: opts.positional[1],
          title: opts.title,
        });
        break;
      case "diagnostics":
        await cmdDiagnostics(client, {
          path: opts.positional[0],
          workspace: opts.all,
        });
        break;
      case "permission":
        if (opts.positional.length < 1) {
          process.stderr.write("vchb: permission requires <method> [description]\n");
          process.exit(1);
        }
        await cmdPermission(client, {
          method: opts.positional[0],
          description: opts.positional[1],
        });
        break;
      case "read-file":
        if (opts.positional.length < 1) {
          process.stderr.write("vchb: read-file requires <path>\n");
          process.exit(1);
        }
        await cmdReadFile(client, { path: opts.positional[0] });
        break;
      case "apply-edit":
        if (opts.positional.length < 1) {
          process.stderr.write("vchb: apply-edit requires <path> [--whole-file <content>] [<edit-json>]\n");
          process.exit(1);
        }
        await cmdApplyEdit(client, {
          path: opts.positional[0],
          editJson: opts.positional[1],
          wholeFile: opts.wholeFile,
        });
        break;
      case "save":
        if (opts.positional.length < 1) {
          process.stderr.write("vchb: save requires <path>\n");
          process.exit(1);
        }
        await cmdSave(client, { path: opts.positional[0] });
        break;
      case "terminal":
        if (opts.positional.length < 1) {
          process.stderr.write("vchb: terminal requires <create|send> ...\n");
          process.exit(1);
        }
        if (opts.positional[0] === "create") {
          await cmdTerminalCreate(client, { name: opts.positional[1], reuse: opts.reuse });
        } else if (opts.positional[0] === "send") {
          if (opts.positional.length < 2) {
            process.stderr.write("vchb: terminal send requires <text>\n");
            process.exit(1);
          }
          await cmdTerminalSend(client, {
            text: opts.positional[1],
            terminalId: opts.terminalId,
            addNewLine: !opts.noNewLine,
          });
        } else {
          process.stderr.write(`vchb: unknown terminal subcommand "${opts.positional[0]}"\n`);
          process.exit(1);
        }
        break;
      default:
        process.stderr.write(`vchb: unknown command "${opts.command}"\n`);
        process.stderr.write(HELP);
        process.exit(1);
    }
  } catch (err) {
    fail(err);
  }
}

main().catch((err) => fail(err));
