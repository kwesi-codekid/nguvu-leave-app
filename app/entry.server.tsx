import { CronService } from "./services/cron.service";

// Initialize cron jobs when the server starts
CronService.init();

export default function server() {
  // This is a placeholder - React Router will handle the actual server setup
  // The important part is that CronService.init() is called when this module loads
}
