export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">PERC HNES</h1>
      <p className="max-w-md text-slate-500 dark:text-slate-400">
        Entorno listo. Empieza a construir editando{" "}
        <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-sm dark:bg-slate-800">
          src/app/page.tsx
        </code>
        .
      </p>
    </main>
  );
}
