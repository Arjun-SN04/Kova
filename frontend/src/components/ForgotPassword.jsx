import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { LuArrowRight, LuLock, LuMail } from "react-icons/lu";
import AuthLayout from "./AuthLayout";
import { Alert, Button, Input } from "./ui";
import { OtpInput } from "./security/SecurityUI";
import usePageTitle from "../hooks/usePageTitle";

const Quote = () => (
  <div className="max-w-md text-white">
    <h2 className="text-4xl font-semibold leading-tight tracking-[-0.03em]">
      Happens to <span className="font-display font-normal italic">everyone.</span>
    </h2>
    <p className="mt-3 text-[15px] leading-relaxed text-white/75">
      We’ll email you a code so you can choose a new password. Your chats stay exactly as they are.
    </p>
  </div>
);

// Forgot the login password: email a 6-digit code, then choose a new password
const ForgotPassword = () => {
  usePageTitle("Reset password");
  const navigate = useNavigate();
  const [step, setStep] = useState("email"); // email | code
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (e) => {
    e?.preventDefault();
    setBusy(true); setError(""); setInfo("");
    try {
      const res = await axios.post("/api/user/forgot-password", { email });
      setSentTo(res.data.sentTo); setStep("code"); setOtp("");
      if (step === "code") setInfo("We sent a new code.");
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't send the email. Try again.");
    } finally { setBusy(false); }
  };

  const reset = async (e) => {
    e.preventDefault();
    if (password !== again) { setError("The passwords don't match"); return; }
    setBusy(true); setError("");
    try {
      await axios.post("/api/user/reset-password", { email, otp, password });
      navigate("/login", { state: { notice: "Password changed. Sign in with your new password." } });
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't reset it. Try again.");
    } finally { setBusy(false); }
  };

  return (
    <AuthLayout
      title={step === "email" ? "Forgot password?" : "Check your email"}
      subtitle={step === "email"
        ? "Enter the email you signed up with and we’ll send you a 6-digit code."
        : <>If an account uses this email, we sent a code to <span className="font-medium text-slate-900 dark:text-white">{sentTo}</span>. It expires in 10 minutes.</>}
      image="/images/auth-login.jpg"
      imageAlt="Friends laughing together around a table"
      quote={<Quote />}
      footer={<>Remembered it? <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">Back to sign in</Link></>}
    >
      <Alert type="error" message={error} className="mb-6" />
      <Alert type="success" message={info} className="mb-6" />
      {step === "email" ? (
        <form onSubmit={send} className="space-y-5" noValidate>
          <Input label="Email" type="email" icon={LuMail} placeholder="you@example.com" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          <Button type="submit" size="lg" fullWidth loading={busy} disabled={!email.trim()} rightIcon={LuArrowRight} className="rounded-full">
            {busy ? "Sending..." : "Send code"}
          </Button>
        </form>
      ) : (
        <form onSubmit={reset} className="space-y-5" noValidate>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">6-digit code</p>
            <OtpInput value={otp} onChange={setOtp} />
          </div>
          <Input label="New password" type="password" icon={LuLock} placeholder="At least 8 characters" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Input label="Confirm new password" type="password" icon={LuLock} placeholder="Type it again" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)}
            error={again && again !== password ? "Doesn't match" : undefined} />
          <Button type="submit" size="lg" fullWidth loading={busy} disabled={otp.length !== 6 || password.length < 8 || password !== again} className="rounded-full">
            {busy ? "Saving..." : "Set new password"}
          </Button>
          <p className="text-center text-sm text-slate-500 dark:text-slate-400">
            Didn’t get it? Check spam, or{" "}
            <button type="button" onClick={send} disabled={busy} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">send a new code</button>
            {" · "}
            <button type="button" onClick={() => { setStep("email"); setError(""); setInfo(""); }} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">change email</button>
          </p>
        </form>
      )}
    </AuthLayout>
  );
};

export default ForgotPassword;
