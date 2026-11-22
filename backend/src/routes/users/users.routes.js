import { authenticateToken } from "../../middleware/safety/auth.middleware.js";
import * as usersController from "../../module/users/users.controller.js";
import { Router } from "../../utils/http/http.util.js";

const router = new Router();

router.get("/users/search", authenticateToken, usersController.search);

export default router;
