import { Bool } from 'snarkyjs';
export class MerkleTree<T> {
  size: number;
  data: Array<T>;
  refreshNeeded: boolean;

  constructor(size: number) {
    this.size = size;
    this.refreshNeeded = true;
    this.data = Array<T>(size);
  }

  addLeaf<T>(leaf: T): T {
    return leaf;
  }

  leafExists<T>(leaf: T): Bool {
    // search all leaves
    return Bool(false);
  }
  getRoot(): T {
    this.rebuildTree();
    return this.data[0];
  }

  rebuildTree() {
    if (this.refreshNeeded) {
      // re calculate tree starting at leaves
    }
    this.refreshNeeded = false;
  }
  serialiseTree(): string {
    return JSON.stringify(this.data);
  }
}
