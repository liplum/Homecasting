import { Readable } from "stream"
import { BufferReader, BufferWriter } from "./buffer.js"
import { v4 as uuidv4 } from "uuid"
/**
 * returns whether the message is handled
 */
export type Handler<Data> = (data: Data, header?: any) => boolean | Promise<boolean>

export enum DataType {
  string = 1,
  object = 2,
  array = 3,
}

export enum MessageType {
  object = 1,
  stream = 2,
  innerEvent = 3,
}

export enum StreamState {
  end = 0,
  on = 1,
  error = 2,
}

enum InnerEventType {
  endStreamRequest = 1,
}

export type PrereadHook = ({ type, id, reader, header }: {
  type: MessageType
  id: string
  header?: any
  reader: BufferReader
}) => boolean | undefined
export type ReadHook<Data> = ({ type, id, data, header }: {
  type: MessageType
  id: string
  header?: any
  data: Data
  chunk?: Buffer | null
}) => boolean | undefined
export interface SocketLike {
  close: (...args: any[]) => void
  send: (buffer: Buffer) => void
}
export class Net {
  readonly socket: SocketLike
  private readonly messageHandlers = new Map<string, Handler<any>[]>()
  private unhandledMessageTasks: (() => void)[] = []
  private readonly prereadHooks: PrereadHook[] = []
  private readonly readHooks: ReadHook<any>[] = []
  private readonly id2SendingStream = new Map<string, Readable>()
  readonly id2ReadingStream = new Map<string, Readable>()
  constructor(socket: SocketLike) {
    this.socket = socket
  }

  startDaemonWatch(): void {
    const timer = setInterval(() => {
      const tasks = this.unhandledMessageTasks
      this.unhandledMessageTasks = []
      for (const task of tasks) {
        task()
      }
    })
    timer.unref()
  }

  close(...args: any[]): void {
    this.socket.close(...args)
  }

  /**
   * Call this in ws.on("message")
   */
  handleDatapack(data: Buffer): void {
    const reader = new BufferReader(data)
    const type = reader.uint8()
    if (type === MessageType.innerEvent) {
      const eventType = reader.uint8()
      if (eventType === InnerEventType.endStreamRequest) {
        // handled by the sender
        const uuid = reader.string()
        const stream = this.id2ReadingStream.get(uuid)
        if (stream) {
          stream.emit("end")
        }
      }
      return
    }
    const id = reader.string()
    const headerString = readHeader(reader)
    const header: any | undefined = headerString ? JSON.parse(headerString) : undefined
    const prereadHookArgs = { type, id, reader, header }
    for (const hook of this.prereadHooks) {
      if (hook(prereadHookArgs)) return
    }
    if (type === MessageType.object) {
      const data = readObject(reader)
      const readHookArgs = { type, id, data, header }
      for (const hook of this.readHooks) {
        if (hook(readHookArgs)) return
      }
      this.handleMessage(id, data, header)
    } else if (type === MessageType.stream) {
      const uuid = reader.string()
      const state: StreamState = reader.uint8()

      if (state === StreamState.on) {
        let stream = this.id2SendingStream.get(uuid)
        if (!stream) {
          stream = new Readable({
            read() { }
          })
          // when the stream needs to be ended.
          stream.on("end", () => {
            const writer = new BufferWriter(38)
            // 1 byte
            writer.uint8(MessageType.innerEvent)
            // 1 byte
            writer.uint8(InnerEventType.endStreamRequest)
            // 36 bytes
            writer.string(uuid)
            this.socket.send(writer.buildBuffer())
          })
          this.id2SendingStream.set(uuid, stream)
          let isHookHandled = false
          const readHookArgs = { type, id, data: stream, header }
          for (const hook of this.readHooks) {
            if (hook(readHookArgs)) {
              isHookHandled = true
              break
            }
          }
          if (!isHookHandled) {
            this.handleMessage(id, stream, header)
          }
        }
        const chunk = reader.buffer()
        stream.push(chunk)
      } else if (state === StreamState.end) {
        const stream = this.id2SendingStream.get(uuid)
        if (stream) {
          stream.push(null)
          this.id2SendingStream.delete(uuid)
        }
      } else {
        const stream = this.id2SendingStream.get(uuid)
        if (stream) {
          stream.emit("error")
          this.id2SendingStream.delete(uuid)
        }
      }
    }
  }

