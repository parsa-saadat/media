import { text } from "../../utils/validators/input.validator.js";
import * as usersService from "./users.service.js";

export const search = async (req, res) => {
  res.json({ users: await usersService.searchUsers(req.me, text(req.query.get("q"), 64)) });
};
