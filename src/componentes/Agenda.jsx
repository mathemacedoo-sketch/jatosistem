import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react";

const inputCls = "app-input w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-red-200";
const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const addDays = (date, amount) => { const next = new Date(date); next.setDate(next.getDate() + amount); return next; };
const addMonths = (date, amount) => { const next = new Date(date); next.setDate(1); next.setMonth(next.getMonth() + amount); return next; };
const startWeek = (date) => addDays(date, -date.getDay());
const plusHour = (time) => `${String((Number(time.slice(0, 2)) + 1) % 24).padStart(2, "0")}:00`;
const slots = Array.from({ length: 24 }, (_, index) => `${String(index).padStart(2, "0")}:00`);

function OSCard({ ordem, onOpen, compact = false }) {
  const servicos = (ordem.itens || []).filter((item) => item.tipo === "servico").map((item) => item.descricao || item.nome).join(", ");
  const concluida = ordem.statusOS === "concluido";
  const pago = concluida && ordem.statusPagamento === "pago";
  const estilo = concluida ? (pago ? "border-emerald-300 bg-emerald-50 text-emerald-900 hover:border-emerald-400" : "border-sky-300 bg-sky-50 text-sky-900 hover:border-sky-400") : "border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-400";
  const situacao = concluida ? (pago ? "Concluída · Paga" : "Concluída · A receber") : "Carteira";
  return <button type="button" onClick={(event) => { event.stopPropagation(); onOpen(ordem); }} className={`w-full rounded-lg border px-2 py-1 text-left text-xs shadow-sm hover:shadow ${estilo}`}>
    <div className="font-bold">{ordem.horaInicio || "Sem horário"} · OS #{ordem.numero}</div>
    <div className="truncate font-medium">{ordem.clienteNome || "Cliente"}</div>
    {ordem.placa && <div className="truncate font-semibold">Placa: {ordem.placa}</div>}
    {!compact && <div className="truncate">{servicos || "Ordem de serviço"}</div>}
    <div className="mt-0.5 text-[10px] font-bold uppercase opacity-75">{situacao}</div>
  </button>;
}

