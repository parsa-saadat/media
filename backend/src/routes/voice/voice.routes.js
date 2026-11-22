import { authenticateToken } from "../../middleware/safety/auth.middleware.js";
import * as voiceController from "../../module/voice/voice.controller.js";
import { validateTrackAction, validateVoiceAction } from "../../module/voice/voice.middleware.js";
import { Router } from "../../utils/http/http.util.js";

const router = new Router();

router.get("/voice/:id", authenticateToken, voiceController.snapshot);
router.post("/voice/:id", authenticateToken, validateVoiceAction, voiceController.action);
router.post("/voice/:id/track", authenticateToken, validateTrackAction, voiceController.track);

export default router;
