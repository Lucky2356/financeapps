export type FilePickResult = {
  name: string;
  content: string;
  mimeType?: string;
};

export interface FileSystemAdapter {
  pickTextFile(accept?: string): Promise<FilePickResult | null>;
  saveTextFile(filename: string, content: string, mimeType?: string): Promise<void>;
}
