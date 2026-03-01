"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { loginSchema, LoginFormValues } from "@/lib/validations/auth";
import Button from "@/components/ui/Button";

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setServerError(null);

    try {
      const result = await signIn("credentials", {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      if (result?.error) {
        setServerError("Invalid email or password. Please try again.");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setServerError("An unexpected error occurred. Please try again.");
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Sign in to your account</h2>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {serverError && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3">
            <p className="text-sm text-red-700">{serverError}</p>
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            {...register("email")}
            className={[
              "w-full rounded-md border px-3 py-2 text-sm shadow-sm",
              "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
              "placeholder:text-gray-400",
              errors.email
                ? "border-red-400 bg-red-50"
                : "border-gray-300 bg-white",
            ].join(" ")}
            placeholder="you@example.com"
          />
          {errors.email && (
            <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register("password")}
            className={[
              "w-full rounded-md border px-3 py-2 text-sm shadow-sm",
              "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
              "placeholder:text-gray-400",
              errors.password
                ? "border-red-400 bg-red-50"
                : "border-gray-300 bg-white",
            ].join(" ")}
            placeholder="••••••••"
          />
          {errors.password && (
            <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <input
              id="remember-me"
              name="remember-me"
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
              Remember me
            </label>
          </div>
          <a href="#" className="text-sm text-blue-600 hover:text-blue-500">
            Forgot password?
          </a>
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          isLoading={isSubmitting}
          className="w-full"
        >
          {isSubmitting ? "Signing in..." : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-600">
        Don&apos;t have an account?{" "}
        <a href="/register" className="font-medium text-blue-600 hover:text-blue-500">
          Sign up
        </a>
      </p>
    </div>
  );
}
