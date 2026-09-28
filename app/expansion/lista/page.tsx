import { serviceSupabase } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

type RecordRow = {
  id: number;
  created_at: string;
  content: {
    familyName?: string;
    reflection?: string;
    contact?: string;
  } | null;
};

export default async function ExpansionListaPage() {
  const { data, error } = await serviceSupabase()
    .from("records")
    .select("id, created_at, content")
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as RecordRow[];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-16">
      <div className="mx-auto w-full max-w-6xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Lista de reflexiones</h1>
        <p className="mt-2 text-sm text-slate-600">
          Registros enviados desde el formulario de expansion.
        </p>

        {error ? (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Error cargando registros: {error.message}
          </div>
        ) : rows.length === 0 ? (
          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            No hay reflexiones todavia.
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600">
                  <th className="px-3 py-2 font-semibold">Fecha</th>
                  <th className="px-3 py-2 font-semibold">Familia o nucleo</th>
                  <th className="px-3 py-2 font-semibold">Reflexion</th>
                  <th className="px-3 py-2 font-semibold">Contacto</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 align-top">
                    <td className="px-3 py-2 text-slate-600">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-slate-900">
                      {row.content?.familyName?.trim() || "-"}
                    </td>
                    <td className="px-3 py-2 text-slate-900">
                      {row.content?.reflection?.trim() || "-"}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {row.content?.contact?.trim() || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
