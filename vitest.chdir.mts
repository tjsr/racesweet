import process from "process";
import { vi } from "vitest";

const pathValue =new URL(".", import.meta.url).pathname;
console.log(pathValue);
vi.spyOn(process, "cwd").mockReturnValue(pathValue);
