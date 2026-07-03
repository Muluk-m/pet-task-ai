import { LogIn, PawPrint } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useLogin } from "../api/client";
import { toast } from "../components/toast";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

export function LoginPage() {
  const login = useLogin();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password) {
      toast("请输入用户名和密码", "error");
      return;
    }
    try {
      await login.mutateAsync({ username: username.trim(), password });
    } catch (error) {
      toast(error instanceof Error ? error.message : "登录失败", "error");
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center px-6 pb-24">
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="flex size-18 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
          <PawPrint size={34} />
        </div>
        <h1 className="text-2xl font-bold text-primary">Pet Task AI</h1>
        <p className="text-sm text-muted-foreground">宠物置换任务管理</p>
      </div>

      <form
        className="space-y-4 rounded-3xl border border-border/60 bg-card p-6 shadow-xs"
        onSubmit={handleSubmit}
      >
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-muted-foreground">
            用户名
          </span>
          <Input
            autoComplete="username"
            placeholder="请输入用户名"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-muted-foreground">
            密码
          </span>
          <Input
            autoComplete="current-password"
            placeholder="请输入密码"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <Button
          className="h-11 w-full rounded-2xl text-base"
          disabled={login.isPending}
          type="submit"
        >
          <LogIn />
          {login.isPending ? "登录中..." : "登录"}
        </Button>
      </form>
    </div>
  );
}
