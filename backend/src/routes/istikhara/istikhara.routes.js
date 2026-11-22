import { authenticateToken } from "../../middleware/safety/auth.middleware.js";
import createLimiter from "../../middleware/safety/ratelimiter.middleware.js";
import * as istikharaController from "../../module/istikhara/istikhara.controller.js";
import { validateDraw } from "../../module/istikhara/istikhara.middleware.js";
import { Router } from "../../utils/http/http.util.js";

const router = new Router();
// upstream API is a shared public resource — keep draws reasonable per user
const drawLimiter = createLimiter({ name: "istikhara", windowMs: 60_000, max: 20 });

router.get("/istikhara/translations", authenticateToken, istikharaController.translations);
router.get("/istikhara/draw", authenticateToken, drawLimiter, validateDraw, istikharaController.draw);

export default router;
