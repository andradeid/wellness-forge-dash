import { forwardRef } from "react";
import { format, differenceInYears } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BrandingDocumentPreview, type BrandingDocData } from "@/components/branding/BrandingDocumentPreview";
import type { ChatMessage } from "@/components/chat/ChatMessageList";
import { cleanProse } from "@/components/chat/ChatMessageList";
import { getAgentLabel } from "@/lib/agent-labels";

interface Patient {
  name: string;
  birth_date: string | null;
  gender: string | null;
}

interface Props {
  branding: BrandingDocData;
  patient: Patient;
  messages: ChatMessage[];
}

/** Remove JSON blocks and preamble headings (mirrors ChatMessageList cleanProse). */
function cleanText(text: string): string {
  if (!text) return "";
  return text
    .replace(/```json\s*[\s\S]*?```/gi, "")
    .replace(/(?:^|\n)\s*json\s*\{[\s\S]*?\}(?=\n|$)/gi, "")
    .replace(/^\s*Parte\s*2\s*[—\-:].*$/gim, "")
    .replace(/^\s*JSON\s*(obrigat[óo]rio|marcadores)?\s*:?\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function toneClass(c: string | null | undefined): string {
  const t = (c ?? "").toLowerCase();
  if (/(crític|critic|grave|severo)/.test(t)) return "bg-rose-50 text-rose-700 border-rose-200";
  if (/(alto|elevad|acima|alterad|baixo|abaixo|deficien|atenç|atenc|alert)/.test(t))
    return "bg-amber-50 text-amber-700 border-amber-200";
  if (/(normal|adequad|dentro|preserv|esperad|ótim|otim)/.test(t))
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

export const ChatConversationPDF = forwardRef<HTMLDivElement, Props>(
  function ChatConversationPDF({ branding, patient, messages }, ref) {
    const age = patient.birth_date
      ? differenceInYears(new Date(), new Date(patient.birth_date))
      : null;

    const visible = messages.filter((m) => m.role === "user" || m.role === "assistant");

    return (
      <BrandingDocumentPreview
        ref={ref}
        data={branding}
        documentTitle="Conversa com a Lumma"
      >
        {/* Patient */}
        <section className="mb-5 rounded-md border border-slate-200 bg-slate-50/60 p-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Paciente</p>
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
          <p className="text-[10px] text-slate-500 mt-2">
            Exportado em {format(new Date(), "dd/MM/yyyy 'às' HH:mm")}
          </p>
        </section>

        {/* Messages */}
        {visible.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma mensagem nesta conversa.</p>
        ) : (
          <section className="space-y-3">
            {visible.map((m) => {
              const isUser = m.role === "user";
              const text = isUser ? m.content : cleanText(m.content);
              const markers = m.structured_data?.markers ?? [];
              if (!text && markers.length === 0 && !(m.attachments && m.attachments.length)) {
                return null;
              }
              return (
                <div
                  key={m.id}
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                  style={{ pageBreakInside: "avoid" }}
                >
                  <div
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-[11px] leading-relaxed border ${
                      isUser
                        ? "bg-[#3d5a4a] text-white border-[#2f4a3c]"
                        : "bg-white text-slate-800 border-slate-200"
                    }`}
                  >
                    <div
                      className={`text-[9px] uppercase tracking-wider mb-1 ${
                        isUser ? "text-white/70" : "text-slate-500"
                      }`}
                    >
                      {isUser
                        ? "Nutricionista"
                        : `Lumma${(() => {
                            const a = getAgentLabel(m.agent_type);
                            return a ? ` · ${a.label}` : "";
                          })()}`}
                    </div>
                    {m.attachments && m.attachments.length > 0 && (
                      <div className={`text-[10px] mb-1 ${isUser ? "text-white/80" : "text-slate-500"}`}>
                        📎 {m.attachments.map((a) => a.name).join(", ")}
                      </div>
                    )}
                    {text && (
                      isUser ? (
                        <div className="whitespace-pre-wrap">{text}</div>
                      ) : (
                        <div className="prose-pdf">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              p: ({ children }) => <p className="mb-1.5 leading-relaxed">{children}</p>,
                              h1: ({ children }) => <h1 className="text-[13px] font-bold mt-2 mb-1">{children}</h1>,
                              h2: ({ children }) => <h2 className="text-[12px] font-bold mt-2 mb-1">{children}</h2>,
                              h3: ({ children }) => <h3 className="text-[11px] font-semibold mt-1.5 mb-1">{children}</h3>,
                              h4: ({ children }) => <h4 className="text-[11px] font-semibold mt-1 mb-0.5">{children}</h4>,
                              ul: ({ children }) => <ul className="list-disc pl-4 my-1 space-y-0.5">{children}</ul>,
                              ol: ({ children }) => <ol className="list-decimal pl-4 my-1 space-y-0.5">{children}</ol>,
                              li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                              em: ({ children }) => <em className="italic">{children}</em>,
                              code: ({ children }) => <code className="px-1 rounded bg-slate-100 text-[10px]">{children}</code>,
                              blockquote: ({ children }) => <blockquote className="border-l-2 border-slate-300 pl-2 italic text-slate-700 my-1">{children}</blockquote>,
                              hr: () => <hr className="my-2 border-slate-200" />,
                              a: ({ children, href }) => <a href={href} className="text-blue-700 underline">{children}</a>,
                              table: ({ children }) => <table className="w-full border border-slate-200 my-1 text-[10px]">{children}</table>,
                              th: ({ children }) => <th className="border border-slate-200 px-1.5 py-0.5 bg-slate-50 text-left font-medium">{children}</th>,
                              td: ({ children }) => <td className="border border-slate-200 px-1.5 py-0.5 align-top">{children}</td>,
                            }}
                          >
                            {text}
                          </ReactMarkdown>
                        </div>
                      )
                    )}
                    {markers.length > 0 && (
                      <div className="mt-2 overflow-hidden rounded border border-slate-200 bg-white">
                        <table className="w-full text-[10px] text-slate-800">
                          <thead className="bg-slate-50 text-slate-600">
                            <tr>
                              <th className="text-left px-2 py-1 font-medium">Marcador</th>
                              <th className="text-left px-2 py-1 font-medium">Valor</th>
                              <th className="text-left px-2 py-1 font-medium">Ref.</th>
                              <th className="text-left px-2 py-1 font-medium">Classif.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {markers.map((mk, i) => (
                              <tr key={i} className="border-t border-slate-100 align-top">
                                <td className="px-2 py-1 font-medium">{mk.name}</td>
                                <td className="px-2 py-1 tabular-nums">
                                  {mk.value ?? "—"}
                                  {mk.unit ? <span className="text-slate-500"> {mk.unit}</span> : null}
                                </td>
                                <td className="px-2 py-1 text-slate-600">{mk.reference ?? "—"}</td>
                                <td className="px-2 py-1">
                                  <span
                                    className={`inline-block rounded border px-1 py-0.5 text-[9px] capitalize ${toneClass(
                                      mk.classification,
                                    )}`}
                                  >
                                    {mk.classification ?? "—"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        <p className="mt-6 text-[9px] text-slate-500 italic border-t border-slate-200 pt-3">
          Análises baseadas nos protocolos de inteligência integrativa da Dra. Ana Paula. A LUMMA é
          uma ferramenta de suporte à decisão — a conduta clínica é de responsabilidade exclusiva do
          nutricionista conforme as normas do CRN.
        </p>
      </BrandingDocumentPreview>
    );
  },
);
