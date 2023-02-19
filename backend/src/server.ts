import { HostTree } from './host.js'
import { config } from './app.js'
import express from 'express'
import { Request } from 'express'
import { Response } from 'express'
import * as fs from 'fs'
import { File } from './file.js'
export async function startServer() {
  const tree = new HostTree({
    root: config.root,
    allowedFileExtensions: config.allowedFileExtensions,
    fileTypePattern: config.fileTypePattern,
  })
  tree.startWatching()
  await tree.rebuildFileTree()
  const app = express()

  app.get("/list", (req, res) => {
    res.status(200)
    res.contentType("application/json;charset=utf-8")
    res.send(tree.getJsonString())
  })

  const fileType2handler = {
    "video/mp4": getVideo
  }

  app.get("/file(/*)", (req, res) => {
    const path = removePrefix(decodeURI(req.url), "/file/")
    const file = tree.resolveFile(path)
    if (file == null) {
      res.status(404)
      return
    }
    const handler = fileType2handler[file.type]
    if (handler == null) {
      res.status(404)
      return
    }
    handler(req, res, file)
  })

  app.listen(config.port, config.hostname)
  console.log(`Server running at http://${config.hostname}:${config.port}/`)
}

function removePrefix(origin: string, prefix: string): string {
  if (origin.startsWith(prefix)) return origin.substring(prefix.length,)
  else return origin
}

function getVideo(req: Request, res: Response, file: File) {
  const videoPath = file.path
  const stat = fs.statSync(videoPath)
  const videoSize = stat.size
  const range = req.headers.range;
  if (!req.headers.range) {
    res.header({
      'Content-Length': videoSize,
      'Content-Type': file.type,
    })
    res.status(200)
    const stream = fs.createReadStream(videoPath)
    stream.pipe(res)
  } else {
    const CHUNK_SIZE = 10 ** 6
    const start = Number(range.replace(/\D/g, ""))
    const end = Math.min(start + CHUNK_SIZE, videoSize - 1)
    const contentLength = end - start + 1
    res.header({
      "Content-Range": `bytes ${start}-${end}/${videoSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": contentLength,
      "Content-Type": file.type,
    })
    res.status(206)
    const videoStream = fs.createReadStream(videoPath, { start, end })
    videoStream.pipe(res)
  }
}