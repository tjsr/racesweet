import process from "process";
import { vi } from "vitest";

const pathValue =new URL(".", import.meta.url).pathname;
vi.spyOn(process, "cwd").mockReturnValue(pathValue);
