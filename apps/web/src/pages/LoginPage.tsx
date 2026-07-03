import { registerSchema } from "@pet-task-ai/shared";
import { LogIn, PawPrint, UserRoundPlus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useLogin, useRegister } from "../api/client";
import { toast } from "../components/toast";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

export function LoginPage() {
  const login = useLogin();
  const register = useRegister();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const isRegister = mode === "register";
  const pending = login.isPending || register.isPending;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = username.trim();
    if (!name || !password) {
      toast("请输入用户名和密码", "error");
      return;
    }
    try {
      if (isRegister) {
        const parsed = registerSchema.safeParse({ username: name, password });
        if (!parsed.success) {
          toast(parsed.error.issues[0]?.message ?? "输入不合法", "error");
          return;
        }
        if (password !== confirmPassword) {
          toast("两次输入的密码不一致", "error");
          return;
        }
        await register.mutateAsync(parsed.data);
        toast("注册成功，欢迎使用 🎉");
      } else {
        await login.mutateAsync({ username: name, password });
      }
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : isRegister
            ? "注册失败"
            : "登录失败",
        "error",
      );
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
            placeholder={
              isRegister ? "字母、数字、下划线或连字符" : "请输入用户名"
            }
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-muted-foreground">
            密码
          </span>
          <Input
            autoComplete={isRegister ? "new-password" : "current-password"}
            placeholder={isRegister ? "至少 6 位" : "请输入密码"}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {isRegister ? (
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-muted-foreground">
              确认密码
            </span>
            <Input
              autoComplete="new-password"
              placeholder="再输入一次密码"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>
        ) : null}
        <Button
          className="h-11 w-full rounded-2xl text-base"
          disabled={pending}
          type="submit"
        >
          {isRegister ? <UserRoundPlus /> : <LogIn />}
          {pending ? "提交中..." : isRegister ? "创建账号" : "登录"}
        </Button>
        <button
          className="block w-full text-center text-sm text-primary"
          type="button"
          onClick={() => setMode(isRegister ? "login" : "register")}
        >
          {isRegister ? "已有账号？去登录" : "没有账号？自助注册"}
        </button>
      </form>
    </div>
  );
}
