import { type ChildProcess, spawn } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  type NativeWindowsArchitecture,
  getForgeMakeArguments,
  getNativeWindowsArchitectures,
  getPackagedWindowsExecutablePath,
  verifyWindowsExecutableArchitecture,
} from "../src/app/nativeWindowsBuild.js";

const require = createRequire(import.meta.url);
const forgeCliPath: string =
  require.resolve("@electron-forge/cli/dist/electron-forge.js");
const workspaceRoot: string = process.cwd();
const architectures: NativeWindowsArchitecture[] =
  getNativeWindowsArchitectures(process.argv[2]);
const excludedWorkspaceEntries: ReadonlySet<string> = new Set([
  ".git",
  ".webpack",
  "node_modules",
  "out",
]);

const executeForge = (
  architecture: NativeWindowsArchitecture,
  buildWorkspace: string,
): Promise<void> => {
  return new Promise<void>((resolve, reject): void => {
    const child: ChildProcess = spawn(
      process.execPath,
      [forgeCliPath, ...getForgeMakeArguments(architecture)],
      {
        cwd: buildWorkspace,
        stdio: "inherit",
        windowsHide: true,
      },
    );
    child.once("error", reject);
    child.once(
      "exit",
      (code: number | null, signal: NodeJS.Signals | null): void => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(
          new Error(
            signal === null
              ? `Electron Forge exited with code ${code ?? "unknown"} for Windows ${architecture}.`
              : `Electron Forge was terminated by ${signal} for Windows ${architecture}.`,
          ),
        );
      },
    );
  });
};

const pathExists = (filePath: string): Promise<boolean> => {
  return stat(filePath).then(
    (): boolean => true,
    (): boolean => false,
  );
};

const copyWorkspace = (buildWorkspace: string): Promise<void> => {
  return cp(workspaceRoot, buildWorkspace, {
    filter: (sourcePath: string): boolean => {
      const relativePath: string = path.relative(workspaceRoot, sourcePath);
      if (relativePath === "") {
        return true;
      }

      const firstEntry: string | undefined = relativePath.split(path.sep)[0];
      return (
        firstEntry === undefined || !excludedWorkspaceEntries.has(firstEntry)
      );
    },
    recursive: true,
  }).then(() =>
    symlink(
      path.join(workspaceRoot, "node_modules"),
      path.join(buildWorkspace, "node_modules"),
      "junction",
    ),
  );
};

const publishDirectory = (
  sourcePath: string,
  destinationPath: string,
): Promise<void> => {
  return pathExists(sourcePath).then((exists: boolean): Promise<void> => {
    if (!exists) {
      return Promise.resolve();
    }

    return rm(destinationPath, { force: true, recursive: true })
      .then(() => mkdir(path.dirname(destinationPath), { recursive: true }))
      .then(() => cp(sourcePath, destinationPath, { recursive: true }));
  });
};

const publishArchitecture = (
  architecture: NativeWindowsArchitecture,
  buildWorkspace: string,
): Promise<string> => {
  const packagedDirectoryName: string = `racesweet-win32-${architecture}`;
  const packagedSourcePath: string = path.join(
    buildWorkspace,
    "out",
    packagedDirectoryName,
  );
  const packagedDestinationPath: string = path.join(
    workspaceRoot,
    "out",
    packagedDirectoryName,
  );
  const makerSourcePath: string = path.join(
    buildWorkspace,
    "out",
    "make",
    "squirrel.windows",
    architecture,
  );
  const makerDestinationPath: string = path.join(
    workspaceRoot,
    "out",
    "make",
    "squirrel.windows",
    architecture,
  );

  return Promise.all([
    publishDirectory(packagedSourcePath, packagedDestinationPath),
    publishDirectory(makerSourcePath, makerDestinationPath),
  ]).then((): string =>
    getPackagedWindowsExecutablePath(workspaceRoot, architecture),
  );
};

const buildArchitecture = (
  architecture: NativeWindowsArchitecture,
  buildWorkspace: string,
): Promise<void> => {
  const stagedExecutablePath: string = getPackagedWindowsExecutablePath(
    buildWorkspace,
    architecture,
  );
  return executeForge(architecture, buildWorkspace)
    .then(() => readFile(stagedExecutablePath))
    .then((executable: Buffer): void => {
      verifyWindowsExecutableArchitecture(
        executable,
        architecture,
        stagedExecutablePath,
      );
    })
    .then(() => publishArchitecture(architecture, buildWorkspace))
    .then((executablePath: string): Promise<void> => {
      return readFile(executablePath)
        .then((executable: Buffer): void => {
          verifyWindowsExecutableArchitecture(
            executable,
            architecture,
            executablePath,
          );
        })
        .then((): void => {
          console.log(
            `Verified Windows ${architecture} application: ` +
              path.relative(workspaceRoot, executablePath),
          );
        });
    });
};

let buildWorkspace: string | undefined;

mkdtemp(path.join(tmpdir(), "racesweet-native-"))
  .then((createdWorkspace: string): Promise<void> => {
    buildWorkspace = createdWorkspace;
    return copyWorkspace(createdWorkspace);
  })
  .then((): Promise<void> =>
    architectures.reduce<Promise<void>>(
      (
        build: Promise<void>,
        architecture: NativeWindowsArchitecture,
      ): Promise<void> => {
        return build.then(() =>
          buildArchitecture(architecture, buildWorkspace!),
        );
      },
      Promise.resolve(),
    ),
  )
  .catch((error: Error): void => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  })
  .finally((): Promise<void> => {
    return buildWorkspace === undefined
      ? Promise.resolve()
      : rm(buildWorkspace, { force: true, recursive: true });
  });
