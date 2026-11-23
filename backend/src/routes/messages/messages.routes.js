import { authenticateToken } from "../../middleware/safety/auth.middleware.js";
import * as messagesController from "../../module/messages/messages.controller.js";
import { validateBulkDelete, validateEditMessage, validateForwardMessages, validateSendMessage } from "../../module/messages/messages.middleware.js";
import { Router } from "../../utils/http/http.util.js";

const router = new Router();

router.get("/conversations/:id/messages", authenticateToken, messagesController.list);
router.post("/conversations/:id/messages", authenticateToken, validateSendMessage, messagesController.send);
router.patch("/messages/:id", authenticateToken, validateEditMessage, messagesController.edit);
router.delete("/messages/:id", authenticateToken, messagesController.remove);
router.post("/messages/:id/save", authenticateToken, messagesController.save);
router.post("/messages/forward", authenticateToken, validateForwardMessages, messagesController.forward);
router.post("/messages/bulk-delete", authenticateToken, validateBulkDelete, messagesController.bulkRemove);

export default router;
