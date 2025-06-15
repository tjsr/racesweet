import type { EventCategory } from "@model/eventcategory";
import type { PathLike } from "fs";
import fs from "fs/promises";

export const loadCategoriesFromJsonFile = async (
  path: PathLike
): Promise<EventCategory[]> => fs.readFile(path, 'utf8')
  .then(cats => JSON.parse(cats) as EventCategory[]);
