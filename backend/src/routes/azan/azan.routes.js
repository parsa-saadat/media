import { authenticateToken, authorizePermissions } from "../../middleware/safety/auth.middleware.js";
import * as azanController from "../../module/azan/azan.controller.js";
import { validateSettings, validateSoundId } from "../../module/azan/azan.middleware.js";
import { Router } from "../../utils/http/http.util.js";

const router = new Router();
const manageSounds = authorizePermissions("azan.manage");

router.get("/azan/sounds", authenticateToken, azanController.sounds);
router.post("/azan/sounds", authenticateToken, manageSounds, azanController.addSound);
router.delete("/azan/sounds/:id", authenticateToken, manageSounds, validateSoundId, azanController.removeSound);
router.get("/azan/sounds/:id/audio", authenticateToken, validateSoundId, azanController.soundAudio);

router.get("/azan/settings", authenticateToken, azanController.getSettings);
router.patch("/azan/settings", authenticateToken, validateSettings, azanController.saveSettings);

export default router;
