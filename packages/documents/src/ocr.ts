// OCR seam. Extraction is an external/in-region service; the store holds the
// indexed text. Like the KeyProvider/OIDC seams, the provider is swappable and
// residency-reviewed before a real one is wired (docs/03 §4).

export interface OcrProvider {
  /** Extract searchable text from a stored blob. */
  extract(blobRef: string, contentType: string): Promise<string>;
}

/** Default no-op provider: documents are stored and versioned, but not indexed
 *  until a real OCR provider is wired. Keeps uploads working from day one. */
export class NoopOcrProvider implements OcrProvider {
  async extract(): Promise<string> {
    return "";
  }
}
