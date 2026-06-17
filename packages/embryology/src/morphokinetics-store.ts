import type { EmbryoId, MorphokineticAnnotation } from "./types.js";

export interface MorphokineticAnnotationStore {
  save(a: MorphokineticAnnotation): Promise<void>;
  /** A embryo's annotations, newest first. */
  forEmbryo(embryoId: EmbryoId): Promise<readonly MorphokineticAnnotation[]>;
}

export class InMemoryMorphokineticAnnotationStore implements MorphokineticAnnotationStore {
  private readonly annotations: MorphokineticAnnotation[] = [];

  async save(a: MorphokineticAnnotation): Promise<void> {
    this.annotations.push(a);
  }
  async forEmbryo(embryoId: EmbryoId): Promise<readonly MorphokineticAnnotation[]> {
    return this.annotations.filter((a) => a.embryoId === embryoId).sort((a, b) => b.annotatedAt.localeCompare(a.annotatedAt));
  }
}
