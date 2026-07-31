import { useState, useEffect, useRef, useMemo } from "react";
import {
  LayoutDashboard, FilePlus2, ClipboardList, Users, Sparkles, Boxes,
  Wallet, Landmark, Trash2, CheckCircle2, AlertTriangle, Plus, X,
  Droplets, TrendingUp, TrendingDown, Search
} from "lucide-react";

// ---------- helpers ----------
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayISO = () => new Date().toISOString().slice(0, 10);
const brl = (v) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d) => {
  if (!d) return "-";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};
const monthKey = (d) => (d || "").slice(0, 7);

const SEED = {
  clientes: [
    { id: uid(), nome: "Cliente Avulso", telefone: "", veiculo: "", placa: "" },
  ],
  servicos: [
    { id: uid(), nome: "Lavagem Simples", preco: 30 },
    { id: uid(), nome: "Lavagem Completa", preco: 50 },
    { id: uid(), nome: "Enceramento", preco: 70 },
    { id: uid(), nome: "Higienização Interna", preco: 120 },
  ],
  produtos: [
    { id: uid(), nome: "Shampoo Automotivo", unidade: "L", quantidade: 10, estoqueMinimo: 3, precoCusto: 12, precoVenda: 0 },
    { id: uid(), nome: "Cera Automotiva", unidade: "un", quantidade: 5, estoqueMinimo: 2, precoCusto: 25, precoVenda: 0 },
    { id: uid(), nome: "Aromatizante", unidade: "un", quantidade: 8, estoqueMinimo: 3, precoCusto: 6, precoVenda: 15 },
  ],
  ordens: [],
  contasPagar: [],
};

const STORAGE_KEY = "lavajato_db_v1";

// ---------- small UI primitives ----------
function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-slate-600 font-medium">{label}</span>
      {children}
    </label>
  );
}
const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 bg-white";

