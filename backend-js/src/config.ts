import fs from "fs"
import { v4 as uuidv4 } from "uuid"
import { HLSMediaType } from "./plugin/hls.js"
import { type File } from "./file.js"

export interface AppConfig {
  /** 
   * The network interface on which the application will listen for incoming connections.
   * 0.0.0.0(all interfaces) by default.
   */
  hostname?: string
  /** 
   * Port 80 is used by default.
   */
  port: number
  /**
   * The root directory to host.
   *
   * By default, no local file tree will be created.
   * 
   * If an array of paths is given, a virtual file tree will be created with the given paths.
   * 
   * If a map of name to path is given, a virtual file tree will be created with the specified names and paths.
   */
  root?: string | string[] | Record<string, string>
  /**
   * The unique name of hosted file tree.
   * If not specified, a uuid v4 will be generated.
   */
  name: string
  fileType: Record<string, string>
  plugin?: Record<string, Record<string, any>>
  ignore: string[]
  /**
   * 7 days by default.
   */
  cacheMaxAge: number
  /**
   * The directory where the log files are located.
   */
  logDir?: string
  /**
   * The minimum log level for console logging.
   * Auto-capitalized.
   * "INFO" by default.
   */
  logLevel?: string
  [key: string]: any
}

const defaultConfig: AppConfig = {
  name: "Meditree",
  port: 8080,
  cacheMaxAge: 604800,
  fileType: {
    "**/*.mp4": "video/mp4",
    "**/*.svg": "image/svg+xml",
    "**/*.png": "image/png",
    "**/*.+(jpeg|jpg)": "image/jpeg",
    "**/*.mp3": "audio/mpeg",
    "**/*.md": "text/markdown",
    "**/*.txt": "text/plain",
    "**/*.gif": "image/gif",
    "**/*.webp": "image/webp",
    "**/*.m3u8": HLSMediaType,
    "**/*.ts": "video/mpeg", // TODO: conflict with typescript file
  },
  ignore: [],
}

// default to ignore application on macOS
if (process.platform === "darwin") {
  defaultConfig.ignore?.push(
    "**/*.app",
    "**/*.DS_Store"
  )
}

export function setupConfig(config: AppConfig | Partial<AppConfig> = {}): AppConfig {
  const newConfig = config as AppConfig
  if (!newConfig.name) {
    newConfig.name = uuidv4()
  }
  if (!newConfig.fileType) {
    newConfig.fileType = defaultConfig.fileType as any
  }
  if (!newConfig.port) {
    newConfig.port = defaultConfig.port
  }
  if (!newConfig.ignore) {
    newConfig.ignore = defaultConfig.ignore
  }
  if (newConfig.cacheMaxAge === undefined) {
    newConfig.cacheMaxAge = defaultConfig.cacheMaxAge
  }
  return newConfig
}

export function loadConfigFromFile(configFi: File): AppConfig {
  if (!configFi.readable) {
    return setupConfig()
  }
  const data = fs.readFileSync(configFi.path, "utf8")
  let json: any
  try {
    json = JSON.parse(data)
  } catch {
    json = {}
  }
  const config = setupConfig(json)
  if (configFi.writable) {
    fs.writeFileSync(configFi.path, JSON.stringify(config, null, 2))
  }
  return config
}
