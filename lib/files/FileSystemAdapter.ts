export type FilePickResult = {
  name: string;
  content: string;
  mimeType?: string;
};

export interface FileSystemAdapter {
  pickTextFile(accept?: string): Promise<FilePickResult | null>;
  /** true — файл сохранён; false — человек закрыл окно сохранения. */
  saveTextFile(filename: string, content: string, mimeType?: string): Promise<boolean>;
}
