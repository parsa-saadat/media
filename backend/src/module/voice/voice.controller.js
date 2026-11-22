import { positiveInt } from "../../utils/validators/input.validator.js";
import * as voiceService from "./voice.service.js";

export const snapshot = async (req, res) => {
  res.json(await voiceService.getSnapshot(req.me, req.id(), positiveInt(req.query.get("after"))));
};

export const action = async (req, res) => {
  const input = req.input;
  const chatId = req.id();
  switch (input.action) {
    case "join":
      res.json(await voiceService.joinVoice(req.me, chatId));
      return;
    case "leave":
      await voiceService.leaveVoice(req.me, chatId, input.joinToken);
      break;
    case "heartbeat":
      await voiceService.heartbeat(req.me, chatId, input.joinToken);
      break;
    case "mic":
      await voiceService.setMic(req.me, chatId, input.joinToken, input.on);
      break;
    case "share":
      await voiceService.setShare(req.me, chatId, input.joinToken, input.on, input.quality);
      break;
    case "signal":
      await voiceService.sendSignal(req.me, chatId, input);
      break;
    case "moderate":
      await voiceService.moderate(req.me, chatId, input);
      break;
  }
  res.json({ ok: true });
};

export const track = async (req, res) => {
  const kind = await voiceService.trackAction(req.me, req.id(), req.input);
  res.json({ ok: true, ...(kind ? { kind } : {}) });
};
