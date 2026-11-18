import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from "node:path";

import {
  type NativeWindowsArchitecture,
  getForgeMakeArguments,
  getNativeWindowsArchitectures,
  getPackagedWindowsExecutablePath,
  prepareWindowsInstallerTools,
  verifyWindowsExecutableArchitecture,
} from "./nativeWindowsBuild.js";

const createWindowsExecutable = (machine: number): Buffer => {
  const executable: Buffer = Buffer.alloc(128);
  executable.write("MZ", 0, "ascii");
  executable.writeUInt32LE(64, 0x3c);
  executable.write("PE\0\0", 64, "ascii");
  executable.writeUInt16LE(machine, 68);
  return executable;
};

describe("nativeWindowsBuild", () => {
  it.each<NativeWindowsArchitecture>(['x64', 'arm64'])('prepares installer tools for the %s host', async (architecture: NativeWindowsArchitecture): Promise<void> => {
    const directory: string = await mkdtemp(path.join(os.tmpdir(), 'racesweet-installer-tools-'));
    try {
      await mkdir(path.join(directory, 'vendor'));
      await Promise.all(['exe', 'dll'].map((extension: string): Promise<void> => writeFile(path.join(directory, 'vendor', `7z-${architecture}.${extension}`), `${architecture}-${extension}`)));
      await prepareWindowsInstallerTools(directory, architecture);
      expect(await readFile(path.join(directory, 'vendor', '7z.exe'), 'utf8')).toBe(`${architecture}-exe`);
      expect(await readFile(path.join(directory, 'vendor', '7z.dll'), 'utf8')).toBe(`${architecture}-dll`);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects unsupported installer host architectures', async (): Promise<void> => {
    await expect(prepareWindowsInstallerTools('unused', 'ia32')).rejects.toThrow('Unsupported installer host');
  });
  it("builds both Windows architectures by default", () => {
    expect(getNativeWindowsArchitectures(undefined)).toEqual(["x64", "arm64"]);
  });

  it.each<NativeWindowsArchitecture>(["x64", "arm64"])(
    "builds only the requested %s architecture",
    (architecture: NativeWindowsArchitecture) => {
      expect(getNativeWindowsArchitectures(architecture)).toEqual([
        architecture,
      ]);
      expect(getForgeMakeArguments(architecture)).toEqual([
        "make",
        "--platform=win32",
        `--arch=${architecture}`,
      ]);
      expect(
        getPackagedWindowsExecutablePath("C:\\workspace", architecture),
      ).toBe(
        path.join(
          "C:\\workspace",
          "out",
          `racesweet-win32-${architecture}`,
          "racesweet.exe",
        ),
      );
    },
  );

  it("rejects unsupported architectures", () => {
    expect(() => getNativeWindowsArchitectures("ia32")).toThrow(
      'Unsupported Windows architecture "ia32". Use x64 or arm64.',
    );
  });

  it.each([
    ["x64", 0x8664],
    ["arm64", 0xaa64],
  ] as const)(
    "accepts a valid %s PE executable",
    (architecture: NativeWindowsArchitecture, machine: number) => {
      expect(() =>
        verifyWindowsExecutableArchitecture(
          createWindowsExecutable(machine),
          architecture,
          `racesweet-${architecture}.exe`,
        ),
      ).not.toThrow();
    },
  );

  it("rejects invalid and incorrectly targeted executables", () => {
    expect(() =>
      verifyWindowsExecutableArchitecture(
        Buffer.from("not an executable"),
        "x64",
        "racesweet.exe",
      ),
    ).toThrow("racesweet.exe is not a Windows executable.");
    expect(() =>
      verifyWindowsExecutableArchitecture(
        createWindowsExecutable(0xaa64),
        "x64",
        "racesweet.exe",
      ),
    ).toThrow("expected x64 (0x8664)");
  });
});
