import { ParticipantSpreadsheetError } from "../../model/errors.ts";
import type { PathLike } from "fs";
import { ResourceProvider } from "./provider.ts";
import type { WorkBook } from "xlsx";
import { readJsonFromSheet } from "../participant.ts";
import xlsx from "xlsx";

export class ColumnNotInSpreadsheetError extends ParticipantSpreadsheetError {
  constructor(message: string) {
    super(message);
    this.name = "ColumnNotInSpreadsheetError";
  }
}

export interface ImportMappings {
  [key: string]: string | number;
}

export class ExcelResourceProvider implements ResourceProvider<WorkBook> {
  _baseProvider: ResourceProvider<Buffer>;
  constructor (base: ResourceProvider<Buffer>) {
    this._baseProvider = base; 
  }

  public getResource(resourceName: string): Promise<WorkBook> {
    return this._baseProvider.getResource(resourceName).then((buffer) => {
      const workbook = xlsx.read(buffer);
      return workbook;
    });
  }

  public getWorkbook(resourceName: string): Promise<WorkBook> {
    return this.getResource(resourceName);
  }
}

export interface SheetData {
  headers: Record<string, unknown>;
  data: Record<string, unknown>[];
}

export const readXlsxWorkbookToJson = (workbook: WorkBook, sheetName: string = 'Sheet1'): Promise<SheetData> => {
  return readJsonFromSheet(workbook, sheetName);
};

export const readXlsxFileToJson = (filePath: PathLike): Promise<SheetData> => {
  let path = filePath.toString();
  let sheetName = undefined;
  if (filePath.toString().includes('')) {
    const workbookLocationParts = filePath.toString().split('!');
    sheetName = workbookLocationParts[workbookLocationParts.length - 1];
    path = workbookLocationParts[0];
  }
  const workbook = xlsx.readFile(path);
  return readJsonFromSheet(workbook, sheetName);
};

export const readXlsxBufferToJson = (buffer: Buffer, sheetName?: string): Promise<SheetData> => {
  const workbook = xlsx.read(buffer);
  return readJsonFromSheet(workbook, sheetName);
};

export const findColumnNameForSheetColumn = (headers: Record<string, string | undefined>, possibleNames: string[]): string | undefined => {
  const checkNames = [...possibleNames];

  // , ...possibleNames.map((name) => name.toLowerCase())];
  for (const name of checkNames) {
    const foundName = Object.keys(headers).find((header) => {
      const headerValue = headers[header];
      if (headerValue && headerValue.toString().replaceAll(' ', '').toLowerCase() === name.replaceAll(' ', '').toLowerCase()) {
        return true;
      }
    });
    if (foundName) {
      return foundName;
    }
  }

  const possibleNamesString = possibleNames.map((name) => `"${name}"`).join(', ');
  const errMsg = `Entrant sheet to import does not have a searched for header, looked for columns named ${possibleNamesString}`;
  throw new ColumnNotInSpreadsheetError(errMsg);
};