  private handleMessage(id: string, data: any, header?: any): void {
    const handlers = this.messageHandlers.get(id)
    const handlerLengthBefore = handlers?.length
    if (handlers) {
      const handlerAfter = handlers.filter((handler) => {
        return !handler(data, header)
      })
      this.messageHandlers.set(id, handlerAfter)
    }
    if (handlers?.length !== handlerLengthBefore) {
      this.unhandledMessageTasks.push(() => {
        this.handleMessage(id, data, header)
      })
    }
  }

  send(id: string, data: any, header?: any): void {
    if (data instanceof Readable) {
      this.sendStream(id, data, header)
    } else {
      this.sendObject(id, data, header)
    }
  }

  private sendObject(id: string, data: any, header?: any): void {
    const writer = new BufferWriter()
    writer.uint8(MessageType.object)
    writer.string(id)
    writeHeader(writer, JSON.stringify(header))
    writeObject(writer, data)
    this.socket.send(writer.buildBuffer())
  }

  private sendStream(id: string, stream: Readable, header?: any): void {
    header = JSON.stringify(header)
    const uuid = uuidv4()
    this.id2ReadingStream.set(uuid, stream)
    stream.on("readable", () => {
      let chunk: Buffer
      while ((chunk = stream.read(1024)) !== null) {
        const writer = new BufferWriter()
        writer.uint8(MessageType.stream)
        writer.string(id)
        writeHeader(writer, header)
        writer.string(uuid)
        writer.uint8(StreamState.on)
        writer.buffer(chunk)
        this.socket.send(writer.buildBuffer())
      }
    })

    stream.on("end", () => {
      this.id2ReadingStream.delete(uuid)
      const writer = new BufferWriter()
      writer.uint8(MessageType.stream)
      writer.string(id)
      writeHeader(writer, header)
      writer.string(uuid)
      writer.uint8(StreamState.end)
      this.socket.send(writer.buildBuffer())
    })

    stream.on("error", () => {
      this.id2ReadingStream.delete(uuid)
      const writer = new BufferWriter()
      writer.uint8(MessageType.stream)
      writer.string(id)
      writeHeader(writer, header)
      writer.string(uuid)
      writer.uint8(StreamState.error)
      this.socket.send(writer.buildBuffer())
    })
  }

  private addHandler<Data>(
    handlers: Map<string, Handler<Data>[]>,
    id: string, handler: Handler<Data>
  ): void {
    if (handlers.has(id)) {
      handlers.get(id)?.push(handler)
    } else {
      handlers.set(id, [handler])
    }
  }

  onMessage<T = any>(id: string, handler: Handler<T>): void {
    this.addHandler(this.messageHandlers, id, handler)
  }

  async getMessage<T = any>(id: string, headerMatcher?: (header?: any) => boolean): Promise<T> {
    return new Promise((resolve, reject) => {
      this.onMessage<T>(id, (data, header) => {
        if (!headerMatcher || headerMatcher(header)) {
          resolve(data)
          return true
        }
        return false
      })
    })
  }

  addPrereadHook(hook: PrereadHook): void {
    this.prereadHooks.push(hook)
  }

  addReadHook<Data = any>(hook: ReadHook<Data>): void {
    this.readHooks.push(hook)
  }
}

function writeHeader(writer: BufferWriter, header?: string): void {
  if (header !== undefined) {
    writer.int8(1)
    writer.string(header)
  } else {
    writer.int8(0)
  }
}

function readHeader(reader: BufferReader): string | undefined {
  const hasHeader = reader.int8()
  if (hasHeader) {
    return reader.string()
  } else {
    return undefined
  }
}

function writeObject(writer: BufferWriter, data: any): void {
  if (typeof data === "string") {
    writer.uint8(DataType.string)
    writer.string(data)
  } else if (Array.isArray(data)) {
    writer.uint32BE(data.length)
    for (let i = 0; i < data.length; i++) {
      writeObject(writer, data[i])
    }
  } else {
    writer.uint8(DataType.object)
    writer.string(JSON.stringify(data))
  }
}

function readObject(reader: BufferReader): any {
  const type: DataType = reader.uint8()
  if (type === DataType.string) {
    return reader.string()
  } else if (type === DataType.object) {
    return JSON.parse(reader.string())
  } else {
    const arr: any[] = []
    const length = reader.uint32BE()
    for (let i = 0; i < length; i++) {
      arr.push(readObject(reader))
    }
  }
}
