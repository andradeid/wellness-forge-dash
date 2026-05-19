import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface BirthDatePickerProps {
  /** ISO date string YYYY-MM-DD or empty */
  value: string;
  onChange: (value: string) => void;
}

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const pad = (n: number) => String(n).padStart(2, "0");

function daysInMonth(year: number, month: number) {
  if (!year || !month) return 31;
  return new Date(year, month, 0).getDate();
}

export function BirthDatePicker({ value, onChange }: BirthDatePickerProps) {
  // Estado local para reter seleções parciais (o pai só recebe quando completo)
  const [y, setY] = useState("");
  const [m, setM] = useState("");
  const [d, setD] = useState("");

  // Sincroniza quando o valor externo mudar (ex.: reset do form)
  useEffect(() => {
    const [yy = "", mm = "", dd = ""] = value ? value.split("-") : [];
    setY(yy);
    setM(mm);
    setD(dd);
  }, [value]);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 120 }, (_, i) => currentYear - i);
  const yearNum = Number(y);
  const monthNum = Number(m);
  const days = Array.from(
    { length: daysInMonth(yearNum, monthNum) },
    (_, i) => i + 1,
  );

  const emit = (yy: string, mm: string, dd: string) => {
    setY(yy);
    setM(mm);
    setD(dd);
    if (yy && mm && dd) onChange(`${yy}-${mm}-${dd}`);
    else onChange("");
  };

  return (
    <div className="grid grid-cols-3 gap-2">
      <Select
        value={d || undefined}
        onValueChange={(v) => emit(y, m, v)}
      >
        <SelectTrigger className="rounded-xl h-11 bg-white border-muted focus:ring-[#e8a04c]/30">
          <SelectValue placeholder="Dia" />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {days.map((day) => (
            <SelectItem key={day} value={pad(day)}>{day}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={m || undefined}
        onValueChange={(v) => {
          const maxDay = daysInMonth(yearNum, Number(v));
          const newDay = d && Number(d) > maxDay ? pad(maxDay) : d;
          emit(y, v, newDay);
        }}
      >
        <SelectTrigger className="rounded-xl h-11 bg-white border-muted focus:ring-[#e8a04c]/30">
          <SelectValue placeholder="Mês" />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {MONTHS.map((name, i) => (
            <SelectItem key={name} value={pad(i + 1)}>{name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={y || undefined}
        onValueChange={(v) => {
          const maxDay = daysInMonth(Number(v), monthNum);
          const newDay = d && Number(d) > maxDay ? pad(maxDay) : d;
          emit(v, m, newDay);
        }}
      >
        <SelectTrigger className="rounded-xl h-11 bg-white border-muted focus:ring-[#e8a04c]/30">
          <SelectValue placeholder="Ano" />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {years.map((year) => (
            <SelectItem key={year} value={String(year)}>{year}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
