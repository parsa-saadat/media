import { authenticateToken } from "../../middleware/safety/auth.middleware.js";
import * as notificationsController from "../../module/notifications/notifications.controller.js";
import { validateMarkRead } from "../../module/notifications/notifications.middleware.js";
import { Router } from "../../utils/http/http.util.js";

const router = new Router();

router.get("/notifications", authenticateToken, notificationsController.list);
router.patch("/notifications/read", authenticateToken, validateMarkRead, notificationsController.markRead);
router.delete("/notifications", authenticateToken, notificationsController.clear);

export default router;