function Card({ children, className = "" }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function Badge({ tone = "slate", children }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-700",
    cyan: "bg-cyan-100 text-cyan-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

function EmptyState({ text }) {
  return (
    <div className="text-center py-10 text-slate-400 text-sm">{text}</div>
  );
}

// ---------- App ----------
export default function App() {
  const [db, setDb] = useState(SEED);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const saveTimer = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          setDb({ ...SEED, ...parsed });
        }
      } catch (e) {
        // no data yet, keep SEED
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await window.storage.set(STORAGE_KEY, JSON.stringify(db), false);
      } catch (e) {
        console.error("Erro ao salvar dados", e);
      }
    }, 400);
    return () => clearTimeout(saveTimer.current);
  }, [db, loaded]);

  const update = (key, updater) =>
    setDb((prev) => ({ ...prev, [key]: updater(prev[key]) }));

  // ---- derived numbers ----
  const stats = useMemo(() => {
    const mk = monthKey(todayISO());
    const receitaMes = db.ordens
      .filter((o) => monthKey(o.data) === mk)
      .reduce((s, o) => s + (o.statusPagamento === "pago" ? o.total : o.valorPago || 0), 0);
    const aReceber = db.ordens
      .filter((o) => o.statusPagamento !== "pago")
      .reduce((s, o) => s + (o.total - (o.valorPago || 0)), 0);
    const aPagar = db.contasPagar
      .filter((c) => c.status === "pendente")
      .reduce((s, c) => s + Number(c.valor || 0), 0);
    const estoqueBaixo = db.produtos.filter((p) => Number(p.quantidade) <= Number(p.estoqueMinimo));
    return { receitaMes, aReceber, aPagar, estoqueBaixo };
  }, [db]);

  const NAV = [
    { id: "dashboard", label: "Painel", icon: LayoutDashboard },
    { id: "nova-os", label: "Nova OS", icon: FilePlus2 },
    { id: "ordens", label: "Ordens de Serviço", icon: ClipboardList },
    { id: "clientes", label: "Clientes", icon: Users },
    { id: "servicos", label: "Serviços", icon: Sparkles },
    { id: "estoque", label: "Estoque", icon: Boxes },
    { id: "receber", label: "Contas a Receber", icon: Wallet },
    { id: "pagar", label: "Contas a Pagar", icon: Landmark },
  ];

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-800 flex" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');
        .headline { font-family: 'Space Grotesk', system-ui, sans-serif; }
      `}</style>

      {/* Sidebar */}
      <aside className="w-64 shrink-0 bg-[#0B1F3A] text-white flex flex-col">
        <div className="px-5 pt-6 pb-4 flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
            <Droplets size={20} className="text-white" />
          </div>
          <div>
            <div className="headline font-bold text-lg leading-tight">Lava Jato</div>
            <div className="text-[11px] text-cyan-300 tracking-wide uppercase">Gestão do negócio</div>
          </div>
        </div>
        <svg viewBox="0 0 256 12" className="w-full" preserveAspectRatio="none" style={{ height: 10 }}>
          <path d="M0,6 C40,0 80,12 120,6 C160,0 200,12 256,6 L256,12 L0,12 Z" fill="url(#wave)" />
          <defs>
            <linearGradient id="wave" x1="0" x2="1">
              <stop offset="0%" stopColor="#22D3EE" />
              <stop offset="100%" stopColor="#2563EB" />
            </linearGradient>
          </defs>
        </svg>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = tab === n.id;
            return (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                  active
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon size={17} />
                {n.label}
                {n.id === "estoque" && stats.estoqueBaixo.length > 0 && (
                  <span className="ml-auto bg-amber-400 text-[#0B1F3A] text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {stats.estoqueBaixo.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="px-5 py-4 text-[11px] text-slate-400 border-t border-white/10">
          Dados salvos automaticamente
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6 md:p-8">
          {tab === "dashboard" && <Dashboard db={db} stats={stats} setTab={setTab} />}
          {tab === "nova-os" && <NovaOS db={db} update={update} setTab={setTab} />}
          {tab === "ordens" && <Ordens db={db} update={update} />}
          {tab === "clientes" && <Clientes db={db} update={update} />}
          {tab === "servicos" && <Servicos db={db} update={update} />}
          {tab === "estoque" && <Estoque db={db} update={update} />}
          {tab === "receber" && <ContasReceber db={db} update={update} />}
          {tab === "pagar" && <ContasPagar db={db} update={update} />}
        </div>
      </main>
    </div>
  );
}

// ---------- Dashboard ----------
function Dashboard({ db, stats, setTab }) {
  const ultimasOrdens = [...db.ordens].sort((a, b) => (a.data < b.data ? 1 : -1)).slice(0, 6);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="headline text-2xl font-bold text-slate-900">Painel geral</h1>
        <p className="text-slate-500 text-sm mt-1">Visão rápida do seu lava jato hoje, {fmtDate(todayISO())}.</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp} label="Faturado no mês" value={brl(stats.receitaMes)} tone="cyan" />
        <StatCard icon={Wallet} label="A receber" value={brl(stats.aReceber)} tone="amber" />
        <StatCard icon={Landmark} label="A pagar" value={brl(stats.aPagar)} tone="red" />
        <StatCard icon={Boxes} label="Itens com estoque baixo" value={stats.estoqueBaixo.length} tone="slate" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-800">Últimas ordens de serviço</h2>
            <button onClick={() => setTab("nova-os")} className="text-cyan-600 text-sm font-semibold flex items-center gap-1 hover:text-cyan-700">
              <Plus size={15} /> Nova OS
            </button>
          </div>
          {ultimasOrdens.length === 0 ? (
            <EmptyState text="Nenhuma ordem de serviço registrada ainda." />
          ) : (
            <div className="divide-y divide-slate-100">
              {ultimasOrdens.map((o) => (
                <div key={o.id} className="py-2.5 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium text-slate-800">#{o.numero} · {o.clienteNome}</div>
                    <div className="text-slate-400 text-xs">{fmtDate(o.data)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{brl(o.total)}</div>
                    <StatusBadge status={o.statusPagamento} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" /> Estoque baixo
          </h2>
          {stats.estoqueBaixo.length === 0 ? (
            <EmptyState text="Tudo certo com o estoque." />
          ) : (
            <div className="space-y-2">
              {stats.estoqueBaixo.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700">{p.nome}</span>
                  <Badge tone="amber">{p.quantidade} {p.unidade}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }) {
  const tones = {
    cyan: "from-cyan-500 to-blue-600",
    amber: "from-amber-400 to-orange-500",
    red: "from-rose-500 to-red-600",
    slate: "from-slate-500 to-slate-700",
  };
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${tones[tone]} flex items-center justify-center text-white shrink-0`}>
        <Icon size={19} />
      </div>
      <div className="min-w-0">
        <div className="text-slate-500 text-xs font-medium">{label}</div>
        <div className="font-bold text-lg text-slate-900 truncate">{value}</div>
      </div>
    </Card>
  );
}

