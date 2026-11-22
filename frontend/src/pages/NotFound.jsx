import { Icon } from "../components/common/Icon";
import { Button } from "../components/common/Ui";
import { navigate } from "../utils/router";

export default function NotFound() {
  return (
    <div className="bg-aurora flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-accent/15 text-accent">
        <Icon name="compass" size={28} />
      </span>
      <h1 className="text-xl font-black">این صفحه پیدا نشد</h1>
      <p className="max-w-sm text-sm leading-7 text-muted">نشانی‌ای که باز کرده‌اید وجود ندارد.</p>
      <Button onClick={() => navigate("/")}>بازگشت به گفتگوها</Button>
    </div>
  );
}
