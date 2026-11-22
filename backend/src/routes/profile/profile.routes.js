import { authenticateToken } from "../../middleware/safety/auth.middleware.js";
import * as profileController from "../../module/profile/profile.controller.js";
import { validatePhotoId, validateStatus } from "../../module/profile/profile.middleware.js";
import { Router } from "../../utils/http/http.util.js";

const router = new Router();

router.get("/profile", authenticateToken, profileController.myProfile);
router.post("/profile/photos", authenticateToken, profileController.addPhoto);
router.delete("/profile/photos/:fileId", authenticateToken, validatePhotoId, profileController.removePhoto);
router.post("/profile/avatar/:fileId", authenticateToken, validatePhotoId, profileController.setAvatar);
router.patch("/profile/status", authenticateToken, validateStatus, profileController.setStatus);
router.post("/profile/banner", authenticateToken, profileController.addBanner);
router.delete("/profile/banner", authenticateToken, profileController.removeBanner);
router.get("/banners/:userId", authenticateToken, profileController.banner);
router.get("/users/:userId/profile", authenticateToken, profileController.publicProfile);

export default router;