function StatusBadge({ status }) {
  if (status === "pago") return <Badge tone="green">Pago</Badge>;
  if (status === "parcial") return <Badge tone="amber">Parcial</Badge>;
  return <Badge tone="red">Pendente</Badge>;
}

// ---------- Nova OS ----------
function NovaOS({ db, update, setTab }) {
  const [clienteId, setClienteId] = useState(db.clientes[0]?.id || "");
  const [itens, setItens] = useState([]);
  const [tipoSel, setTipoSel] = useState("servico");
  const [itemSel, setItemSel] = useState("");
  const [qtd, setQtd] = useState(1);
  const [formaPagamento, setFormaPagamento] = useState("Dinheiro");
  const [statusPagamento, setStatusPagamento] = useState("pago");
  const [valorPago, setValorPago] = useState(0);
  const [vencimento, setVencimento] = useState(todayISO());

  const catalogo = tipoSel === "servico" ? db.servicos : db.produtos;
  const total = itens.reduce((s, i) => s + i.subtotal, 0);

  const addItem = () => {
    const src = catalogo.find((c) => c.id === itemSel);
    if (!src || qtd <= 0) return;
    const preco = tipoSel === "servico" ? src.preco : (src.precoVenda || src.precoCusto);
    setItens((prev) => [
      ...prev,
      { uidLine: uid(), tipo: tipoSel, itemId: src.id, nome: src.nome, qtd: Number(qtd), precoUnit: preco, subtotal: preco * Number(qtd) },
    ]);
    setItemSel("");
    setQtd(1);
  };

  const removeItem = (uidLine) => setItens((prev) => prev.filter((i) => i.uidLine !== uidLine));

  const salvar = () => {
    if (itens.length === 0) return;
    const cliente = db.clientes.find((c) => c.id === clienteId);
    const numero = (db.ordens.length + 1).toString().padStart(4, "0");
    const pago = statusPagamento === "pago" ? total : statusPagamento === "parcial" ? Number(valorPago) : 0;
    const ordem = {
      id: uid(),
      numero,
      data: todayISO(),
      clienteId,
      clienteNome: cliente?.nome || "Cliente Avulso",
      itens,
      total,
      formaPagamento,
      statusPagamento,
      valorPago: pago,
      dataVencimento: statusPagamento === "pago" ? null : vencimento,
    };
    update("ordens", (prev) => [...prev, ordem]);
    // baixa de estoque para produtos vendidos
    const produtosVendidos = itens.filter((i) => i.tipo === "produto");
    if (produtosVendidos.length) {
      update("produtos", (prev) =>
        prev.map((p) => {
          const v = produtosVendidos.find((i) => i.itemId === p.id);
          if (!v) return p;
          return { ...p, quantidade: Math.max(0, Number(p.quantidade) - v.qtd) };
        })
      );
    }
    setItens([]);
    setValorPago(0);
    setStatusPagamento("pago");
    setTab("ordens");
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="headline text-2xl font-bold text-slate-900">Nova ordem de serviço</h1>
        <p className="text-slate-500 text-sm mt-1">Registre uma venda de serviço e/ou produto.</p>
      </header>

      <Card className="p-5 space-y-4">
        <Field label="Cliente">
          <select className={inputCls} value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            {db.clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}{c.placa ? ` · ${c.placa}` : ""}</option>
            ))}
          </select>
        </Field>

        <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
          <div className="text-sm font-semibold text-slate-700">Adicionar item</div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Field label="Tipo">
              <select className={inputCls} value={tipoSel} onChange={(e) => { setTipoSel(e.target.value); setItemSel(""); }}>
                <option value="servico">Serviço</option>
                <option value="produto">Produto</option>
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label={tipoSel === "servico" ? "Serviço" : "Produto"}>
                <select className={inputCls} value={itemSel} onChange={(e) => setItemSel(e.target.value)}>
                  <option value="">Selecione...</option>
                  {catalogo.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} — {brl(tipoSel === "servico" ? c.preco : (c.precoVenda || c.precoCusto))}
                      {tipoSel === "produto" ? ` (${c.quantidade} ${c.unidade} em estoque)` : ""}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Qtd">
              <input type="number" min="1" className={inputCls} value={qtd} onChange={(e) => setQtd(e.target.value)} />
            </Field>
          </div>
          <button onClick={addItem} disabled={!itemSel} className="flex items-center gap-1.5 text-sm font-semibold text-cyan-700 disabled:text-slate-300">
            <Plus size={16} /> Adicionar à ordem
          </button>
        </div>

        {itens.length > 0 && (
          <div className="divide-y divide-slate-100">
            {itens.map((i) => (
              <div key={i.uidLine} className="py-2 flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium">{i.nome}</span>
                  <span className="text-slate-400"> · {i.qtd}x {brl(i.precoUnit)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{brl(i.subtotal)}</span>
                  <button onClick={() => removeItem(i.uidLine)} className="text-slate-400 hover:text-red-500">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
            <div className="pt-3 flex items-center justify-between font-bold text-slate-900">
              <span>Total</span>
              <span>{brl(total)}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
          <Field label="Forma de pagamento">
            <select className={inputCls} value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)}>
              <option>Dinheiro</option>
              <option>Pix</option>
              <option>Cartão de Débito</option>
              <option>Cartão de Crédito</option>
            </select>
          </Field>
          <Field label="Status do pagamento">
            <select className={inputCls} value={statusPagamento} onChange={(e) => setStatusPagamento(e.target.value)}>
              <option value="pago">Pago agora</option>
              <option value="parcial">Pago parcialmente</option>
              <option value="pendente">A prazo (pendente)</option>
            </select>
          </Field>
          {statusPagamento === "parcial" && (
            <Field label="Valor pago">
              <input type="number" min="0" className={inputCls} value={valorPago} onChange={(e) => setValorPago(e.target.value)} />
            </Field>
          )}
          {statusPagamento !== "pago" && (
            <Field label="Vencimento">
              <input type="date" className={inputCls} value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
            </Field>
          )}
        </div>

        <button
          onClick={salvar}
          disabled={itens.length === 0}
          className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white font-semibold text-sm disabled:opacity-40 hover:opacity-90 transition"
        >
          Salvar ordem de serviço
        </button>
      </Card>
    </div>
  );
}

// ---------- Ordens ----------
function Ordens({ db, update }) {
  const marcarPago = (id) =>
    update("ordens", (prev) => prev.map((o) => (o.id === id ? { ...o, statusPagamento: "pago", valorPago: o.total } : o)));

  const excluir = (id) => {
    const ordem = db.ordens.find((o) => o.id === id);
    if (!ordem) return;
    // devolve estoque
    const produtosVendidos = ordem.itens.filter((i) => i.tipo === "produto");
    if (produtosVendidos.length) {
      update("produtos", (prev) =>
        prev.map((p) => {
          const v = produtosVendidos.find((i) => i.itemId === p.id);
          if (!v) return p;
          return { ...p, quantidade: Number(p.quantidade) + v.qtd };
        })
      );
    }
    update("ordens", (prev) => prev.filter((o) => o.id !== id));
  };

  const lista = [...db.ordens].sort((a, b) => (a.data < b.data ? 1 : -1));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="headline text-2xl font-bold text-slate-900">Ordens de serviço</h1>
        <p className="text-slate-500 text-sm mt-1">{lista.length} ordem(ns) registrada(s).</p>
      </header>
      <Card className="p-0 overflow-hidden">
        {lista.length === 0 ? (
          <EmptyState text="Nenhuma ordem registrada ainda." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Nº</th>
                <th className="text-left px-4 py-3">Data</th>
                <th className="text-left px-4 py-3">Cliente</th>
                <th className="text-left px-4 py-3">Itens</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-3 font-medium">#{o.numero}</td>
                  <td className="px-4 py-3 text-slate-500">{fmtDate(o.data)}</td>
                  <td className="px-4 py-3">{o.clienteNome}</td>
                  <td className="px-4 py-3 text-slate-500">{o.itens.map((i) => i.nome).join(", ")}</td>
                  <td className="px-4 py-3 text-right font-semibold">{brl(o.total)}</td>
                  <td className="px-4 py-3"><StatusBadge status={o.statusPagamento} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      {o.statusPagamento !== "pago" && (
                        <button onClick={() => marcarPago(o.id)} className="text-emerald-600 hover:text-emerald-700" title="Marcar como pago">
                          <CheckCircle2 size={17} />
                        </button>
                      )}
                      <button onClick={() => excluir(o.id)} className="text-slate-400 hover:text-red-500" title="Excluir">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ---------- Clientes ----------
function Clientes({ db, update }) {
  const [form, setForm] = useState({ nome: "", telefone: "", veiculo: "", placa: "" });
  const [busca, setBusca] = useState("");

  function Clientes({ db, update }) {
  const [form, setForm] = useState({
    nome: "",
    telefone: "",
    veiculo: "",
    placa: "",
  });

  const [busca, setBusca] = useState("");

  const add = async () => {
    if (!form.nome.trim()) return;

    const { data, error } = await supabase
      .from("clientes")
      .insert([
        {
          nome: form.nome,
          telefone: form.telefone,
          veiculo: form.veiculo,
          placa: form.placa,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Erro ao salvar cliente:", error);
      alert(`Erro ao salvar cliente: ${error.message}`);
      return;
    }

    update("clientes", (prev) => [...prev, data]);

    setForm({
      nome: "",
      telefone: "",
      veiculo: "",
      placa: "",
    });

    alert("Cliente salvo com sucesso!");
  };

  const remove = (id) =>
    update("clientes", (prev) => prev.filter((c) => c.id !== id));

  const lista = db.clientes.filter((c) =>
    c.nome.toLowerCase().includes(busca.toLowerCase())
  );

  // restante do seu código
}
  const remove = (id) => update("clientes", (prev) => prev.filter((c) => c.id !== id));

  const lista = db.clientes.filter((c) => c.nome.toLowerCase().includes(busca.toLowerCase()));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="headline text-2xl font-bold text-slate-900">Clientes</h1>
        <p className="text-slate-500 text-sm mt-1">Cadastre clientes e seus veículos.</p>
      </header>

      <Card className="p-5">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Field label="Nome"><input className={inputCls} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Field>
          <Field label="Telefone"><input className={inputCls} value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></Field>
          <Field label="Veículo"><input className={inputCls} value={form.veiculo} onChange={(e) => setForm({ ...form, veiculo: e.target.value })} /></Field>
          <Field label="Placa"><input className={inputCls} value={form.placa} onChange={(e) => setForm({ ...form, placa: e.target.value })} /></Field>
        </div>
        <button onClick={add} className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-cyan-700"><Plus size={16} /> Adicionar cliente</button>
      </Card>

      <div className="relative max-w-xs">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className={inputCls + " pl-8"} placeholder="Buscar cliente..." value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      <Card className="p-0 overflow-hidden">
        {lista.length === 0 ? <EmptyState text="Nenhum cliente encontrado." /> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr><th className="text-left px-4 py-3">Nome</th><th className="text-left px-4 py-3">Telefone</th><th className="text-left px-4 py-3">Veículo</th><th className="text-left px-4 py-3">Placa</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-medium">{c.nome}</td>
                  <td className="px-4 py-3 text-slate-500">{c.telefone || "-"}</td>
                  <td className="px-4 py-3 text-slate-500">{c.veiculo || "-"}</td>
                  <td className="px-4 py-3 text-slate-500">{c.placa || "-"}</td>
                  <td className="px-4 py-3 text-right"><button onClick={() => remove(c.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ---------- Serviços (catálogo) ----------
function Servicos({ db, update }) {
  const [form, setForm] = useState({ nome: "", preco: "" });
  const add = () => {
    if (!form.nome.trim() || form.preco === "") return;
    update("servicos", (prev) => [...prev, { id: uid(), nome: form.nome, preco: Number(form.preco) }]);
    setForm({ nome: "", preco: "" });
  };
  const remove = (id) => update("servicos", (prev) => prev.filter((s) => s.id !== id));
  const editarPreco = (id, preco) => update("servicos", (prev) => prev.map((s) => (s.id === id ? { ...s, preco: Number(preco) } : s)));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="headline text-2xl font-bold text-slate-900">Catálogo de serviços</h1>
        <p className="text-slate-500 text-sm mt-1">Serviços oferecidos e seus preços.</p>
      </header>

      <Card className="p-5">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3">
          <Field label="Nome do serviço"><input className={inputCls} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Field>
          <Field label="Preço"><input type="number" className={inputCls} value={form.preco} onChange={(e) => setForm({ ...form, preco: e.target.value })} /></Field>
        </div>
        <button onClick={add} className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-cyan-700"><Plus size={16} /> Adicionar serviço</button>
      </Card>

      <Card className="p-0 overflow-hidden">
        {db.servicos.length === 0 ? <EmptyState text="Nenhum serviço cadastrado." /> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase"><tr><th className="text-left px-4 py-3">Serviço</th><th className="text-left px-4 py-3">Preço</th><th className="px-4 py-3"></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {db.servicos.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 font-medium">{s.nome}</td>
                  <td className="px-4 py-3">
                    <input type="number" className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-sm" value={s.preco} onChange={(e) => editarPreco(s.id, e.target.value)} />
                  </td>
                  <td className="px-4 py-3 text-right"><button onClick={() => remove(s.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ---------- Estoque ----------
function Estoque({ db, update }) {
  const [form, setForm] = useState({ nome: "", unidade: "un", quantidade: "", estoqueMinimo: "", precoCusto: "", precoVenda: "" });

  const add = () => {
    if (!form.nome.trim()) return;
    update("produtos", (prev) => [
      ...prev,
      { id: uid(), nome: form.nome, unidade: form.unidade, quantidade: Number(form.quantidade || 0), estoqueMinimo: Number(form.estoqueMinimo || 0), precoCusto: Number(form.precoCusto || 0), precoVenda: Number(form.precoVenda || 0) },
    ]);
    setForm({ nome: "", unidade: "un", quantidade: "", estoqueMinimo: "", precoCusto: "", precoVenda: "" });
  };
  const remove = (id) => update("produtos", (prev) => prev.filter((p) => p.id !== id));
  const ajustar = (id, delta) =>
    update("produtos", (prev) => prev.map((p) => (p.id === id ? { ...p, quantidade: Math.max(0, Number(p.quantidade) + delta) } : p)));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="headline text-2xl font-bold text-slate-900">Estoque</h1>
        <p className="text-slate-500 text-sm mt-1">Produtos usados ou vendidos no lava jato.</p>
      </header>

      <Card className="p-5">
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
          <div className="sm:col-span-2"><Field label="Produto"><input className={inputCls} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Field></div>
          <Field label="Unidade">
            <select className={inputCls} value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })}>
              <option value="un">un</option><option value="L">L</option><option value="kg">kg</option>
            </select>
          </Field>
          <Field label="Qtd inicial"><input type="number" className={inputCls} value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value })} /></Field>
          <Field label="Estoque mínimo"><input type="number" className={inputCls} value={form.estoqueMinimo} onChange={(e) => setForm({ ...form, estoqueMinimo: e.target.value })} /></Field>
          <Field label="Preço custo"><input type="number" className={inputCls} value={form.precoCusto} onChange={(e) => setForm({ ...form, precoCusto: e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-3 mt-3">
          <Field label="Preço de venda (se revendido)"><input type="number" className={inputCls} value={form.precoVenda} onChange={(e) => setForm({ ...form, precoVenda: e.target.value })} /></Field>
        </div>
        <button onClick={add} className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-cyan-700"><Plus size={16} /> Adicionar produto</button>
      </Card>

      <Card className="p-0 overflow-hidden">
        {db.produtos.length === 0 ? <EmptyState text="Nenhum produto cadastrado." /> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr><th className="text-left px-4 py-3">Produto</th><th className="text-left px-4 py-3">Qtd</th><th className="text-left px-4 py-3">Mínimo</th><th className="text-left px-4 py-3">Custo</th><th className="text-left px-4 py-3">Venda</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {db.produtos.map((p) => {
                const baixo = Number(p.quantidade) <= Number(p.estoqueMinimo);
                return (
                  <tr key={p.id} className={baixo ? "bg-amber-50/50" : ""}>
                    <td className="px-4 py-3 font-medium">{p.nome} {baixo && <Badge tone="amber">baixo</Badge>}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => ajustar(p.id, -1)} className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-600">−</button>
                        <span className="w-10 text-center">{p.quantidade} {p.unidade}</span>
                        <button onClick={() => ajustar(p.id, 1)} className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-600">+</button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{p.estoqueMinimo} {p.unidade}</td>
                    <td className="px-4 py-3 text-slate-500">{brl(p.precoCusto)}</td>
                    <td className="px-4 py-3 text-slate-500">{p.precoVenda ? brl(p.precoVenda) : "-"}</td>
                    <td className="px-4 py-3 text-right"><button onClick={() => remove(p.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={16} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ---------- Contas a Receber ----------
function ContasReceber({ db, update }) {
  const pendentes = db.ordens
    .filter((o) => o.statusPagamento !== "pago")
    .sort((a, b) => (a.dataVencimento || "") > (b.dataVencimento || "") ? 1 : -1);

  const marcarPago = (id) =>
    update("ordens", (prev) => prev.map((o) => (o.id === id ? { ...o, statusPagamento: "pago", valorPago: o.total } : o)));

  const totalPendente = pendentes.reduce((s, o) => s + (o.total - (o.valorPago || 0)), 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="headline text-2xl font-bold text-slate-900">Contas a receber</h1>
        <p className="text-slate-500 text-sm mt-1">Gerado automaticamente a partir das ordens de serviço pendentes ou parciais.</p>
      </header>

      <StatCard icon={Wallet} label="Total pendente" value={brl(totalPendente)} tone="amber" />

      <Card className="p-0 overflow-hidden">
        {pendentes.length === 0 ? <EmptyState text="Nenhuma conta a receber no momento." /> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr><th className="text-left px-4 py-3">OS</th><th className="text-left px-4 py-3">Cliente</th><th className="text-left px-4 py-3">Vencimento</th><th className="text-right px-4 py-3">Valor pendente</th><th className="text-left px-4 py-3">Status</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pendentes.map((o) => {
                const vencida = o.dataVencimento && o.dataVencimento < todayISO();
                return (
                  <tr key={o.id}>
                    <td className="px-4 py-3 font-medium">#{o.numero}</td>
                    <td className="px-4 py-3">{o.clienteNome}</td>
                    <td className="px-4 py-3 text-slate-500">{fmtDate(o.dataVencimento)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{brl(o.total - (o.valorPago || 0))}</td>
                    <td className="px-4 py-3">{vencida ? <Badge tone="red">Vencida</Badge> : <StatusBadge status={o.statusPagamento} />}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => marcarPago(o.id)} className="text-emerald-600 hover:text-emerald-700" title="Marcar como recebido"><CheckCircle2 size={17} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ---------- Contas a Pagar ----------
function ContasPagar({ db, update }) {
  const [form, setForm] = useState({ descricao: "", categoria: "Fornecedor", valor: "", vencimento: todayISO() });

  const add = () => {
    if (!form.descricao.trim() || form.valor === "") return;
    update("contasPagar", (prev) => [...prev, { id: uid(), ...form, valor: Number(form.valor), status: "pendente", dataPagamento: null }]);
    setForm({ descricao: "", categoria: "Fornecedor", valor: "", vencimento: todayISO() });
  };
  const marcarPago = (id) => update("contasPagar", (prev) => prev.map((c) => (c.id === id ? { ...c, status: "pago", dataPagamento: todayISO() } : c)));
  const remove = (id) => update("contasPagar", (prev) => prev.filter((c) => c.id !== id));

  const lista = [...db.contasPagar].sort((a, b) => (a.vencimento > b.vencimento ? 1 : -1));
  const totalPendente = lista.filter((c) => c.status === "pendente").reduce((s, c) => s + Number(c.valor), 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="headline text-2xl font-bold text-slate-900">Contas a pagar</h1>
        <p className="text-slate-500 text-sm mt-1">Fornecedores, contas fixas e outras despesas.</p>
      </header>

      <StatCard icon={Landmark} label="Total pendente" value={brl(totalPendente)} tone="red" />

      <Card className="p-5">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-2"><Field label="Descrição"><input className={inputCls} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></Field></div>
          <Field label="Categoria">
            <select className={inputCls} value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
              <option>Fornecedor</option><option>Aluguel</option><option>Água/Luz</option><option>Salários</option><option>Manutenção</option><option>Outros</option>
            </select>
          </Field>
          <Field label="Valor"><input type="number" className={inputCls} value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-3">
          <Field label="Vencimento"><input type="date" className={inputCls} value={form.vencimento} onChange={(e) => setForm({ ...form, vencimento: e.target.value })} /></Field>
        </div>
        <button onClick={add} className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-cyan-700"><Plus size={16} /> Adicionar conta</button>
      </Card>

      <Card className="p-0 overflow-hidden">
        {lista.length === 0 ? <EmptyState text="Nenhuma conta a pagar cadastrada." /> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr><th className="text-left px-4 py-3">Descrição</th><th className="text-left px-4 py-3">Categoria</th><th className="text-left px-4 py-3">Vencimento</th><th className="text-right px-4 py-3">Valor</th><th className="text-left px-4 py-3">Status</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.map((c) => {
                const vencida = c.status === "pendente" && c.vencimento < todayISO();
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-medium">{c.descricao}</td>
                    <td className="px-4 py-3 text-slate-500">{c.categoria}</td>
                    <td className="px-4 py-3 text-slate-500">{fmtDate(c.vencimento)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{brl(c.valor)}</td>
                    <td className="px-4 py-3">
                      {c.status === "pago" ? <Badge tone="green">Pago</Badge> : vencida ? <Badge tone="red">Vencida</Badge> : <Badge tone="amber">Pendente</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        {c.status !== "pago" && (
                          <button onClick={() => marcarPago(c.id)} className="text-emerald-600 hover:text-emerald-700" title="Marcar como pago"><CheckCircle2 size={17} /></button>
                        )}
                        <button onClick={() => remove(c.id)} className="text-slate-400 hover:text-red-500" title="Excluir"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
