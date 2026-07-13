import { forwardRef } from "react";
import { format, differenceInYears } from "date-fns";
import { BrandingDocumentPreview, type BrandingDocData } from "./BrandingDocumentPreview";

export interface ReportPatient {
  name: string;
  birth_date: string | null;
  gender: string | null;
}

export interface ReportMarker {
  marker_name: string;
  marker_value_raw: string | null;
  marker_value: number | null;
  marker_unit: string | null;
  reference_value: string | null;
  classification: string | null;
  analysis: string | null;
  measured_at: string;
}

interface Props {
  branding: BrandingDocData;
  patient: ReportPatient;
  markers: ReportMarker[];
}

function toneClass(c: string | null): string {
  const t = (c ?? "").toLowerCase();
  if (/(crític|critic|grave|severo)/.test(t))
    return "bg-rose-50 text-rose-700 border-rose-200";
  if (/(alto|elevad|acima|alterad|baixo|abaixo|deficien|atenç|atenc|alert)/.test(t))
    return "bg-amber-50 text-amber-700 border-amber-200";
  if (/(normal|adequad|dentro|preserv|esperad|ótim|otim)/.test(t))
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

export const PatientReportPDF = forwardRef<HTMLDivElement, Props>(
  function PatientReportPDF({ branding, patient, markers }, ref) {
    const age = patient.birth_date
      ? differenceInYears(new Date(), new Date(patient.birth_date))
      : null;

    // Group markers by name (latest result per marker)
    const grouped = new Map<string, ReportMarker>();
    for (const m of markers) {
      const prev = grouped.get(m.marker_name);
      if (!prev || prev.measured_at < m.measured_at) grouped.set(m.marker_name, m);
    }
    const latest = Array.from(grouped.values()).sort((a, b) =>
      a.marker_name.localeCompare(b.marker_name, "pt-BR"),
    );

    return (
      <BrandingDocumentPreview
        ref={ref}
        data={branding}
        documentTitle="Laudo de Bioquímica Funcional"
      >
        {/* Patient identification */}
        <section className="mb-6 rounded-md border border-slate-200 bg-slate-50/60 p-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
            Paciente
          </p>
          <p className="text-base font-semibold text-slate-900 mt-1">{patient.name}</p>
          <p className="text-xs text-slate-600 mt-1">
            {patient.birth_date && (
              <>
                Nasc.: {format(new Date(patient.birth_date + "T00:00:00"), "dd/MM/yyyy")}
                {age !== null ? ` · ${age} anos` : ""}
              </>
            )}
            {patient.gender ? ` · ${patient.gender}` : ""}
          </p>
        </section>

        {/* Markers list */}
        {latest.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhum marcador registrado para este paciente.
          </p>
        ) : (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">
              Marcadores avaliados
            </h2>
            <div className="overflow-hidden rounded-md border border-slate-200">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Marcador</th>
                    <th className="text-left px-3 py-2 font-medium">Valor</th>
                    <th className="text-left px-3 py-2 font-medium">Referência</th>
                    <th className="text-left px-3 py-2 font-medium">Classificação</th>
                  </tr>
                </thead>
                <tbody>
                  {latest.map((m) => (
                    <tr key={m.marker_name} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-2 font-medium text-slate-800">
                        {m.marker_name}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {m.marker_value_raw ?? m.marker_value ?? "—"}
                        {m.marker_unit ? (
                          <span className="text-slate-500"> {m.marker_unit}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {m.reference_value ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block rounded border px-1.5 py-0.5 text-[10px] capitalize ${toneClass(
                            m.classification,
                          )}`}
                        >
                          {m.classification ?? "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Clinical analysis (only markers with analysis text) */}
            {latest.some((m) => m.analysis) && (
              <div className="mt-6 space-y-3">
                <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">
                  Interpretação clínica
                </h2>
                {latest
                  .filter((m) => m.analysis)
                  .map((m) => (
                    <div
                      key={`a-${m.marker_name}`}
                      className="rounded-md border border-slate-200 p-3"
                    >
                      <p className="text-[11px] font-semibold text-slate-800">
                        {m.marker_name}
                      </p>
                      <p className="text-[11px] text-slate-600 mt-1 whitespace-pre-line">
                        {m.analysis}
                      </p>
                    </div>
                  ))}
              </div>
            )}
          </section>
        )}
      </BrandingDocumentPreview>
    );
  },
);
