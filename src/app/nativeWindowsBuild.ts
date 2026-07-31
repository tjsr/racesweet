import path from "node:path";

export type NativeWindowsArchitecture = "arm64" | "x64";

interface NativeWindowsTarget {
  architecture: NativeWindowsArchitecture;
  peMachine: number;
}

const nativeWindowsTargets: Readonly<
  Record<NativeWindowsArchitecture, NativeWindowsTarget>
> = {
  arm64: {
    architecture: "arm64",
    peMachine: 0xaa64,
  },
  x64: {
    architecture: "x64",
    peMachine: 0x8664,
  },
};

export const getNativeWindowsArchitectures = (
  requestedArchitecture: string | undefined,
): NativeWindowsArchitecture[] => {
  if (requestedArchitecture === undefined) {
    return ["x64", "arm64"];
  }

  if (requestedArchitecture !== "arm64" && requestedArchitecture !== "x64") {
    throw new Error(
      `Unsupported Windows architecture "${requestedArchitecture}". Use x64 or arm64.`,
    );
  }

  return [requestedArchitecture];
};

export const getForgeMakeArguments = (
  architecture: NativeWindowsArchitecture,
): string[] => {
  return ["make", "--platform=win32", `--arch=${architecture}`];
};

export const getPackagedWindowsExecutablePath = (
  workspaceRoot: string,
  architecture: NativeWindowsArchitecture,
): string => {
  return path.join(
    workspaceRoot,
    "out",
    `racesweet-win32-${architecture}`,
    "racesweet.exe",
  );
};

export const verifyWindowsExecutableArchitecture = (
  executable: Buffer,
  architecture: NativeWindowsArchitecture,
  executablePath: string,
): void => {
  const target: NativeWindowsTarget = nativeWindowsTargets[architecture];
  if (
    executable.length < 0x40 ||
    executable.subarray(0, 2).toString("ascii") !== "MZ"
  ) {
    throw new Error(`${executablePath} is not a Windows executable.`);
  }

  const peHeaderOffset: number = executable.readUInt32LE(0x3c);
  if (
    peHeaderOffset + 6 > executable.length ||
    executable
      .subarray(peHeaderOffset, peHeaderOffset + 4)
      .toString("ascii") !== "PE\0\0"
  ) {
    throw new Error(`${executablePath} does not contain a valid PE header.`);
  }

  const peMachine: number = executable.readUInt16LE(peHeaderOffset + 4);
  if (peMachine !== target.peMachine) {
    throw new Error(
      `${executablePath} was built for PE machine 0x${peMachine.toString(16)}, ` +
        `expected ${target.architecture} (0x${target.peMachine.toString(16)}).`,
    );
  }
};
