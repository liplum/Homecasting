import { token } from "../ioc.js"
import { TYPE as MeditreeType, type MeditreePlugin } from "../server.js"
import { type WithUser } from "./auth.js"
import { type Request } from "express"
import { TYPE as AuthType } from "./auth.js"

export const TYPE = {
  StatisticsStorage: token<StatisticsStorageService>("Statistics.Storage")
}

export interface StatisticsStorageService {
  increment(filePath: string): Promise<void>
  getViewCount(filePath: string): Promise<number | undefined>

  setLastView(filePath: string, time: Date): Promise<void>
  getLastView(filePath: string): Promise<Date | undefined>
}
interface StatisticsPluginConfig {
  /**
   * 
   */
  statisticsPath?: string
}

export default function StatisticsPlugin(config: StatisticsPluginConfig): MeditreePlugin {
  let statistics: StatisticsStorageService
  return {
    onRegisterService(container) {
      statistics = container.get(TYPE.StatisticsStorage)
      const events = container.get(MeditreeType.Events)
      const users = container.tryGet(AuthType.UserStorage)
      events.on("file-requested", async (req: Request & Partial< WithUser>, res, file, vitrualPath) => {
        await statistics.increment(vitrualPath)
        await statistics.setLastView(vitrualPath, new Date())
        if (req.user && users) {
          req.user.viewTimes++
          await users.updateUser(req.user)
        }
      })
    },
  }
}
