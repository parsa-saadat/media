import { authenticateToken, authorizePermissions } from "../../middleware/safety/auth.middleware.js";
import * as contactsController from "../../module/contacts/contacts.controller.js";
import { validateRespond, validateTarget, validateUsername } from "../../module/contacts/contacts.middleware.js";
import { Router } from "../../utils/http/http.util.js";

const router = new Router();

// friends (requests are sent by @username)
router.get("/friends", authenticateToken, contactsController.friends);
router.post("/friends", authenticateToken, authorizePermissions("friends.request"), validateUsername, contactsController.requestFriend);
router.patch("/friends/:id", authenticateToken, validateRespond, contactsController.respondFriend);
router.delete("/friends/:id", authenticateToken, contactsController.removeFriend);

// blocks
router.get("/blocks", authenticateToken, contactsController.blocks);
router.post("/blocks", authenticateToken, validateTarget, contactsController.block);
router.delete("/blocks/:id", authenticateToken, contactsController.unblock);

export default router;
