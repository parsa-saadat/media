import { authenticateToken, identify } from "../../middleware/safety/auth.middleware.js";
import createLimiter from "../../middleware/safety/ratelimiter.middleware.js";
import * as authController from "../../module/auth/auth.controller.js";
import { validateLogin, validateProfile, validateRegister } from "../../module/auth/auth.middleware.js";
import { Router } from "../../utils/http/http.util.js";

const signInLimiter = createLimiter({ name: "sign-in", windowMs: 5 * 60_000, max: 60 });

const router = new Router();

router.post("/auth/register", signInLimiter, validateRegister, authController.register);
router.post("/auth/login", signInLimiter, validateLogin, authController.login);
router.post("/auth/logout", authController.logout);
router.get("/auth/me", identify, authController.me);
router.patch("/auth/me", authenticateToken, validateProfile, authController.updateMe);
router.get("/auth/demo-accounts", authController.mockAccounts);

export default router;
