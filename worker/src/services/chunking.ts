export interface ChunkConfig {
  chunkSize: number;
  chunkOverlap: number;
  separator: string;
}

const DEFAULT_CONFIG: ChunkConfig = {
  chunkSize: 1000,
  chunkOverlap: 200,
  separator: '\n\n',
};

export function chunkText(text: string, config: Partial<ChunkConfig> = {}): string[] {
  const { chunkSize, chunkOverlap, separator } = { ...DEFAULT_CONFIG, ...config };
  const chunks: string[] = [];

  // First split by the primary separator, then by characters
  const sections = text.split(separator).filter(s => s.trim());

  let currentChunk = '';
  for (const section of sections) {
    if (currentChunk.length + section.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      // Overlap: keep the last `chunkOverlap` chars
      const overlap = currentChunk.slice(-chunkOverlap);
      currentChunk = overlap + separator + section;
    } else {
      currentChunk += (currentChunk ? separator : '') + section;
    }

    // If a single section is too big, split by characters
    while (currentChunk.length > chunkSize * 1.5) {
      const splitPoint = currentChunk.lastIndexOf(' ', chunkSize);
      const cutAt = splitPoint > chunkSize / 2 ? splitPoint : chunkSize;
      chunks.push(currentChunk.slice(0, cutAt).trim());
      currentChunk = currentChunk.slice(Math.max(0, cutAt - chunkOverlap));
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.length > 0 ? chunks : [text.slice(0, chunkSize)];
}
