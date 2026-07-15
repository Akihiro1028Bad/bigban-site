import path from "node:path";

interface SmokeProcessResult {
  exitCode: number;
  kind: string;
  stdout: string;
}

interface SmokeState {
  runCount: number;
  lastRunAt: string;
  npmVersion: string;
}

export interface DaemonSmokePorts {
  runProcess: (command: string, args: string[]) => Promise<SmokeProcessResult>;
  readText: (filePath: string) => Promise<string>;
  makeDirectory: (directoryPath: string) => Promise<void>;
  writeText: (filePath: string, value: string) => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
  now: () => Date;
}

export interface DaemonSmokeResult {
  isSuccess: boolean;
  hadPreviousState: boolean;
  npmVersion: string;
}

export function resolveNpmCommand(platform: NodeJS.Platform): "npm" | "npm.cmd" {
  return platform === "win32" ? "npm.cmd" : "npm";
}

async function readState(filePath: string, ports: DaemonSmokePorts): Promise<SmokeState | null> {
  try {
    return JSON.parse(await ports.readText(filePath)) as SmokeState;
  } catch {
    return null;
  }
}

/** 通常ジョブを起動せず、Windowsで必要なprocess/state配線だけを検証する。 */
export async function runDaemonSmoke(
  statePath: string,
  platform: NodeJS.Platform,
  ports: DaemonSmokePorts,
): Promise<DaemonSmokeResult> {
  const previous = await readState(statePath, ports);
  const processResult = await ports.runProcess(resolveNpmCommand(platform), ["--version"]);
  const npmVersion = processResult.stdout.trim();
  if (processResult.exitCode !== 0 || processResult.kind === "spawn-error") {
    return { isSuccess: false, hadPreviousState: previous !== null, npmVersion };
  }

  const state: SmokeState = {
    runCount: (previous?.runCount ?? 0) + 1,
    lastRunAt: ports.now().toISOString(),
    npmVersion,
  };
  const temporaryPath = `${statePath}.tmp`;
  await ports.makeDirectory(path.dirname(statePath));
  await ports.writeText(temporaryPath, `${JSON.stringify(state)}\n`);
  await ports.rename(temporaryPath, statePath);
  await ports.readText(statePath);
  return { isSuccess: true, hadPreviousState: previous !== null, npmVersion };
}