export default function Agenda({ db, onCreateOS, onOpenOS }) {
  const [view, setView] = useState("month");
  const [cursor, setCursor] = useState(new Date());
  const [search, setSearch] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [clientesAbertos, setClientesAbertos] = useState(false);
  const [responsavel, setResponsavel] = useState("");
  const ordens = useMemo(() => (db.ordens || []).filter((ordem) => {
    if (ordem.lancamentoManual || !["pendente", "concluido"].includes(ordem.statusOS) || !ordem.dataProgramada) return false;
    return (!clienteId || String(ordem.clienteId) === String(clienteId)) && (!responsavel || String(ordem.funcionarioId || "") === responsavel);
  }), [db.ordens, clienteId, responsavel]);
  const clientesFiltrados = useMemo(() => {
    const termo = search.trim().toLowerCase();
    const numeros = termo.replace(/\D/g, "");
    return (db.clientes || []).filter((cliente) => {
      const texto = `${cliente.nome || ""} ${cliente.telefone || ""} ${cliente.cpfCnpj || ""}`.toLowerCase();
      return !termo || texto.includes(termo) || (numeros.length >= 3 && texto.replace(/\D/g, "").includes(numeros));
    }).sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
  }, [db.clientes, search]);
  const byDate = (date) => ordens.filter((ordem) => ordem.dataProgramada === date).sort((a, b) => (a.horaInicio || "99:99").localeCompare(b.horaInicio || "99:99"));
  const create = (data = iso(cursor), horaInicio = "09:00") => onCreateOS({ data, horaInicio, horaFim: plusHour(horaInicio) });
  const move = (amount) => setCursor(view === "month" ? addMonths(cursor, amount) : addDays(cursor, amount * (view === "week" ? 7 : 1)));
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(startWeek(cursor), index));
  const monthDays = Array.from({ length: 42 }, (_, index) => addDays(startWeek(new Date(cursor.getFullYear(), cursor.getMonth(), 1)), index));
  const title = view === "month" ? cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) : view === "day" ? cursor.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }) : `${weekDays[0].toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – ${weekDays[6].toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}`;
  const cards = (date, hour, compact = false) => byDate(date).filter((ordem) => !hour || ordem.horaInicio?.slice(0, 2) === hour.slice(0, 2)).map((ordem) => <OSCard key={ordem.id} ordem={ordem} onOpen={onOpenOS} compact={compact} />);
  const withoutTime = (date, compact = false) => byDate(date).filter((ordem) => !ordem.horaInicio).map((ordem) => <OSCard key={ordem.id} ordem={ordem} onOpen={onOpenOS} compact={compact} />);

  return <div className="space-y-4">
    <header className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center"><div><h1 className="headline flex items-center gap-2 text-2xl font-bold text-slate-900"><CalendarDays className="text-red-700" /> Agenda de OS</h1><p className="mt-1 text-sm text-slate-500">Ordens programadas em Carteira ou concluídas aparecem diretamente no calendário.</p></div><button onClick={() => create()} className="flex items-center justify-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800"><Plus size={17} /> Nova OS programada</button></header>
    <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2"><div className="relative z-20"><Search className="absolute left-3 top-3 text-slate-400" size={17} /><input className={`${inputCls} pl-10 pr-10`} value={search} onFocus={() => setClientesAbertos(true)} onChange={(e) => { setSearch(e.target.value); setClienteId(""); setClientesAbertos(true); }} placeholder="Clique para escolher um cliente..." />{(search || clienteId) && <button type="button" onClick={() => { setSearch(""); setClienteId(""); setClientesAbertos(false); }} className="absolute right-2 top-2 rounded-lg p-1 text-slate-400 hover:bg-slate-100" title="Limpar cliente"><X size={18} /></button>}{clientesAbertos && <div className="absolute left-0 right-0 top-full mt-2 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">{clientesFiltrados.length ? clientesFiltrados.map((cliente) => <button type="button" key={cliente.id} onClick={() => { setClienteId(String(cliente.id)); setSearch(cliente.nome || ""); setClientesAbertos(false); }} className={`w-full rounded-lg px-3 py-2.5 text-left hover:bg-red-50 ${String(cliente.id) === clienteId ? "bg-red-50 text-red-800" : "text-slate-700"}`}><div className="text-sm font-semibold">{cliente.nome}</div><div className="text-xs text-slate-400">{[cliente.telefone, cliente.cpfCnpj].filter(Boolean).join(" · ") || "Sem telefone ou documento"}</div></button>) : <div className="p-5 text-center text-sm text-slate-400">Nenhum cliente encontrado.</div>}</div>}</div><select className={inputCls} value={responsavel} onChange={(e) => setResponsavel(e.target.value)}><option value="">Todos os responsáveis</option>{(db.funcionarios || []).map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></div>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-3"><div className="flex items-center gap-2"><button onClick={() => setCursor(new Date())} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Hoje</button><button onClick={() => move(-1)} className="rounded-lg p-2 hover:bg-slate-100"><ChevronLeft size={20} /></button><button onClick={() => move(1)} className="rounded-lg p-2 hover:bg-slate-100"><ChevronRight size={20} /></button><h2 className="ml-1 capitalize font-bold text-slate-800">{title}</h2></div><div className="flex rounded-xl bg-slate-100 p-1">{[["month", "Mês"], ["week", "Semana"], ["day", "Dia"]].map(([id, label]) => <button key={id} onClick={() => setView(id)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${view === id ? "bg-white text-red-700 shadow-sm" : "text-slate-500"}`}>{label}</button>)}</div></div>
      {view === "month" && <div className="overflow-x-auto"><div className="grid min-w-[680px] grid-cols-7">{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => <div key={day} className="border-b border-r border-slate-200 p-2 text-center text-xs font-bold uppercase text-slate-400">{day}</div>)}{monthDays.map((day) => <button key={iso(day)} onClick={() => create(iso(day))} className={`min-h-28 border-b border-r border-slate-200 p-1.5 text-left hover:bg-red-50/40 ${day.getMonth() !== cursor.getMonth() ? "bg-slate-50/60 text-slate-400" : ""}`}><span className={`mb-1 inline-grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${iso(day) === iso(new Date()) ? "bg-red-700 text-white" : ""}`}>{day.getDate()}</span><div className="space-y-1">{cards(iso(day), null, true).slice(0, 3)}{byDate(iso(day)).length > 3 && <div className="px-1 text-xs font-semibold text-slate-500">+{byDate(iso(day)).length - 3} mais</div>}</div></button>)}</div></div>}
      {view === "week" && <div className="max-h-[68vh] overflow-auto"><div className="sticky top-0 z-10 grid min-w-[820px] grid-cols-[64px_repeat(7,minmax(105px,1fr))] bg-white"><div className="border-b border-r border-slate-200" />{weekDays.map((day) => <div key={iso(day)} className="border-b border-r border-slate-200 p-2 text-center"><div className="text-xs font-bold uppercase text-slate-400">{day.toLocaleDateString("pt-BR", { weekday: "short" })}</div><div className="mt-1 font-bold">{day.getDate()}</div></div>)}</div><div className="grid min-w-[820px] grid-cols-[64px_repeat(7,minmax(105px,1fr))] bg-slate-50"><div className="border-b border-r border-slate-200 p-2 text-[10px] font-bold uppercase text-slate-400">Sem horário</div>{weekDays.map((day) => <div key={`all-${iso(day)}`} className="min-h-12 space-y-1 border-b border-r border-slate-200 p-1">{withoutTime(iso(day), true)}</div>)}</div>{slots.map((time) => <div key={time} className="grid min-w-[820px] grid-cols-[64px_repeat(7,minmax(105px,1fr))]"><div className="border-r border-slate-200 pr-2 pt-1 text-right text-[11px] text-slate-400">{time}</div>{weekDays.map((day) => <button key={`${iso(day)}${time}`} onClick={() => create(iso(day), time)} className="min-h-16 space-y-1 border-b border-r border-slate-200 p-1 text-left hover:bg-red-50/50">{cards(iso(day), time, true)}</button>)}</div>)}</div>}
      {view === "day" && <div className="max-h-[68vh] overflow-auto"><div className="grid min-h-16 grid-cols-[70px_1fr] border-b border-slate-200 bg-slate-50"><div className="border-r border-slate-200 p-2 text-[10px] font-bold uppercase text-slate-400">Sem horário</div><div className="space-y-1 p-2">{withoutTime(iso(cursor))}</div></div>{slots.map((time) => <button key={time} onClick={() => create(iso(cursor), time)} className="grid min-h-20 w-full grid-cols-[70px_1fr] border-b border-slate-200 text-left hover:bg-red-50/40"><div className="border-r border-slate-200 p-3 text-xs text-slate-400">{time}</div><div className="space-y-1 p-2">{cards(iso(cursor), time)}</div></button>)}</div>}
    </section>
  </div>;
}
