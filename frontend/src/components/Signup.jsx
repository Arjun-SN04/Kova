import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import axios from "axios";
import { LuArrowRight, LuAtSign, LuLock, LuMail, LuPencil, LuShieldCheck, LuUser, LuZap } from "react-icons/lu";
import { useAuth } from "../context/AuthProvider";
import AuthLayout, { FloatCard } from "./AuthLayout";
import { Alert, Button, Input } from "./ui";
import usePageTitle from "../hooks/usePageTitle";
import { checkUsernameFree, normalizeUsername, USERNAME_RULES } from "../utils/contacts";

const Floating = () => (
  <>
    <FloatCard className="right-10 top-10" delay={0.5}>
      <div className="flex items-center gap-3 rounded-2xl border border-white/20 bg-white/90 p-3 pr-5 shadow-2xl backdrop-blur-xl">
        <div className="flex -space-x-2">
          {[5, 6, 7].map((n) => (
            <img key={n} src={`/images/avatars/${n}.jpg`} alt="" className="size-8 rounded-full object-cover ring-2 ring-white" />
          ))}
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Study group</p>
          <p className="text-xs text-emerald-600">3 online now</p>
        </div>
      </div>
    </FloatCard>
    <FloatCard className="left-10 top-40" delay={0.9}>
      <div className="space-y-2">
        {[[LuZap, "Instant delivery"], [LuPencil, "Edit & delete messages"], [LuShieldCheck, "Secure sessions"]].map(([Icon, label]) => (
          <div key={label} className="flex w-fit items-center gap-2.5 rounded-full border border-white/20 bg-white/15 py-2 pl-2 pr-4 text-sm text-white shadow-lg backdrop-blur-xl">
            <span className="flex size-7 items-center justify-center rounded-full bg-white text-indigo-600"><Icon className="size-3.5" /></span>
            {label}
          </div>
        ))}
      </div>
    </FloatCard>
  </>
);

const Quote = () => (
  <div className="max-w-md text-white">
    <h2 className="text-4xl font-semibold leading-tight tracking-[-0.03em]">
      Bring your people <span className="font-display font-normal italic">together.</span>
    </h2>
    <p className="mt-3 text-[15px] leading-relaxed text-white/75">
      Friends, teams, study groups. One fast, simple place to talk. Free forever.
    </p>
  </div>
);

const Signup = () => {
  usePageTitle("Create account");
  const [, setAuthUser] = useAuth();
  const [serverError, setServerError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { register, handleSubmit, watch, formState: { errors } } = useForm();
  const password = watch("password", "");

  const onSubmit = async (data) => {
    setServerError(""); setIsLoading(true);
    try {
      const res = await axios.post("/api/user/signup", {
        fullName: data.fullname, email: data.email, username: normalizeUsername(data.username),
        password: data.password, confirmPassword: data.confirmPassword,
      }, { withCredentials: true });
      const user = res.data.newUser;
      localStorage.setItem("chatUser", JSON.stringify(user));
      setAuthUser(user);
    } catch (err) {
      setServerError(err.response?.data?.error || "Signup failed. Try again.");
    } finally { setIsLoading(false); }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start chatting in less than a minute. No credit card needed."
      image="/images/auth-signup.jpg"
      imageAlt="Friends hugging and laughing outdoors"
      floating={<Floating />}
      quote={<Quote />}
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">Sign in</Link>
        </>
      }
    >
      <Alert type="error" message={serverError} className="mb-6" />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Input
          label="Full name"
          icon={LuUser}
          placeholder="Jane Cooper"
          autoComplete="name"
          error={errors.fullname?.message}
          {...register("fullname", { required: "Full name is required" })}
        />
        <Input
          label="Username"
          icon={LuAtSign}
          placeholder="janecooper"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          hint={`How friends find you. ${USERNAME_RULES}.`}
          error={errors.username?.message}
          {...register("username", {
            required: "Pick a username",
            setValueAs: normalizeUsername,
            validate: (v) => checkUsernameFree(v),
          })}
        />
        <Input
          label="Email"
          type="email"
          icon={LuMail}
          placeholder="you@example.com"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email", { required: "Email is required" })}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Password"
            type="password"
            icon={LuLock}
            placeholder="6+ characters"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register("password", { required: "Password is required", minLength: { value: 6, message: "Minimum 6 characters" } })}
          />
          <Input
            label="Confirm"
            type="password"
            icon={LuLock}
            placeholder="Repeat it"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register("confirmPassword", { required: "Please confirm", validate: (v) => v === password || "Doesn't match" })}
          />
        </div>
        <div className="pt-3">
          <Button type="submit" size="lg" fullWidth loading={isLoading} rightIcon={LuArrowRight} className="rounded-full">
            {isLoading ? "Creating account..." : "Create account"}
          </Button>
        </div>
        <p className="text-center text-xs text-slate-400 dark:text-slate-500">By signing up you agree to be kind to everyone you chat with.</p>
      </form>
    </AuthLayout>
  );
};

export default Signup;
