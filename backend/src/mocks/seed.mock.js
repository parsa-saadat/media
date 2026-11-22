import { getCollection } from "../config/mongodb.config.js";
import { ensureSystemRoles } from "../module/auth/auth.service.js";
import { ensureAzanSeed } from "../module/azan/azan.service.js";
import { ensureContentSeed } from "../module/content/content.service.js";

const MOCK_USERNAMES = ["voxsy_demo", "voxsy_friend", "sara_ahmadi", "reza_karimi", "maryam_hosseini"];
const MOCK_PHONES = ["09120000000", "09121111111", "09122222222", "09123333333", "09124444444"];

/**
 * Runs once per server start.
 * 1. Ensures built-in roles, Quranic/daily content, and Azan audio tracks exist.
 * 2. Purges any legacy demo/mock accounts and their sample chats/messages/contacts/sessions.
 */
export async function seedDatabase() {
  await ensureSystemRoles();
  await ensureContentSeed();
  await ensureAzanSeed();

  const usersCol = await getCollection("users");
  const mockUsers = await usersCol
    .find({
      $or: [
        { isMock: true },
        { username: { $in: MOCK_USERNAMES } },
        { phone: { $in: MOCK_PHONES } },
      ],
    })
    .toArray();

  if (mockUsers.length > 0) {
    const mockIds = mockUsers.map((u) => u._id);
    const sessionsCol = await getCollection("sessions");
    const contactsCol = await getCollection("contacts");
    const chatsCol = await getCollection("chats");
    const messagesCol = await getCollection("messages");
    const notificationsCol = await getCollection("notifications");

    await sessionsCol.deleteMany({ userId: { $in: mockIds } });
    await contactsCol.deleteMany({ $or: [{ requesterId: { $in: mockIds } }, { addresseeId: { $in: mockIds } }] });
    await notificationsCol.deleteMany({ userId: { $in: mockIds } });

    // Remove chats created by mock users or direct chats where any participant is a mock user
    const mockChats = await chatsCol
      .find({
        $or: [
          { createdBy: { $in: mockIds } },
          { type: "direct", "members.userId": { $in: mockIds } },
          { type: "saved", "members.userId": { $in: mockIds } },
        ],
      })
      .toArray();
    const mockChatIds = mockChats.map((c) => c._id);
    if (mockChatIds.length > 0) {
      await messagesCol.deleteMany({ conversationId: { $in: mockChatIds } });
      await chatsCol.deleteMany({ _id: { $in: mockChatIds } });
    }

    // Remove mock users from any remaining real groups and delete their messages
    await chatsCol.updateMany(
      { "members.userId": { $in: mockIds } },
      { $pull: { members: { userId: { $in: mockIds } } } },
    );
    await messagesCol.deleteMany({ senderId: { $in: mockIds } });
    await usersCol.deleteMany({ _id: { $in: mockIds } });
    console.log(`[cleanup] removed ${mockIds.length} demo/mock accounts`);
  }

  // Turn any legacy public room into a private group
  await (await getCollection("chats")).updateMany({ type: "room" }, { $set: { type: "group" } });
}
