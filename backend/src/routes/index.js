import { Router } from "../utils/http/http.util.js";
import adminRoutes from "./admin/admin.routes.js";
import authRoutes from "./auth/auth.routes.js";
import azanRoutes from "./azan/azan.routes.js";
import chatsRoutes from "./chats/chats.routes.js";
import contactsRoutes from "./contacts/contacts.routes.js";
import contentRoutes from "./content/content.routes.js";
import istikharaRoutes from "./istikhara/istikhara.routes.js";
import meetingsRoutes from "./meetings/meetings.routes.js";
import notificationsRoutes from "./notifications/notifications.routes.js";
import profileRoutes from "./profile/profile.routes.js";
import messagesRoutes from "./messages/messages.routes.js";
import storageRoutes from "./storage/storage.routes.js";
import usersRoutes from "./users/users.routes.js";
import voiceRoutes from "./voice/voice.routes.js";

/** Every API route, served under /api. */
const routes = new Router()
  .use(authRoutes)
  .use(usersRoutes)
  .use(chatsRoutes)
  .use(messagesRoutes)
  .use(storageRoutes)
  .use(contactsRoutes)
  .use(voiceRoutes)
  .use(istikharaRoutes)
  .use(meetingsRoutes)
  .use(notificationsRoutes)
  .use(profileRoutes)
  .use(azanRoutes)
  .use(contentRoutes)
  .use(adminRoutes);

export default routes;
