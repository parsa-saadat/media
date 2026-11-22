import { authenticateToken } from "../../middleware/safety/auth.middleware.js";
import * as storageController from "../../module/storage/storage.controller.js";
import { Router } from "../../utils/http/http.util.js";

const router = new Router();

router.post("/files", authenticateToken, storageController.upload);
router.get("/files/:id", authenticateToken, storageController.download);
router.get("/files/quota/images", authenticateToken, storageController.quota);

// profile photos
router.post("/avatar", authenticateToken, storageController.uploadAvatar);
router.delete("/avatar", authenticateToken, storageController.removeAvatar);
router.get("/avatars/:userId", authenticateToken, storageController.avatar);

export default router;
