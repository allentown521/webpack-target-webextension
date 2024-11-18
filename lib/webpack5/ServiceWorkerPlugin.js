// @ts-check
const createEagerlyLoadChunksRuntimeModule = require('./RuntimeModules/EagerlyLoadChunks')
module.exports = class ServiceWorkerEntryPlugin {
  /**
   * @param {import('../../index.d.ts').BackgroundOptions} options
   * @param {string} entry
   * @param {boolean} rspackWarningIgnored
   */
  constructor(options, entry, rspackWarningIgnored) {
    this.options = options
    this.entry = entry
    this.rspackWarningIgnored = rspackWarningIgnored
  }
  /** @param {import('webpack').Compiler} compiler */
  apply(compiler) {
    const hook = compiler.hooks.entryOption
    // Set chunkLoading to import-scripts
    // @ts-ignore DO NOT add return boolean to this function, this is a BailHook and we don't want to bail.
    hook.tap(ServiceWorkerEntryPlugin.name, (context, entries) => {
      if (typeof entries === 'function') {
        if (this.options.noWarningDynamicEntry) return
        console.warn(`[webpack-extension-target] Dynamic entry points not supported yet.
You must manually set the chuck loading of entry point ${this.entry} to "import-scripts".

See https://webpack.js.org/configuration/entry-context/#entry-descriptor

Set background.noWarningDynamicEntry to true to disable this warning.
`)
      }
      const selectedEntry = entries[this.entry]
      if (!selectedEntry) throw new Error(`[webpack-extension-target] There is no entry called ${this.entry}.`)
      selectedEntry.chunkLoading = 'import-scripts'
    })

    // Set all lazy chunks to eagerly loaded
    // See https://bugs.chromium.org/p/chromium/issues/detail?id=1198822
    const is_rspack = 'rspack' in compiler
    if (this.options.eagerChunkLoading !== false) {
      if (is_rspack) {
        compiler.hooks.initialize.tap(ServiceWorkerEntryPlugin.name, () => {
          const options = compiler.options.module.parser.javascript
          if (!options) throw new Error('[webpack-extension-target] requires config.module.parser.javascript be set.')
          if (options.dynamicImportMode !== 'eager' || !this.rspackWarningIgnored) {
            console.warn(
              `[webpack-extension-target] Dynamic import mode changed to "eager" (originally ${JSON.stringify(
                options.dynamicImportMode
              )}). Set module.parser.javascript.dynamicImportMode to "eager", or noRspackDynamicImportModeWarning to true (in the plugin config of webpack-extension-target) to suppress this warning.`
            )
          }
          options.dynamicImportMode = 'eager'
        })
      } else {
        compiler.hooks.run.tap(ServiceWorkerEntryPlugin.name, (compiler) => {
          compiler.hooks.compilation.tap(ServiceWorkerEntryPlugin.name, (compilation) => {
            compilation.hooks.afterOptimizeChunkIds.tap(ServiceWorkerEntryPlugin.name, () => {
              const entryPoint = compilation.entrypoints.get(this.entry)
              if (!entryPoint) return
              const entryChunk = entryPoint.getEntrypointChunk()

              const children = entryPoint.getChildren()
              /** @typedef {typeof children[0]} ChunkGroup */
              /** @type {Set<ChunkGroup>} */
              const visitedChunkGroups = new Set()
              /** @type {Set<import('webpack').Chunk>} */
              const reachableChunks = new Set(entryPoint.chunks)
              collectAllChildren(entryPoint)
              const reachableChunkIds = new Set([...reachableChunks].map((x) => x.id))
              for (const id of getInitialChunkIds(entryChunk, compilation.chunkGraph, chunkHasJs)) {
                reachableChunkIds.delete(id)
              }

              if (reachableChunkIds.size) {
                const EagerlyLoadChunksRuntimeModule = createEagerlyLoadChunksRuntimeModule(compiler.webpack)
                compilation.hooks.additionalTreeRuntimeRequirements.tap(
                  EagerlyLoadChunksRuntimeModule.name,
                  (chunk, set) => {
                    if (chunk.id !== entryChunk.id) return
                    set.add(compiler.webpack.RuntimeGlobals.ensureChunkHandlers)
                    compilation.addRuntimeModule(entryChunk, new EagerlyLoadChunksRuntimeModule([...reachableChunkIds]))
                  }
                )
              }
              /** @param {ChunkGroup} chunkGroup */
              function collectAllChildren(chunkGroup) {
                for (const x of chunkGroup.getChildren()) {
                  if (visitedChunkGroups.has(x)) continue
                  else {
                    visitedChunkGroups.add(x)
                    x.chunks.forEach((x) => reachableChunks.add(x))
                    collectAllChildren(x)
                  }
                }
              }
            })
          })
        })
      }
    }
  }
}

// webpack/lib/javascript/StartupHelpers.js
/**
 * @param {import('webpack').Chunk} chunk the chunk
 * @param {import('webpack').ChunkGraph} chunkGraph the chunk graph
 * @param {function(import('webpack').Chunk, import('webpack').ChunkGraph): boolean} filterFn filter function
 * @returns {Set<number | string>} initially fulfilled chunk ids
 */
function getInitialChunkIds(chunk, chunkGraph, filterFn) {
  const initialChunkIds = new Set(chunk.ids)
  for (const c of chunk.getAllInitialChunks()) {
    if (c === chunk || filterFn(c, chunkGraph)) continue
    for (const id of c.ids) initialChunkIds.add(id)
  }
  return initialChunkIds
}

// webpack/lib/javascript/JavascriptModulesPlugin.js
/**
 * @param {import('webpack').Chunk} chunk a chunk
 * @param {import('webpack').ChunkGraph} chunkGraph the chunk graph
 * @returns {boolean} true, when a JS file is needed for this chunk
 */
function chunkHasJs(chunk, chunkGraph) {
  if (chunkGraph.getNumberOfEntryModules(chunk) > 0) return true
  return !!chunkGraph.getChunkModulesIterableBySourceType(chunk, 'javascript')
}
