import Papa from "papaparse";

export type ParsedCsv = {
  fields: string[];
  rows: Array<Record<string, unknown>>;
  errors: string[];
};

export class CsvImportMapper {
  parse(content: string): ParsedCsv {
    const result = Papa.parse<Record<string, unknown>>(content, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim()
    });

    return {
      fields: result.meta.fields ?? [],
      rows: result.data,
      errors: result.errors.map((error) => `${error.row ?? "-"}: ${error.message}`)
    };
  }
}
