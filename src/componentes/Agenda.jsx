import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Pencil, Plus, Search, Trash2, X } from "lucide-react";

const STATUS = ["AGENDADO", "CONFIRMADO", "EM_ATENDIMENTO", "CONCLUIDO", "CANCELADO", "NAO_COMPARECEU"];
const STATUS_LABEL = { AGENDADO: "Agendado", CONFIRMADO: "Confirmado", EM_ATENDIMENTO: "Em atendimento", CONCLUIDO: "Concluído", CANCELADO: "Cancelado", NAO_COMPARECEU: "Não compareceu" };
const STATUS_STYLE = {
  AGENDADO: "border-sky-300 bg-sky-50 text-sky-800", CONFIRMADO: "border-emerald-300 bg-emerald-50 text-emerald-800",
  EM_ATENDIMENTO: "border-amber-300 bg-amber-50 text-amber-800", CONCLUIDO: "border-slate-300 bg-slate-100 text-slate-700",
  CANCELADO: "border-red-300 bg-red-50 text-red-700", NAO_COMPARECEU: "border-violet-300 bg-violet-50 text-violet-800",
};
const inputCls = "app-input w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-red-200";
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const iso = (date) => { const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, "0"); const d = String(date.getDate()).padStart(2, "0"); return `${y}-${m}-${d}`; };
const parseDate = (value) => { const [y, m, d] = value.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (date, amount) => { const next = new Date(date); next.setDate(next.getDate() + amount); return next; };
const addMonths = (date, amount) => { const next = new Date(date); next.setDate(1); next.setMonth(next.getMonth() + amount); return next; };
const startWeek = (date) => addDays(date, -date.getDay());
const monthTitle = (date) => date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
const dayTitle = (date) => date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
const timeToMinutes = (time = "00:00") => { const [h, m] = time.split(":").map(Number); return h * 60 + m; };
const plusMinutes = (time, amount) => { const total = timeToMinutes(time) + amount; return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`; };
const slots = Array.from({ length: 24 }, (_, index) => `${String(index).padStart(2, "0")}:00`);

const emptyForm = (date, time = "09:00") => ({ clienteId: "", servicoId: "", responsavelId: "", data: date, horaInicio: time, horaFim: plusMinutes(time, 60), status: "AGENDADO", observacao: "" });

function EventCard({ item, clientes, servicos, onClick, compact = false }) {
  const cliente = clientes.find((value) => String(value.id) === String(item.clienteId));
  const servico = servicos.find((value) => String(value.id) === String(item.servicoId));
  return <button type="button" onClick={(e) => { e.stopPropagation(); onClick(item); }} className={`w-full rounded-lg border px-2 py-1 text-left text-xs shadow-sm transition hover:shadow ${STATUS_STYLE[item.status] || STATUS_STYLE.AGENDADO}`}>
    <div className="font-bold">{item.horaInicio} {!compact && cliente?.nome}</div>
    {compact ? <div className="truncate">{cliente?.nome || "Cliente"}</div> : <div className="truncate">{servico?.nome || "Serviço"}</div>}
  </button>;
}

function AppointmentModal({ initial, db, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(initial);
  const [clientSearch, setClientSearch] = useState("");
  const [error, setError] = useState("");
  const clientes = useMemo(() => (db.clientes || []).filter((cliente) => `${cliente.nome} ${cliente.telefone || ""} ${cliente.cpfCnpj || ""}`.toLowerCase().includes(clientSearch.toLowerCase())), [db.clientes, clientSearch]);
  const save = () => {
    if (!form.clienteId || !form.servicoId || !form.data || !form.horaInicio || !form.horaFim) return setError("Preencha cliente, serviço, data e horários.");
    if (timeToMinutes(form.horaFim) <= timeToMinutes(form.horaInicio)) return setError("O horário final deve ser posterior ao inicial.");
    const conflict = (db.agendamentos || []).some((item) => item.id !== form.id && item.data === form.data && item.status !== "CANCELADO" && form.status !== "CANCELADO" && String(item.responsavelId || "") === String(form.responsavelId || "") && timeToMinutes(form.horaInicio) < timeToMinutes(item.horaFim) && timeToMinutes(form.horaFim) > timeToMinutes(item.horaInicio));
    if (conflict) return setError(form.responsavelId ? "Este responsável já possui um agendamento neste horário." : "Já existe um agendamento sem responsável neste horário.");
    onSave(form);
  };
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-5" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className="max-h-[94vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-3xl">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
        <div><h2 className="text-lg font-bold text-slate-900">{form.id ? "Editar agendamento" : "Novo agendamento"}</h2><p className="text-xs text-slate-500">Os dados são vinculados aos cadastros existentes.</p></div>
        <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
      </header>
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className="mb-1 block text-sm font-medium text-slate-600">Pesquisar cliente</span><input className={inputCls} value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} placeholder="Nome, telefone ou CPF/CNPJ" /></label>
        <label className="sm:col-span-2"><span className="mb-1 block text-sm font-medium text-slate-600">Cliente *</span><select className={inputCls} value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value })}><option value="">Selecione...</option>{clientes.map((item) => <option key={item.id} value={item.id}>{item.nome}{item.telefone ? ` · ${item.telefone}` : ""}</option>)}</select></label>
        <label><span className="mb-1 block text-sm font-medium text-slate-600">Serviço *</span><select className={inputCls} value={form.servicoId} onChange={(e) => setForm({ ...form, servicoId: e.target.value })}><option value="">Selecione...</option>{(db.servicos || []).map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
        <label><span className="mb-1 block text-sm font-medium text-slate-600">Responsável</span><select className={inputCls} value={form.responsavelId || ""} onChange={(e) => setForm({ ...form, responsavelId: e.target.value })}><option value="">Sem responsável</option>{(db.funcionarios || []).map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
        <label><span className="mb-1 block text-sm font-medium text-slate-600">Data *</span><input type="date" className={inputCls} value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} /></label>
        <div className="grid grid-cols-2 gap-3"><label><span className="mb-1 block text-sm font-medium text-slate-600">Início *</span><input type="time" className={inputCls} value={form.horaInicio} onChange={(e) => setForm({ ...form, horaInicio: e.target.value })} /></label><label><span className="mb-1 block text-sm font-medium text-slate-600">Fim *</span><input type="time" className={inputCls} value={form.horaFim} onChange={(e) => setForm({ ...form, horaFim: e.target.value })} /></label></div>
        <label><span className="mb-1 block text-sm font-medium text-slate-600">Status</span><select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{STATUS.map((item) => <option key={item} value={item}>{STATUS_LABEL[item]}</option>)}</select></label>
        <label className="sm:col-span-2"><span className="mb-1 block text-sm font-medium text-slate-600">Observação</span><textarea rows="3" className={inputCls} value={form.observacao || ""} onChange={(e) => setForm({ ...form, observacao: e.target.value })} /></label>
        {error && <div className="sm:col-span-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      </div>
      <footer className="flex flex-wrap justify-between gap-3 border-t border-slate-200 px-5 py-4">
        <div>{form.id && <button onClick={() => onDelete(form.id)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"><Trash2 size={16} /> Excluir</button>}</div>
        <div className="flex gap-2">{form.id && form.status !== "CANCELADO" && <button onClick={() => setForm({ ...form, status: "CANCELADO" })} className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600">Cancelar agendamento</button>}<button onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600">Fechar</button><button onClick={save} className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800">Salvar</button></div>
      </footer>
    </div>
  </div>;
}

export default function Agenda({ db, update, empresaId }) {
  const [view, setView] = useState("month");
  const [cursor, setCursor] = useState(new Date());
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [modal, setModal] = useState(null);
  const clientes = db.clientes || [], servicos = db.servicos || [];
  const filtered = useMemo(() => (db.agendamentos || []).filter((item) => {
    const cliente = clientes.find((value) => String(value.id) === String(item.clienteId));
    const matches = `${cliente?.nome || ""} ${cliente?.telefone || ""} ${cliente?.cpfCnpj || ""}`.toLowerCase().includes(search.toLowerCase());
    return matches && (!status || item.status === status) && (!responsavel || String(item.responsavelId) === responsavel);
  }), [db.agendamentos, clientes, search, status, responsavel]);
  const byDate = (date) => filtered.filter((item) => item.data === date).sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
  const openNew = (date = iso(cursor), time = "09:00") => setModal(emptyForm(date, time));
  const save = (form) => { const now = new Date().toISOString(); update("agendamentos", (items) => form.id ? items.map((item) => item.id === form.id ? { ...form, updatedAt: now } : item) : [...items, { ...form, id: uid(), empresaId, createdAt: now, updatedAt: now }]); setModal(null); };
  const remove = (id) => { if (window.confirm("Excluir este agendamento? Esta ação não pode ser desfeita.")) { update("agendamentos", (items) => items.filter((item) => item.id !== id)); setModal(null); } };
  const move = (direction) => setCursor(view === "month" ? addMonths(cursor, direction) : addDays(cursor, direction * (view === "week" ? 7 : 1)));
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startWeek(cursor), i));
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1); const gridStart = startWeek(monthStart); const monthDays = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const title = view === "month" ? monthTitle(cursor) : view === "day" ? dayTitle(cursor) : `${weekDays[0].toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – ${weekDays[6].toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}`;
  const selectedClient = search ? clientes.find((c) => `${c.nome} ${c.telefone || ""} ${c.cpfCnpj || ""}`.toLowerCase().includes(search.toLowerCase())) : null;
  const clientItems = selectedClient ? (db.agendamentos || []).filter((a) => String(a.clienteId) === String(selectedClient.id)).sort((a, b) => `${a.data}${a.horaInicio}`.localeCompare(`${b.data}${b.horaInicio}`)) : [];
  const nowKey = `${iso(new Date())}${new Date().toTimeString().slice(0, 5)}`; const next = clientItems.find((a) => `${a.data}${a.horaInicio}` >= nowKey && a.status !== "CANCELADO"); const last = [...clientItems].reverse().find((a) => `${a.data}${a.horaInicio}` < nowKey);

  return <div className="space-y-4">
    <header className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center"><div><h1 className="headline flex items-center gap-2 text-2xl font-bold text-slate-900"><CalendarDays className="text-red-700" /> Agenda</h1><p className="mt-1 text-sm text-slate-500">Organize atendimentos, responsáveis e serviços.</p></div><button onClick={() => openNew()} className="flex items-center justify-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-800"><Plus size={17} /> Novo agendamento</button></header>
    <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3"><label className="relative md:col-span-1"><Search className="absolute left-3 top-3 text-slate-400" size={17} /><input className={`${inputCls} pl-10`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar cliente..." /></label><select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todos os status</option>{STATUS.map((item) => <option key={item} value={item}>{STATUS_LABEL[item]}</option>)}</select><select className={inputCls} value={responsavel} onChange={(e) => setResponsavel(e.target.value)}><option value="">Todos os responsáveis</option>{(db.funcionarios || []).map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></div>
    {selectedClient && <div className="grid gap-3 rounded-2xl border border-red-100 bg-red-50/60 p-4 text-sm sm:grid-cols-3"><div><span className="text-xs font-semibold uppercase text-slate-400">Cliente</span><div className="font-semibold">{selectedClient.nome}</div><div className="text-slate-500">{selectedClient.telefone || "Telefone não informado"}</div></div><div><span className="text-xs font-semibold uppercase text-slate-400">Próximo agendamento</span><div>{next ? `${new Date(`${next.data}T12:00`).toLocaleDateString("pt-BR")} às ${next.horaInicio}` : "Nenhum"}</div></div><div><span className="text-xs font-semibold uppercase text-slate-400">Último agendamento</span><div>{last ? `${new Date(`${last.data}T12:00`).toLocaleDateString("pt-BR")} · ${servicos.find((s) => String(s.id) === String(last.servicoId))?.nome || "Serviço"}` : "Nenhum"}</div></div></div>}
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-3"><div className="flex items-center gap-2"><button onClick={() => setCursor(new Date())} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Hoje</button><button onClick={() => move(-1)} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Anterior"><ChevronLeft size={20} /></button><button onClick={() => move(1)} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Próximo"><ChevronRight size={20} /></button><h2 className="ml-1 capitalize font-bold text-slate-800">{title}</h2></div><div className="flex rounded-xl bg-slate-100 p-1">{[["month", "Mês"], ["week", "Semana"], ["day", "Dia"]].map(([id, label]) => <button key={id} onClick={() => setView(id)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${view === id ? "bg-white text-red-700 shadow-sm" : "text-slate-500"}`}>{label}</button>)}</div></div>
      {view === "month" && <div className="overflow-x-auto"><div className="grid min-w-[680px] grid-cols-7"><>{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => <div key={day} className="border-b border-r border-slate-200 p-2 text-center text-xs font-bold uppercase text-slate-400">{day}</div>)}{monthDays.map((day) => <button key={iso(day)} onClick={() => openNew(iso(day))} className={`min-h-28 border-b border-r border-slate-200 p-1.5 text-left align-top hover:bg-red-50/40 ${day.getMonth() !== cursor.getMonth() ? "bg-slate-50/60 text-slate-400" : ""}`}><span className={`mb-1 inline-grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${iso(day) === iso(new Date()) ? "bg-red-700 text-white" : ""}`}>{day.getDate()}</span><div className="space-y-1">{byDate(iso(day)).slice(0, 3).map((item) => <EventCard key={item.id} item={item} clientes={clientes} servicos={servicos} onClick={setModal} compact />)}{byDate(iso(day)).length > 3 && <div className="px-1 text-xs font-semibold text-slate-500">+{byDate(iso(day)).length - 3} mais</div>}</div></button>)}</></div></div>}
      {view === "week" && <div className="max-h-[68vh] overflow-auto"><div className="grid min-w-[820px] grid-cols-[64px_repeat(7,minmax(105px,1fr))] sticky top-0 z-10 bg-white"><div className="border-b border-r border-slate-200" />{weekDays.map((day) => <div key={iso(day)} className="border-b border-r border-slate-200 p-2 text-center"><div className="text-xs font-bold uppercase text-slate-400">{day.toLocaleDateString("pt-BR", { weekday: "short" })}</div><div className={iso(day) === iso(new Date()) ? "mx-auto mt-1 grid h-8 w-8 place-items-center rounded-full bg-red-700 text-white" : "mt-1 font-bold"}>{day.getDate()}</div></div>)}</div>{slots.map((time) => <div key={time} className="grid min-w-[820px] grid-cols-[64px_repeat(7,minmax(105px,1fr))]"><div className="border-r border-slate-200 pr-2 pt-1 text-right text-[11px] text-slate-400">{time}</div>{weekDays.map((day) => <button key={`${iso(day)}${time}`} onClick={() => openNew(iso(day), time)} className="min-h-16 space-y-1 border-b border-r border-slate-200 p-1 text-left hover:bg-red-50/50">{byDate(iso(day)).filter((item) => item.horaInicio.slice(0, 2) === time.slice(0, 2)).map((item) => <EventCard key={item.id} item={item} clientes={clientes} servicos={servicos} onClick={setModal} compact />)}</button>)}</div>)}</div>}
      {view === "day" && <div className="max-h-[68vh] overflow-auto">{slots.map((time) => <button key={time} onClick={() => openNew(iso(cursor), time)} className="grid min-h-20 w-full grid-cols-[70px_1fr] border-b border-slate-200 text-left hover:bg-red-50/40"><div className="border-r border-slate-200 p-3 text-xs text-slate-400">{time}</div><div className="space-y-1 p-2">{byDate(iso(cursor)).filter((item) => item.horaInicio.slice(0, 2) === time.slice(0, 2)).map((item) => <EventCard key={item.id} item={item} clientes={clientes} servicos={servicos} onClick={setModal} />)}</div></button>)}</div>}
    </section>
    <div className="flex flex-wrap gap-2">{STATUS.map((item) => <span key={item} className={`rounded-full border px-2 py-1 text-xs font-semibold ${STATUS_STYLE[item]}`}>{STATUS_LABEL[item]}</span>)}</div>
    {modal && <AppointmentModal initial={modal} db={db} onClose={() => setModal(null)} onSave={save} onDelete={remove} />}
  </div>;
}
