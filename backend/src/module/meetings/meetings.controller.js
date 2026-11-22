import { positiveInt, text } from "../../utils/validators/input.validator.js";
import { HttpError } from "../../utils/http/http.util.js";
import * as meetingsService from "./meetings.service.js";

/** Everything below except create/list/end/invite also works for guests (req.user may be null). */

export const create = async (req, res) => {
  res.status(201).json({ meeting: await meetingsService.createMeeting(req.me, req.input) });
};

export const list = async (req, res) => {
  res.json({ meetings: await meetingsService.listMyMeetings(req.me) });
};

export const info = async (req, res) => {
  const meeting = await meetingsService.resolveMeeting(req.params.token, req.user);
  res.json({
    meeting: meetingsService.publicMeeting(meeting),
    isHost: meetingsService.isHost(meeting, req.user),
  });
};

export const join = async (req, res) => {
  const meeting = await meetingsService.resolveMeeting(req.params.token, req.user);
  res.json(await meetingsService.joinMeeting(req.user, meeting, req.input));
};

export const snapshot = async (req, res) => {
  const meeting = await meetingsService.resolveMeeting(req.params.token, req.user);
  const joinToken = text(req.query.get("joinToken"), 100);
  if (!joinToken) throw new HttpError(400, "joinToken لازم است");
  res.json(
    await meetingsService.getSnapshot(
      req.user,
      meeting,
      joinToken,
      positiveInt(req.query.get("after")),
      positiveInt(req.query.get("afterAudio")),
    ),
  );
};

export const action = async (req, res) => {
  const meeting = await meetingsService.resolveMeeting(req.params.token, req.user);
  const out = await meetingsService.meetingAction(req.user, meeting, req.input);
  res.json({ ok: true, ...(out && typeof out === "object" ? out : {}) });
};

export const invitable = async (req, res) => {
  const meeting = await meetingsService.resolveMeeting(req.params.token, req.user);
  res.json({ friends: await meetingsService.invitableFriends(req.me, meeting) });
};

export const invite = async (req, res) => {
  const meeting = await meetingsService.resolveMeeting(req.params.token, req.user);
  const raw = Array.isArray(req.body.userIds) ? req.body.userIds.slice(0, 25) : [];
  const ids = [...new Set(raw.map(positiveInt).filter(Boolean))];
  res.json(await meetingsService.inviteToMeeting(req.me, meeting, ids), "دعوت‌نامه ارسال شد");
};

export const end = async (req, res) => {
  const meeting = await meetingsService.resolveMeeting(req.params.token, req.user);
  await meetingsService.endMeeting(req.me, meeting);
  res.json({ ok: true }, "جلسه پایان یافت");
};
