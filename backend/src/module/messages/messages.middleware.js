import { HttpError } from "../../utils/http/http.util.js";
import { positiveInt, text } from "../../utils/validators/input.validator.js";

export const validateSendMessage = (req) => {
  const rawFileIds = Array.isArray(req.body.fileIds) ? req.body.fileIds.slice(0, 10) : [];
  const fileIds = [...new Set(rawFileIds.map(positiveInt).filter(Boolean))];
  const singleFileId = positiveInt(req.body.fileId);
  req.input = {
    content: text(req.body.content, 4000).trim(),
    fileId: singleFileId || (fileIds.length === 1 ? fileIds[0] : null),
    fileIds: fileIds.length > 1 ? fileIds : singleFileId ? [singleFileId] : fileIds,
  };
};

export const validateEditMessage = (req) => {
  const content = text(req.body.content, 4000).trim();
  if (!content) throw new HttpError(400, "متن پیام نمی‌تواند خالی باشد");
  req.input = { content };
};

export const validateBulkDelete = (req) => {
  const raw = Array.isArray(req.body.ids) ? req.body.ids.slice(0, 100) : [];
  const ids = [...new Set(raw.map(positiveInt).filter(Boolean))];
  if (!ids.length) throw new HttpError(400, "پیامی انتخاب نشده است");
  req.input = { ids };
};

export const validateForwardMessages = (req) => {
  const rawMsgs = Array.isArray(req.body.messageIds)
    ? req.body.messageIds.slice(0, 50)
    : req.body.messageId
      ? [req.body.messageId]
      : [];
  const messageIds = [...new Set(rawMsgs.map(positiveInt).filter(Boolean))];
  if (!messageIds.length) throw new HttpError(400, "پیامی برای فوروارد انتخاب نشده است");

  const rawTargets = Array.isArray(req.body.targetConversationIds)
    ? req.body.targetConversationIds.slice(0, 30)
    : req.body.targetConversationId
      ? [req.body.targetConversationId]
      : [];
  const targetConversationIds = [...new Set(rawTargets.map(positiveInt).filter(Boolean))];
  if (!targetConversationIds.length) throw new HttpError(400, "مقصد فوروارد انتخاب نشده است");

  req.input = { messageIds, targetConversationIds };
};

