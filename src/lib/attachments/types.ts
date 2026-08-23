export interface PreparedAttachment {
  readonly kind: 'pdf' | 'image' | 'text' | 'binary-skipped';
  readonly originalPath: string;
  readonly text?: string;
  readonly imagePath?: string;
  readonly truncated?: boolean;
  readonly size?: number;
}

export interface MarkItDownResult {
  readonly markdown: string;
  readonly truncated: boolean;
}
