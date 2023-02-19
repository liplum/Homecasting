import * as fs from 'fs'
import * as path from 'path'
import { FileTree, File, FileType } from './file.js'
import * as chokidar from 'chokidar'
import minimatch, { MinimatchOptions } from 'minimatch'
interface HostTreeOptions {
  root: string
  fileTypePatterns: object | null
}
const minimatchOptions: MinimatchOptions = {
  nocase: true,
}
export class HostTree {
  /**
   * The absolute path of root directory.
   */
  readonly root: string
  readonly fileTypePatterns: object | null
  onRebuilt: (() => void) | null = null
  fileTree: FileTree
  constructor(
    options: HostTreeOptions
  ) {
    this.root = path.resolve(options.root)
    this.fileTypePatterns = options.fileTypePatterns
  }
  get isWatching() { return this.watchTimer != null }
  watchTimer: fs.FSWatcher | null = null

  startWatching() {
    if (this.watchTimer != null) return
    this.watchTimer = chokidar.watch(this.root, {
      ignoreInitial: true,
    }).on('all', (event, filePath) => this.onWatch(event, filePath))
  }

  onWatch(event: string, filePath: string) {
    console.log(`[${event}]${filePath}`)
    //const relative = path.relative(this.root, filePath)
    if (event == "add" || event == "unlink") {
      if (this.classifyByFilePath(filePath) == null) return
      this.rebuildFileTree()
    }
  }

  async rebuildFileTree() {
    const tree = await FileTree.createFileTreeAsync({
      root: this.root,
      classifier: (path) => this.classifyByFilePath(path),
      allowNullFileType: false,
      pruned: true,
    })
    this.fileTree = tree
    this.onRebuilt?.()
  }

  stopWatching() {
    if (this.watchTimer == null) return
    this.watchTimer.close()
  }

  resolveFile(path: string): File | null {
    return this.fileTree?.resolveFile(path)
  }

  classifyByFilePath(filePath: string): FileType {
    if (this.fileTypePatterns == null) return null
    for (const [pattern, type] of Object.entries(this.fileTypePatterns)) {
      if (minimatch(filePath, pattern, minimatchOptions)) {
        return type
      }
    }
    // if not matching any one
    return null
  }
}