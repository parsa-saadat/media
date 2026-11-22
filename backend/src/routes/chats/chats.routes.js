import { authenticateToken } from "../../middleware/safety/auth.middleware.js";
import * as chatsController from "../../module/chats/chats.controller.js";
import {
  validateAddMember,
  validateCreateChat,
  validateDirect,
  validateMemberAction,
  validateRead,
  validateUpdateChat,
} from "../../module/chats/chats.middleware.js";
import { Router } from "../../utils/http/http.util.js";

const router = new Router();

// rooms (public), groups (private) and direct chats are all "conversations"
router.get("/conversations", authenticateToken, chatsController.list);
router.post("/conversations", authenticateToken, validateCreateChat, chatsController.create);
router.get("/conversations/:id", authenticateToken, chatsController.detail);
router.patch("/conversations/:id", authenticateToken, validateUpdateChat, chatsController.update);
router.delete("/conversations/:id", authenticateToken, chatsController.remove);

router.post("/conversations/:id/join", authenticateToken, chatsController.join);
router.post("/conversations/:id/leave", authenticateToken, chatsController.leave);
router.post("/conversations/:id/members", authenticateToken, validateAddMember, chatsController.addMember);
router.patch("/conversations/:id/members", authenticateToken, validateMemberAction, chatsController.manageMember);
router.post("/conversations/:id/read", authenticateToken, validateRead, chatsController.read);

router.get("/rooms", authenticateToken, chatsController.rooms);
router.post("/direct", authenticateToken, validateDirect, chatsController.direct);

export default router;
