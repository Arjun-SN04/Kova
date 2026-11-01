import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import axios from "axios";
import { LuArrowRight, LuAtSign, LuCheck, LuLoaderCircle, LuLock, LuMail, LuPencil, LuRefreshCw, LuShieldCheck, LuUser, LuX, LuZap } from "react-icons/lu";
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


// Free usernames based on the name typed above, plus a live "available / taken" check
const UsernameHelper = ({ name, email, value, onPick }) => {
  const [ideas, setIdeas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [round, setRound] = useState(0);
  const [status, setStatus] = useState(null); // { username, ok, text }
  const reqId = useRef(0);

  // Suggestions follow the name (wait until typing stops)
  useEffect(() => {
    const n = name.trim();
    if (n.length < 2 && !email.includes("@")) { setIdeas([]); return; }
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await axios.get("/api/user/username-suggestions", { params: { name: n, email } });
        if (id === reqId.current) setIdeas(res.data.suggestions || []);
      } catch { /* suggestions are optional */ }
      finally { if (id === reqId.current) setLoading(false); }
    }, 450);
    return () => clearTimeout(t);
  }, [name, email, round]);

  // Is what they typed free?
  useEffect(() => {
    const u = normalizeUsername(value);
    if (u.length < 3) { setStatus(null); return; }
    const t = setTimeout(async () => {
      const result = await checkUsernameFree(u);
      setStatus({ username: u, ok: result === true, text: result === true ? `@${u} is available` : result });
    }, 400);
    return () => clearTimeout(t);
  }, [value]);

  const current = normalizeUsername(value);
  const shown = status && status.username === current;
  if (!ideas.length && !shown) return null;

  return (
    <div className="-mt-1.5 space-y-2">
      {shown && (
        <p className={`flex items-center gap-1.5 text-xs font-medium ${status.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
          {status.ok ? <LuCheck className="size-3.5" /> : <LuX className="size-3.5" />} {status.text}
        </p>
      )}
      {ideas.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-xs text-slate-500 dark:text-slate-400">Available:</span>
          {ideas.map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => onPick(u)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                u === current
                  ? "bg-indigo-600 text-white"
                  : "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20 dark:hover:bg-indigo-500/20"
              }`}
            >
              @{u}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setRound((r) => r + 1)}
            disabled={loading}
            title="More ideas"
            aria-label="More username ideas"
            className="flex size-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
          >
            {loading ? <LuLoaderCircle className="size-3.5 animate-spin" /> : <LuRefreshCw className="size-3.5" />}
          </button>
        </div>
      )}
    </div>
  );
};

const Signup = () => {
  usePageTitle("Create account");
  const [, setAuthUser] = useAuth();
  const [serverError, setServerError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm();
  const password = watch("password", "");
  const fullName = watch("fullname", "");
  const email = watch("email", "");
  const username = watch("username", "");

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
        <UsernameHelper
          name={fullName}
          email={email}
          value={username}
          onPick={(u) => setValue("username", u, { shouldValidate: true, shouldDirty: true })}
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
