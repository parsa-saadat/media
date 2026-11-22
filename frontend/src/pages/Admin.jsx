import AdminPanel from "../components/admin/AdminPanel";
import { Icon } from "../components/common/Icon";
import { Button } from "../components/common/Ui";
import { navigate } from "../utils/router";
import { useSession } from "../utils/session";

/** /admin — only for roles that carry the "admin.access" permission (the API enforces it too). */
export default function Admin() {
  const { user } = useSession();
  if (!user) return null;
  if (!user.permissions.includes("admin.access")) {
    return (
      <div className="bg-aurora flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <Icon name="lock" size={28} />
        </span>
        <h1 className="text-xl font-black">به پنل مدیریت دسترسی ندارید</h1>
        <p className="max-w-sm text-sm leading-7 text-muted">
          این بخش فقط برای نقش‌هایی است که مجوز «دسترسی به پنل مدیریت» دارند.
        </p>
        <Button onClick={() => navigate("/")}>بازگشت به گفتگوها</Button>
      </div>
    );
  }
  return <AdminPanel me={user} />;
}
