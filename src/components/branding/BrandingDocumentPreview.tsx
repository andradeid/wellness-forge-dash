import { forwardRef, type ReactNode } from "react";
import lummaSymbol from "@/assets/lumma-symbol.svg";

export interface BrandingDocData {
  pronoun?: string | null;
  full_name?: string | null;
  professional_id?: string | null;
  clinic_name?: string | null;
  clinic_logo_url?: string | null;
  email?: string | null;
  phone?: string | null;
}

interface Props {
  data: BrandingDocData;
  children?: ReactNode;
  /** Title shown in the body — e.g., "Análise clínica" */
  documentTitle?: string;
  /**
   * When true, removes fixed A4 min-height and the 170mm minimum body height.
   * Used for multi-page exports (like full conversations) where forcing a single
   * A4 sheet creates large empty gaps. Defaults to false to preserve the
   * single-page look of receipts/reports.
   */
  fluid?: boolean;
}

/**
 * A4 (210x297mm) document preview. Used both for the live preview in
 * Settings → Branding and as the base layout for "Gerar PDF Profissional".
 */
export const BrandingDocumentPreview = forwardRef<HTMLDivElement, Props>(
  function BrandingDocumentPreview({ data, children, documentTitle, fluid }, ref) {
    const displayName = [data.pronoun, data.full_name].filter(Boolean).join(" ") || "Seu nome aqui";
    const today = new Date().toLocaleDateString("pt-BR");

    return (
      <div
        ref={ref}
        className="mx-auto bg-white text-slate-900 shadow-md print:shadow-none"
        style={{
          width: "210mm",
          ...(fluid ? {} : { minHeight: "297mm" }),
          padding: "20mm 18mm",
          boxSizing: "border-box",
        }}
      >
        {/* Header: Logo + clinic */}
        <header className="flex items-center justify-between gap-6 pb-5 border-b border-slate-200">
          <div className="flex items-center gap-4 min-w-0">
            {data.clinic_logo_url ? (
              <img
                src={data.clinic_logo_url}
                alt={data.clinic_name ?? "Logotipo"}
                className="h-16 w-16 object-contain"
              />
            ) : (
              <div className="h-16 w-16 rounded-lg bg-gradient-to-br from-[#e8a04c]/15 to-[#e89bcf]/15 flex items-center justify-center">
                <img src={lummaSymbol} alt="" className="h-8 w-8 opacity-60" />
              </div>
            )}
            <div className="min-w-0">
              <p
                className="text-xl truncate"
                style={{ fontFamily: "'Instrument Serif', serif" }}
              >
                {data.clinic_name || "Nome da clínica"}
              </p>
              <p className="text-xs text-slate-500">Atendimento nutricional integrativo</p>
            </div>
          </div>
          <div className="text-right text-[10px] text-slate-500">
            <div>Documento emitido em</div>
            <div className="font-medium text-slate-700">{today}</div>
          </div>
        </header>

        {/* Body */}
        <main className={fluid ? "py-8" : "py-8 min-h-[170mm]"}>
          {documentTitle && (
            <h1
              className="text-2xl mb-4 bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] bg-clip-text text-transparent"
              style={{ fontFamily: "'Instrument Serif', serif" }}
            >
              {documentTitle}
            </h1>
          )}
          {children ?? (
            <div className="space-y-3 text-sm text-slate-500">
              <p>
                Este é um exemplo de como sua análise clínica aparecerá quando exportada em PDF.
                O conteúdo gerado pela Lumma será inserido aqui automaticamente.
              </p>
              <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-xs">
                Conteúdo da análise · marcadores · interpretação clínica
              </div>
            </div>
          )}
        </main>

        {/* Footer: professional identity */}
        <footer className="pt-5 border-t border-slate-200 text-[11px] text-slate-600">
          <div className="flex items-end justify-between gap-6">
            <div>
              <p className="font-medium text-slate-800 text-sm">{displayName}</p>
              {data.professional_id && (
                <p className="text-slate-500">{data.professional_id}</p>
              )}
            </div>
            <div className="text-right text-slate-500">
              {data.email && <div>{data.email}</div>}
              {data.phone && <div>{data.phone}</div>}
            </div>
          </div>
          <p className="mt-3 text-center text-[9px] text-slate-400 uppercase tracking-[0.18em]">
            Gerado com Lumma · Inteligência clínica integrativa
          </p>
        </footer>
      </div>
    );
  },
);
