import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import axios from "axios";
import { LuArrowRight, LuCheckCheck, LuLock, LuMail } from "react-icons/lu";
import { useAuth } from "../context/AuthProvider";
import AuthLayout, { FloatCard } from "./AuthLayout";
import { Alert, Button, Input } from "./ui";
import usePageTitle from "../hooks/usePageTitle";

const Floating = () => (
  <>
    <FloatCard className="left-10 top-10" delay={0.5}>
      <div className="flex w-[270px] items-start gap-3 rounded-2xl border border-white/20 bg-white/90 p-3.5 shadow-2xl backdrop-blur-xl">
        <div className="relative shrink-0">
          <img src="/images/avatars/3.jpg" alt="" className="size-10 rounded-full object-cover" />
          <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">Sofia</p>
            <p className="text-[11px] text-slate-400">2m</p>
          </div>
          <p className="mt-0.5 text-[13px] leading-snug text-slate-600">Missed you at lunch! Catch up later?</p>
        </div>
      </div>
    </FloatCard>
    <FloatCard className="right-10 top-44" delay={0.9}>
      <div className="rounded-2xl rounded-br-md bg-indigo-600 px-4 py-2.5 text-[13px] text-white shadow-2xl shadow-indigo-950/40">
        Absolutely, call you at 6
        <LuCheckCheck className="ml-2 inline size-3.5 text-indigo-200" />
      </div>
    </FloatCard>
  </>
);

const Quote = () => (
  <div className="max-w-md text-white">
    <h2 className="text-4xl font-semibold leading-tight tracking-[-0.03em]">
      Welcome <span className="font-display font-normal italic">back.</span>
    </h2>
    <p className="mt-3 text-[15px] leading-relaxed text-white/75">
      Your conversations are synced and waiting. Pick up right where you left off.
    </p>
    <div className="mt-6 flex items-center gap-3">
      <div className="flex -space-x-2.5">
        {[1, 2, 3, 4].map((n) => (
          <img key={n} src={`/images/avatars/${n}.jpg`} alt="" className="size-8 rounded-full object-cover ring-2 ring-slate-900" />
        ))}
      </div>
      <p className="text-sm text-white/70">Your friends are online</p>
    </div>
  </div>
);

const Login = () => {
  usePageTitle("Sign in");
  const [, setAuthUser] = useAuth();
  const [serverError, setServerError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm();

  const onSubmit = async (data) => {
    setServerError(""); setIsLoading(true);
    try {
      const res = await axios.post("/api/user/login", { email: data.email, password: data.password }, { withCredentials: true });
      localStorage.setItem("chatUser", JSON.stringify(res.data.user));
      setAuthUser(res.data.user);
    } catch (err) {
      setServerError(err.response?.data?.error || "Login failed. Try again.");
    } finally { setIsLoading(false); }
  };

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Good to see you again. Enter your details to continue."
      image="/images/auth-login.jpg"
      imageAlt="Friends laughing together around a table"
      floating={<Floating />}
      quote={<Quote />}
      footer={
        <>
          New to Kova?{" "}
          <Link to="/signup" className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">Create an account</Link>
        </>
      }
    >
      <Alert type="error" message={serverError} className="mb-6" />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <Input
          label="Email"
          type="email"
          icon={LuMail}
          placeholder="you@example.com"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email", { required: "Email is required" })}
        />
        <Input
          label="Password"
          type="password"
          icon={LuLock}
          placeholder="Enter your password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register("password", { required: "Password is required" })}
        />
        <div className="pt-2">
          <Button type="submit" size="lg" fullWidth loading={isLoading} rightIcon={LuArrowRight} className="rounded-full">
            {isLoading ? "Signing in..." : "Sign in"}
          </Button>
        </div>
      </form>
    </AuthLayout>
  );
};

export default Login;
