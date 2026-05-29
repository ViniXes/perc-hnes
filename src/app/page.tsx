"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  User,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import type { AuthError } from "firebase/auth";

type AuthMode = "login" | "register";

function getAuthErrorMessage(error: unknown) {
  const code = (error as AuthError).code;

  switch (code) {
    case "auth/invalid-email":
      return "Revisa el correo. No parece tener un formato valido.";
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Correo o contrasena incorrectos.";
    case "auth/email-already-in-use":
      return "Ese correo ya tiene una cuenta.";
    case "auth/weak-password":
      return "Usa una contrasena de al menos 6 caracteres.";
    case "auth/configuration-not-found":
      return "Firebase Auth no esta habilitado para este proyecto.";
    default:
      return "No pudimos completar el acceso. Intentalo de nuevo.";
  }
}

export default function Home() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });

    return unsubscribe;
  }, []);

  const welcomeName = useMemo(() => {
    return user?.displayName || user?.email?.split("@")[0] || "Usuario";
  }, [user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await setPersistence(
        auth,
        remember ? browserLocalPersistence : browserSessionPersistence,
      );

      if (mode === "register") {
        const credential = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );

        if (name.trim()) {
          await updateProfile(credential.user, { displayName: name.trim() });
        }
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }

      setPassword("");
    } catch (submitError) {
      setError(getAuthErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSignOut() {
    setError("");
    await signOut(auth);
  }

  return (
    <main className="min-h-screen bg-[#f7f4ee] text-slate-950">
      <section className="grid min-h-screen grid-cols-1 lg:grid-cols-[1fr_460px]">
        <div className="relative flex min-h-[42vh] flex-col justify-between overflow-hidden bg-slate-950 px-6 py-8 text-white sm:px-10 lg:min-h-screen lg:px-14">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(20,184,166,0.22),transparent_30%),linear-gradient(135deg,rgba(248,113,113,0.18),transparent_42%),linear-gradient(160deg,#020617_0%,#0f172a_60%,#111827_100%)]" />
          <div className="relative flex items-center justify-between">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-teal-200">
              PERC HNES
            </p>
            <div className="h-2.5 w-2.5 rounded-full bg-teal-300 shadow-[0_0_24px_rgba(94,234,212,0.9)]" />
          </div>

          <div className="relative max-w-2xl py-14 lg:py-0">
            <p className="mb-4 text-sm font-medium uppercase tracking-[0.2em] text-rose-200">
              Acceso seguro
            </p>
            <h1 className="max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
              Gestiona tu proyecto desde un panel privado.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
              Ingresa con Firebase Auth para preparar el camino de usuarios,
              permisos y datos privados del sistema.
            </p>
          </div>

          <div className="relative grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
            <div className="border-t border-white/15 pt-4">
              <strong className="block text-white">Auth</strong>
              Firebase conectado
            </div>
            <div className="border-t border-white/15 pt-4">
              <strong className="block text-white">Sesion</strong>
              Estado en vivo
            </div>
            <div className="border-t border-white/15 pt-4">
              <strong className="block text-white">Base</strong>
              Lista para roles
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-md">
            {!authReady ? (
              <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
                <div className="h-3 w-28 rounded-full bg-slate-200" />
                <div className="mt-6 h-10 rounded bg-slate-100" />
                <div className="mt-4 h-10 rounded bg-slate-100" />
              </div>
            ) : user ? (
              <section className="rounded-lg border border-slate-200 bg-white p-7 shadow-sm">
                <div className="mb-8 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-teal-700">
                      Sesion activa
                    </p>
                    <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                      Hola, {welcomeName}
                    </h2>
                  </div>
                  <span className="rounded-full bg-teal-100 px-3 py-1 text-xs font-semibold text-teal-800">
                    Online
                  </span>
                </div>

                <div className="space-y-4 rounded-md bg-slate-50 p-4 text-sm text-slate-600">
                  <div>
                    <p className="font-medium text-slate-950">Correo</p>
                    <p>{user.email}</p>
                  </div>
                  <div>
                    <p className="font-medium text-slate-950">UID</p>
                    <p className="break-all font-mono text-xs">{user.uid}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="mt-8 w-full rounded-md bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-300"
                >
                  Cerrar sesion
                </button>
              </section>
            ) : (
              <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <div className="mb-7">
                  <p className="text-sm font-medium text-teal-700">
                    Bienvenido
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                    {mode === "login" ? "Iniciar sesion" : "Crear cuenta"}
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-slate-500">
                    Usa tu correo y contrasena para entrar al proyecto.
                  </p>
                </div>

                <div className="mb-6 grid grid-cols-2 rounded-md bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setError("");
                    }}
                    className={`rounded px-3 py-2 text-sm font-semibold transition ${
                      mode === "login"
                        ? "bg-white text-slate-950 shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Entrar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("register");
                      setError("");
                    }}
                    className={`rounded px-3 py-2 text-sm font-semibold transition ${
                      mode === "register"
                        ? "bg-white text-slate-950 shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Registro
                  </button>
                </div>

                <form className="space-y-5" onSubmit={handleSubmit}>
                  {mode === "register" ? (
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">
                        Nombre
                      </span>
                      <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
                        name="name"
                        placeholder="Tu nombre"
                        type="text"
                      />
                    </label>
                  ) : null}

                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">
                      Correo
                    </span>
                    <input
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
                      name="email"
                      placeholder="correo@empresa.com"
                      required
                      type="email"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">
                      Contrasena
                    </span>
                    <input
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
                      minLength={6}
                      name="password"
                      placeholder="Minimo 6 caracteres"
                      required
                      type="password"
                    />
                  </label>

                  <label className="flex items-center gap-3 text-sm text-slate-600">
                    <input
                      checked={remember}
                      onChange={(event) => setRemember(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                      type="checkbox"
                    />
                    Mantener mi sesion abierta
                  </label>

                  {error ? (
                    <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                      {error}
                    </p>
                  ) : null}

                  <button
                    disabled={isSubmitting}
                    className="w-full rounded-md bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-300 disabled:cursor-not-allowed disabled:bg-slate-400"
                    type="submit"
                  >
                    {isSubmitting
                      ? "Procesando..."
                      : mode === "login"
                        ? "Entrar al proyecto"
                        : "Crear cuenta"}
                  </button>
                </form>
              </section>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
