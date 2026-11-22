import { authenticateToken, identify, authorizePermissions } from "../../middleware/safety/auth.middleware.js";
import * as contentController from "../../module/content/content.controller.js";
import { validateContentId, validateCreateContent, validateUpdateContent } from "../../module/content/content.middleware.js";
import { Router } from "../../utils/http/http.util.js";

const router = new Router();
const manage = authorizePermissions("content.manage");

// the daily verse is public: it also greets guests on the sign-in screen
router.get("/content/daily", identify, contentController.daily);

router.get("/content", authenticateToken, manage, contentController.list);
router.post("/content", authenticateToken, manage, validateCreateContent, contentController.create);
router.patch("/content/:id", authenticateToken, manage, validateContentId, validateUpdateContent, contentController.update);
router.delete("/content/:id", authenticateToken, manage, validateContentId, contentController.remove);
router.post("/content/:id/daily", authenticateToken, manage, validateContentId, contentController.setDaily);

export default router;
