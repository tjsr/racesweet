import process from "process";
import { vi } from "vitest";

// const pathValue = new URL(".", import.meta.url).pathname;
const pathValue = new URL(".", __filename).pathname;
vi.spyOn(process, "cwd").mockReturnValue(pathValue);
