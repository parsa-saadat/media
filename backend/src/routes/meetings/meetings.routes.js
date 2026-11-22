import { authenticateToken, identify } from "../../middleware/safety/auth.middleware.js";
import createLimiter from "../../middleware/safety/ratelimiter.middleware.js";
import * as meetingsController from "../../module/meetings/meetings.controller.js";
import { validateCreateMeeting, validateJoinMeeting, validateMeetingAction, validateMeetingToken } from "../../module/meetings/meetings.middleware.js";
import { Router } from "../../utils/http/http.util.js";

const router = new Router();
// `identify` (not authenticateToken): guests without an account may join by link.
const joinLimiter = createLimiter({ name: "meeting-join", windowMs: 60_000, max: 40 });

router.post("/meetings", authenticateToken, validateCreateMeeting, meetingsController.create);
router.get("/meetings", authenticateToken, meetingsController.list);

router.get("/meetings/:token", identify, validateMeetingToken, meetingsController.info);
router.post("/meetings/:token/join", identify, validateMeetingToken, joinLimiter, validateJoinMeeting, meetingsController.join);
router.get("/meetings/:token/state", identify, validateMeetingToken, meetingsController.snapshot);
router.post("/meetings/:token/action", identify, validateMeetingToken, validateMeetingAction, meetingsController.action);
router.get("/meetings/:token/invitable", authenticateToken, validateMeetingToken, meetingsController.invitable);
router.post("/meetings/:token/invite", authenticateToken, validateMeetingToken, meetingsController.invite);
router.post("/meetings/:token/end", authenticateToken, validateMeetingToken, meetingsController.end);

export default router;
