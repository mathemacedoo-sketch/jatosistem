import { useState, useEffect, useRef, useMemo } from "react";
import {
  LayoutDashboard, FilePlus2, ClipboardList, Users, Sparkles, Boxes,
  Wallet, Landmark, Trash2, CheckCircle2, AlertTriangle, Plus, X,
  Droplets, TrendingUp, TrendingDown, Search, Building2, UserCog, Pencil
} from "lucide-react";

// ---------- helpers ----------
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayISO = () => new Date().toISOString().slice(0, 10);
const brl = (v) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const fmtDate = (d) => {
  if (!d) return "-";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};
const monthKey = (d) => (d || "").slice(0, 7);
const DEFAULT_ADMIN_PASSWORD = "admin123";

const createEmpresa = ({ nome, segmento = "lava-jato" }) => ({
  id: uid(),
  nome: nome.trim(),
  segmento: segmento?.trim() || "lava-jato",
  status: "ativo",
  criadoEm: todayISO(),
});

const createUsuario = ({ nome, usuario, senha, empresaId, perfil = "usuario" }) => ({
  id: uid(),
  nome: nome.trim(),
  usuario: usuario.trim(),
  senha,
  empresaId,
  perfil,
});

const createFuncionario = ({ nome, cargo = "Funcionário", empresaId }) => ({
  id: uid(),
  nome: nome.trim(),
  cargo: cargo.trim(),
  empresaId,
});

const getEmpresaData = (db, empresaId) => ({
  ...db,
  clientes: (db.clientes || []).filter((item) => !item.empresaId || item.empresaId === empresaId),
  funcionarios: (db.funcionarios || []).filter((item) => !item.empresaId || item.empresaId === empresaId),
  servicos: (db.servicos || []).filter((item) => !item.empresaId || item.empresaId === empresaId),
  produtos: (db.produtos || []).filter((item) => !item.empresaId || item.empresaId === empresaId),
  ordens: (db.ordens || []).filter((item) => !item.empresaId || item.empresaId === empresaId),
  contasPagar: (db.contasPagar || []).filter((item) => !item.empresaId || item.empresaId === empresaId),
});

const gerarParcelas = (baseId, total, quantidade, vencimentoBase) => {
  const qtd = Math.max(1, Number(quantidade) || 1);
  const valorParcela = qtd > 1 ? Number(total) / qtd : Number(total);

  return Array.from({ length: qtd }, (_, index) => {
    const dataVencimento = (() => {
      if (!vencimentoBase) {
        const next = new Date();
        next.setMonth(next.getMonth() + index);
        return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
      }
      const [y, m, d] = vencimentoBase.split("-").map(Number);
      const next = new Date(y, m - 1 + index, d);
      return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
    })();

    return {
      id: `${baseId}-p${index + 1}`,
      numeroParcela: index + 1,
      totalParcelas: qtd,
      valor: Number(valorParcela.toFixed(2)),
      status: "pendente",
      valorPago: 0,
      dataVencimento,
      dataBaixa: null,
    };
  });
};

const contasReceberFormatadas = (ordens) =>
  ordens.flatMap((ordem) => {
    const parcelas = Array.isArray(ordem.parcelas) && ordem.parcelas.length
      ? ordem.parcelas
      : [{ id: ordem.id, numeroParcela: 1, totalParcelas: 1, valor: Number(ordem.total) || 0, status: ordem.statusPagamento || "pendente", valorPago: Number(ordem.valorPago || 0), dataVencimento: ordem.dataVencimento, dataBaixa: ordem.dataBaixa || null }];

    return parcelas.map((parcela) => ({
      ...ordem,
      id: parcela.id,
      originalId: ordem.id,
      numeroParcela: parcela.numeroParcela || 1,
      totalParcelas: parcela.totalParcelas || 1,
      valorParcela: Number(parcela.valor || ordem.total || 0),
      valorPago: Number(parcela.valorPago || 0),
      statusPagamento: parcela.status || ordem.statusPagamento || "pendente",
      dataVencimento: parcela.dataVencimento || ordem.dataVencimento,
      dataBaixa: parcela.dataBaixa || null,
    }));
  });

const empresaAdmId = uid();
const usuarioAdmId = uid();

const SEED = {
  empresas: [
    { id: empresaAdmId, nome: "ADM", segmento: "lava-jato", status: "ativo", criadoEm: todayISO() },
  ],
  usuarios: [
    { id: usuarioAdmId, nome: "Administrador", usuario: "admin", senha: DEFAULT_ADMIN_PASSWORD, empresaId: empresaAdmId, perfil: "master" },
  ],
  clientes: [
    { id: uid(), nome: "Cliente Avulso", telefone: "", veiculo: "", placa: "", empresaId: empresaAdmId },
  ],
  funcionarios: [],
  servicos: [
    { id: uid(), nome: "Lavagem Simples", preco: 30, empresaId: empresaAdmId },
    { id: uid(), nome: "Lavagem Completa", preco: 50, empresaId: empresaAdmId },
    { id: uid(), nome: "Enceramento", preco: 70, empresaId: empresaAdmId },
    { id: uid(), nome: "Higienização Interna", preco: 120, empresaId: empresaAdmId },
  ],
  produtos: [
    { id: uid(), nome: "Shampoo Automotivo", unidade: "L", quantidade: 10, estoqueMinimo: 3, precoCusto: 12, precoVenda: 0, empresaId: empresaAdmId },
    { id: uid(), nome: "Cera Automotiva", unidade: "un", quantidade: 5, estoqueMinimo: 2, precoCusto: 25, precoVenda: 0, empresaId: empresaAdmId },
    { id: uid(), nome: "Aromatizante", unidade: "un", quantidade: 8, estoqueMinimo: 3, precoCusto: 6, precoVenda: 15, empresaId: empresaAdmId },
  ],
  ordens: [],
  contasPagar: [],
};

const STORAGE_KEY = "jato_sistem_db_v1";

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
  "w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm text-slate-700 shadow-sm placeholder:text-slate-400 transition focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-500";

function Card({ children, className = "" }) {
  return (
    <div className={`rounded-2xl border border-slate-200/80 bg-white/90 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.45)] backdrop-blur-sm ${className}`}>
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
    cyan: "bg-violet-100 text-violet-700",
    violet: "bg-violet-100 text-violet-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

function EmptyState({ text }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 py-10 text-center text-sm text-slate-400">{text}</div>
  );
}

// ---------- App ----------
export default function App() {
  const [db, setDb] = useState(SEED);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("login");
  const [auth, setAuth] = useState({ usuario: "", senha: "", empresaId: "", usuarioLogado: null });
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
    setDb((prev) => {
      if (key === "empresas" || key === "usuarios") {
        return { ...prev, [key]: updater(prev[key] || []) };
      }

      const companyId = auth.empresaId || auth.usuarioLogado?.empresaId || "";
      const items = prev[key] || [];
      const currentItems = items.filter((item) => !item.empresaId || item.empresaId === companyId);
      const otherItems = items.filter((item) => item.empresaId && item.empresaId !== companyId);
      const updatedItems = updater(currentItems).map((item) =>
        item && typeof item === "object" && !item.empresaId ? { ...item, empresaId: companyId } : item
      );

      return { ...prev, [key]: [...otherItems, ...updatedItems] };
    });

  const empresas = db.empresas || [];
  const usuarios = db.usuarios || [];
  const empresaAtiva = empresas.find((empresa) => empresa.id === (auth.empresaId || auth.usuarioLogado?.empresaId)) || null;
  const authUser = auth.usuarioLogado || usuarios.find((u) => u.usuario === auth.usuario && u.senha === auth.senha);
  const isMaster = authUser?.perfil === "master";

  const entrar = () => {
    const user = usuarios.find((u) => u.usuario === auth.usuario && u.senha === auth.senha);
    if (!user) return;
    const empresaId = user.empresaId || (auth.empresaId || empresas[0]?.id || "");
    setAuth((prev) => ({ ...prev, empresaId, usuarioLogado: user }));
    setTab("dashboard");
  };

  const sair = () => {
    setAuth({ usuario: "", senha: "", empresaId: "", usuarioLogado: null });
    setTab("login");
  };

  // ---- derived numbers ----
  const stats = useMemo(() => {
    const empresaData = getEmpresaData(db, auth.empresaId || auth.usuarioLogado?.empresaId || "");
    const mk = monthKey(todayISO());
    const receitaMes = empresaData.ordens
      .filter((o) => monthKey(o.data) === mk)
      .reduce((s, o) => s + (o.statusPagamento === "pago" ? o.total : o.valorPago || 0), 0);
    const receitaDia = empresaData.ordens
      .filter((o) => o.data === todayISO())
      .reduce((s, o) => s + (o.statusPagamento === "pago" ? o.total : o.valorPago || 0), 0);
    const aReceber = contasReceberFormatadas(empresaData.ordens)
      .filter((o) => o.statusPagamento !== "pago")
      .reduce((s, o) => s + Math.max(0, Number(o.valorParcela || 0) - Number(o.valorPago || 0)), 0);
    const aPagar = empresaData.contasPagar
      .reduce((s, c) => s + Math.max(0, Number(c.valor || 0) - Number(c.valorPago || 0)), 0);
    const estoqueBaixo = empresaData.produtos.filter((p) => Number(p.quantidade) <= Number(p.estoqueMinimo));
    return { receitaMes, receitaDia, aReceber, aPagar, estoqueBaixo };
  }, [db, auth.empresaId, auth.usuarioLogado]);

  const NAV = [
    { id: "dashboard", label: "Painel", icon: LayoutDashboard },
    { id: "nova-os", label: "Nova OS", icon: FilePlus2 },
    { id: "ordens", label: "Ordens de Serviço", icon: ClipboardList },
    { id: "clientes", label: "Clientes", icon: Users },
    { id: "funcionarios", label: "Funcionários", icon: UserCog },
    { id: "servicos", label: "Serviços", icon: Sparkles },
    { id: "estoque", label: "Estoque", icon: Boxes },
    { id: "receber", label: "Contas a Receber", icon: Wallet },
    { id: "pagar", label: "Contas a Pagar", icon: Landmark },
  ];

  if (tab === "login") {
    return <LoginScreen auth={auth} setAuth={setAuth} entrar={entrar} db={db} />;
  }

  return (
    <div className="min-h-screen w-full bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.18),_transparent_35%),linear-gradient(135deg,_#fff7ed_0%,_#f5f3ff_100%)] text-slate-800 flex" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');
        .headline { font-family: 'Space Grotesk', system-ui, sans-serif; }
      `}</style>

      {/* Sidebar */}
      <aside className="w-64 shrink-0 bg-gradient-to-b from-slate-950 via-[#2f1548] to-[#4c1d95] text-white flex flex-col shadow-[12px_0_40px_-20px_rgba(15,23,42,0.65)]">
        <div className="px-5 pt-6 pb-4 flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-400 to-violet-600 flex items-center justify-center">
            <Droplets size={20} className="text-white" />
          </div>
          <div>
            <div className="headline font-bold text-lg leading-tight">JATO SISTEM</div>
            <div className="text-[11px] text-orange-200 tracking-wide uppercase">Gestão do negócio</div>
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
          {isMaster && (
            <button onClick={() => setTab("empresas")} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${tab === "empresas" ? "bg-orange-500/20 text-orange-200 border border-orange-400/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" : "text-slate-300 hover:bg-white/5 hover:text-white border border-transparent"}`}>
              <Building2 size={17} /> Empresas
            </button>
          )}
          <button onClick={() => setTab("usuarios")} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${tab === "usuarios" ? "bg-orange-500/20 text-orange-200 border border-orange-400/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" : "text-slate-300 hover:bg-white/5 hover:text-white border border-transparent"}`}>
            <UserCog size={17} /> Usuários
          </button>
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = tab === n.id;
            return (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                  active
                    ? "bg-orange-500/20 text-orange-200 border border-orange-400/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    : "text-slate-300 hover:bg-white/5 hover:text-white border border-transparent"
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
          <div className="mb-2">{empresaAtiva?.nome || "Empresa"}</div>
          <button onClick={sair} className="text-orange-200 hover:text-white">Sair</button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6 md:p-8">
          {tab === "dashboard" && <Dashboard db={getEmpresaData(db, auth.empresaId || auth.usuarioLogado?.empresaId || "")} stats={stats} setTab={setTab} />}
          {tab === "nova-os" && <NovaOS db={getEmpresaData(db, auth.empresaId || auth.usuarioLogado?.empresaId || "")} update={update} setTab={setTab} />}
          {tab === "ordens" && <Ordens db={getEmpresaData(db, auth.empresaId || auth.usuarioLogado?.empresaId || "")} update={update} />}
          {tab === "clientes" && <Clientes db={getEmpresaData(db, auth.empresaId || auth.usuarioLogado?.empresaId || "")} update={update} empresaSegmento={empresaAtiva?.segmento || "lava-jato"} />}
          {tab === "funcionarios" && <FuncionariosScreen db={getEmpresaData(db, auth.empresaId || auth.usuarioLogado?.empresaId || "")} update={update} empresaId={auth.empresaId || auth.usuarioLogado?.empresaId || ""} />}
          {tab === "servicos" && <Servicos db={getEmpresaData(db, auth.empresaId || auth.usuarioLogado?.empresaId || "")} update={update} />}
          {tab === "estoque" && <Estoque db={getEmpresaData(db, auth.empresaId || auth.usuarioLogado?.empresaId || "")} update={update} />}
          {tab === "receber" && <ContasReceber db={getEmpresaData(db, auth.empresaId || auth.usuarioLogado?.empresaId || "")} update={update} />}
          {tab === "pagar" && <ContasPagar db={getEmpresaData(db, auth.empresaId || auth.usuarioLogado?.empresaId || "")} update={update} />}
          {tab === "empresas" && isMaster && <EmpresasScreen db={db} update={update} setTab={setTab} />}
          {tab === "usuarios" && <UsuariosScreen db={db} update={update} setTab={setTab} isMaster={isMaster} empresaId={auth.empresaId || auth.usuarioLogado?.empresaId || ""} />}
        </div>
      </main>
    </div>
  );
}

function LoginScreen({ auth, setAuth, entrar, db }) {
  const [erro, setErro] = useState("");
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <Card className="w-full max-w-md p-6 space-y-4">
        <div>
          <h1 className="headline text-2xl font-bold text-slate-900">Acessar sistema</h1>
          <p className="text-sm text-slate-500 mt-1">Entre com o usuário e senha da sua empresa.</p>
        </div>
        <div className="rounded-xl bg-orange-50 border border-orange-200 p-3 text-sm text-orange-700">
          Use as credenciais cadastradas para a empresa em que você foi cadastrado.
        </div>
        <Field label="Usuário">
          <input className={inputCls} value={auth.usuario} onChange={(e) => setAuth((prev) => ({ ...prev, usuario: e.target.value }))} />
        </Field>
        <Field label="Senha">
          <input type="password" className={inputCls} value={auth.senha} onChange={(e) => setAuth((prev) => ({ ...prev, senha: e.target.value }))} />
        </Field>
        {erro && <div className="text-sm text-red-600">{erro}</div>}
        <button onClick={() => { const user = (db.usuarios || []).find((u) => u.usuario === auth.usuario && u.senha === auth.senha); if (!user) { setErro("Usuário ou senha inválidos."); return; } setErro(""); entrar(); }} className="w-full rounded-xl bg-gradient-to-br from-orange-500 to-violet-600 text-white font-semibold py-2.5">Entrar</button>
      </Card>
    </div>
  );
}

function EmpresasScreen({ db, update, setTab }) {
  const [form, setForm] = useState({ nome: "", usuario: "", senha: "", segmento: "lava-jato" });
  const [segmentoEditandoId, setSegmentoEditandoId] = useState(null);
  const [segmentoEditado, setSegmentoEditado] = useState("lava-jato");

  const add = () => {
    if (!form.nome.trim()) return;
    const empresa = createEmpresa({ nome: form.nome, segmento: form.segmento });
    const usuario = createUsuario({
      nome: form.usuario.trim() || empresa.nome,
      usuario: form.usuario.trim() || `user-${empresa.nome.toLowerCase().replace(/\s+/g, "")}`,
      senha: form.senha || DEFAULT_ADMIN_PASSWORD,
      empresaId: empresa.id,
      perfil: "usuario",
    });
    update("empresas", (prev) => [...prev, empresa]);
    update("usuarios", (prev) => [...prev, usuario]);
    setForm({ nome: "", usuario: "", senha: "", segmento: "lava-jato" });
    setTab("usuarios");
  };

  const iniciarEdicaoSegmento = (empresa) => {
    setSegmentoEditandoId(empresa.id);
    setSegmentoEditado(empresa.segmento || "lava-jato");
  };

  const cancelarEdicaoSegmento = () => {
    setSegmentoEditandoId(null);
    setSegmentoEditado("lava-jato");
  };

  const salvarEdicaoSegmento = (empresaId) => {
    update("empresas", (prev) => prev.map((empresa) => (empresa.id === empresaId ? { ...empresa, segmento: segmentoEditado } : empresa)));
    cancelarEdicaoSegmento();
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="headline text-2xl font-bold text-slate-900">Empresas</h1>
        <p className="text-slate-500 text-sm mt-1">Cadastre uma empresa e o primeiro usuário que vai acessar o sistema.</p>
      </header>

      <Card className="p-5 space-y-4">
        <Field label="Nome da empresa">
          <input className={inputCls} value={form.nome} onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))} />
        </Field>
        <Field label="Segmento">
          <select className={inputCls} value={form.segmento} onChange={(e) => setForm((prev) => ({ ...prev, segmento: e.target.value }))}>
            <option value="lava-jato">Lava Jato</option>
            <option value="cabeleleiro">Cabeleireiro</option>
            <option value="barbearia">Barbearia</option>
            <option value="estetica">Estética</option>
            <option value="outro">Outro</option>
          </select>
        </Field>
        <Field label="Usuário da empresa">
          <input className={inputCls} value={form.usuario} onChange={(e) => setForm((prev) => ({ ...prev, usuario: e.target.value }))} />
        </Field>
        <Field label="Senha inicial">
          <input type="password" className={inputCls} value={form.senha} onChange={(e) => setForm((prev) => ({ ...prev, senha: e.target.value }))} />
        </Field>
        <button onClick={add} className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white">Salvar empresa e usuário</button>
      </Card>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr><th className="text-left px-4 py-3">Empresa</th><th className="text-left px-4 py-3">Segmento</th><th className="text-left px-4 py-3">Criada em</th><th className="text-left px-4 py-3">Ações</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(db.empresas || []).map((empresa) => (
              <tr key={empresa.id}>
                <td className="px-4 py-3 font-medium">{empresa.nome}</td>
                <td className="px-4 py-3 text-slate-500">
                  {segmentoEditandoId === empresa.id ? (
                    <div className="flex items-center gap-2">
                      <select className={inputCls + " max-w-[180px]"} value={segmentoEditado} onChange={(e) => setSegmentoEditado(e.target.value)}>
                        <option value="lava-jato">Lava Jato</option>
                        <option value="cabeleleiro">Cabeleireiro</option>
                        <option value="barbearia">Barbearia</option>
                        <option value="estetica">Estética</option>
                        <option value="outro">Outro</option>
                      </select>
                      <button onClick={() => salvarEdicaoSegmento(empresa.id)} className="text-sm font-semibold text-orange-600">Salvar</button>
                      <button onClick={cancelarEdicaoSegmento} className="text-sm text-slate-500">Cancelar</button>
                    </div>
                  ) : (
                    <span>{empresa.segmento || "lava-jato"}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">{fmtDate(empresa.criadoEm)}</td>
                <td className="px-4 py-3 text-slate-500">
                  {segmentoEditandoId === empresa.id ? null : (
                    <button onClick={() => iniciarEdicaoSegmento(empresa)} className="text-sm font-semibold text-violet-600 hover:text-violet-700">Editar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function UsuariosScreen({ db, update, isMaster, empresaId }) {
  const [form, setForm] = useState({ nome: "", usuario: "", senha: "", perfil: "usuario", empresaId: empresaId || "" });
  const [empresaSelecionada, setEmpresaSelecionada] = useState(empresaId || (db.empresas?.[0]?.id || ""));

  const add = () => {
    if (!form.nome.trim() || !form.usuario.trim() || !form.senha.trim()) return;
    const targetEmpresaId = isMaster ? (empresaSelecionada || form.empresaId) : empresaId;
    update("usuarios", (prev) => [...prev, createUsuario({
      nome: form.nome,
      usuario: form.usuario,
      senha: form.senha,
      empresaId: targetEmpresaId,
      perfil: form.perfil,
    })]);
    setForm({ nome: "", usuario: "", senha: "", perfil: "usuario", empresaId: targetEmpresaId });
  };

  const lista = (db.usuarios || []).filter((usuario) => {
    if (usuario.perfil === "master" && usuario.usuario === "admin") return false;
    return isMaster ? usuario.empresaId === (empresaSelecionada || empresaId) : usuario.empresaId === empresaId;
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="headline text-2xl font-bold text-slate-900">Usuários</h1>
        <p className="text-slate-500 text-sm mt-1">Cadastre usuários para a empresa atual.</p>
      </header>

      <Card className="p-5 space-y-4">
        {isMaster && (
          <Field label="Empresa">
            <select className={inputCls} value={empresaSelecionada} onChange={(e) => setEmpresaSelecionada(e.target.value)}>
              {(db.empresas || []).map((empresa) => <option key={empresa.id} value={empresa.id}>{empresa.nome}</option>)}
            </select>
          </Field>
        )}
        <Field label="Nome">
          <input className={inputCls} value={form.nome} onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))} />
        </Field>
        <Field label="Usuário">
          <input className={inputCls} value={form.usuario} onChange={(e) => setForm((prev) => ({ ...prev, usuario: e.target.value }))} />
        </Field>
        <Field label="Senha">
          <input type="password" className={inputCls} value={form.senha} onChange={(e) => setForm((prev) => ({ ...prev, senha: e.target.value }))} />
        </Field>
        <Field label="Perfil">
          <select className={inputCls} value={form.perfil} onChange={(e) => setForm((prev) => ({ ...prev, perfil: e.target.value }))}>
            <option value="usuario">Usuário</option>
            <option value="master">Master</option>
          </select>
        </Field>
        <button onClick={add} className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white">Salvar usuário</button>
      </Card>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr><th className="text-left px-4 py-3">Nome</th><th className="text-left px-4 py-3">Usuário</th><th className="text-left px-4 py-3">Perfil</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lista.map((usuario) => (
              <tr key={usuario.id}>
                <td className="px-4 py-3 font-medium">{usuario.nome}</td>
                <td className="px-4 py-3 text-slate-500">{usuario.usuario}</td>
                <td className="px-4 py-3 text-slate-500">{usuario.perfil === "master" ? "Master" : "Usuário"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function FuncionariosScreen({ db, update, empresaId }) {
  const [form, setForm] = useState({ nome: "", cargo: "" });

  const add = () => {
    if (!form.nome.trim()) return;
    update("funcionarios", (prev) => [...prev, createFuncionario({ nome: form.nome, cargo: form.cargo, empresaId })]);
    setForm({ nome: "", cargo: "" });
  };

  const remove = (id) => update("funcionarios", (prev) => prev.filter((funcionario) => funcionario.id !== id));

  const lista = (db.funcionarios || []).filter((funcionario) => !funcionario.empresaId || funcionario.empresaId === empresaId);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="headline text-2xl font-bold text-slate-900">Funcionários</h1>
        <p className="text-slate-500 text-sm mt-1">Cadastre os funcionários que vão atuar nas ordens de serviço.</p>
      </header>

      <Card className="p-5 space-y-4">
        <Field label="Nome do funcionário">
          <input className={inputCls} value={form.nome} onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))} />
        </Field>
        <Field label="Cargo (opcional)">
          <input className={inputCls} value={form.cargo} onChange={(e) => setForm((prev) => ({ ...prev, cargo: e.target.value }))} />
        </Field>
        <button onClick={add} className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white">Salvar funcionário</button>
      </Card>

      <Card className="p-0 overflow-hidden">
        {lista.length === 0 ? (
          <EmptyState text="Nenhum funcionário cadastrado ainda." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr><th className="text-left px-4 py-3">Nome</th><th className="text-left px-4 py-3">Cargo</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.map((funcionario) => (
                <tr key={funcionario.id}>
                  <td className="px-4 py-3 font-medium">{funcionario.nome}</td>
                  <td className="px-4 py-3 text-slate-500">{funcionario.cargo || "-"}</td>
                  <td className="px-4 py-3 text-right"><button onClick={() => remove(funcionario.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
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
        <p className="text-slate-500 text-sm mt-1">Visão rápida do seu sistema hoje, {fmtDate(todayISO())}.</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={TrendingUp} label="Faturado no mês" value={brl(stats.receitaMes)} tone="cyan" />
        <StatCard icon={TrendingDown} label="Faturamento diário" value={brl(stats.receitaDia)} tone="amber" />
        <StatCard icon={Wallet} label="A receber" value={brl(stats.aReceber)} tone="amber" />
        <StatCard icon={Landmark} label="A pagar" value={brl(stats.aPagar)} tone="red" />
        <StatCard icon={Boxes} label="Itens com estoque baixo" value={stats.estoqueBaixo.length} tone="slate" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-800">Últimas ordens de serviço</h2>
            <button onClick={() => setTab("nova-os")} className="text-orange-600 text-sm font-semibold flex items-center gap-1 hover:text-violet-700">
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
    cyan: "from-orange-500 to-violet-600",
    amber: "from-amber-400 to-orange-500",
    red: "from-rose-500 to-red-600",
    slate: "from-slate-500 to-slate-700",
  };
  return (
    <Card className="p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${tones[tone]} flex items-center justify-center text-white shrink-0 shadow-lg shadow-slate-200`}>
        <Icon size={19} />
      </div>
      <div className="min-w-0">
        <div className="text-slate-500 text-xs font-semibold uppercase tracking-[0.2em]">{label}</div>
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
  const [qtdParcelas, setQtdParcelas] = useState(1);
  const [funcionarioId, setFuncionarioId] = useState("");
  const [editandoItem, setEditandoItem] = useState(null);
  const [editForm, setEditForm] = useState({ descricao: "", valor: "", qtd: "" });

  const catalogo = tipoSel === "servico" ? db.servicos : db.produtos;
  const total = itens.reduce((s, i) => s + i.subtotal, 0);
  const mostraParcelas = formaPagamento === "Carteira";
  const hasServico = itens.some((item) => item.tipo === "servico");

  const addItem = () => {
    const src = catalogo.find((c) => c.id === itemSel);
    if (!src || qtd <= 0) return;
    const preco = tipoSel === "servico" ? src.preco : (src.precoVenda || src.precoCusto);
    const quantidade = Number(qtd);
    setItens((prev) => [
      ...prev,
      { uidLine: uid(), tipo: tipoSel, itemId: src.id, nome: src.nome, descricao: src.nome, qtd: quantidade, precoUnit: preco, subtotal: preco * quantidade },
    ]);
    setItemSel("");
    setQtd(1);
  };

  const removeItem = (uidLine) => {
    setItens((prev) => prev.filter((i) => i.uidLine !== uidLine));
    if (editandoItem === uidLine) {
      setEditandoItem(null);
      setEditForm({ descricao: "", valor: "", qtd: "" });
    }
  };

  const abrirEdicaoItem = (item) => {
    setEditandoItem(item.uidLine);
    setEditForm({ descricao: item.descricao || item.nome, valor: String(item.precoUnit), qtd: String(item.qtd) });
  };

  const salvarEdicaoItem = () => {
    const valor = Math.max(0, Number(editForm.valor || 0));
    const quantidade = Math.max(1, Number(editForm.qtd || 1));
    const descricao = (editForm.descricao || "").trim() || "Item";

    setItens((prev) =>
      prev.map((item) =>
        item.uidLine === editandoItem
          ? { ...item, descricao, nome: descricao, precoUnit: valor, qtd: quantidade, subtotal: valor * quantidade }
          : item
      )
    );
    setEditandoItem(null);
    setEditForm({ descricao: "", valor: "", qtd: "" });
  };

  const salvar = () => {
    if (itens.length === 0) return;
    if (hasServico && !funcionarioId) return;
    const cliente = db.clientes.find((c) => c.id === clienteId);
    const numero = (db.ordens.length + 1).toString().padStart(4, "0");
    const ordemId = uid();
    const isParcelado = mostraParcelas && qtdParcelas > 1;
    const pago = statusPagamento === "pago" ? total : statusPagamento === "parcial" ? Number(valorPago) : 0;
    const ordem = {
      id: ordemId,
      numero,
      data: todayISO(),
      clienteId,
      clienteNome: cliente?.nome || "Cliente Avulso",
      itens,
      total,
      formaPagamento,
      funcionarioId: hasServico ? funcionarioId : null,
      funcionarioNome: hasServico ? db.funcionarios.find((f) => f.id === funcionarioId)?.nome || "" : "",
      statusPagamento: isParcelado ? "pendente" : statusPagamento,
      valorPago: isParcelado ? 0 : pago,
      dataVencimento: isParcelado ? (vencimento || todayISO()) : (statusPagamento === "pago" ? null : vencimento),
      parcelas: isParcelado && qtdParcelas > 1 ? gerarParcelas(ordemId, total, qtdParcelas, vencimento || todayISO()) : null,
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
    setQtdParcelas(1);
    setFuncionarioId("");
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
          <button onClick={addItem} disabled={!itemSel} className="flex items-center gap-1.5 text-sm font-semibold text-violet-700 disabled:text-slate-300">
            <Plus size={16} /> Adicionar à ordem
          </button>
        </div>

        {itens.length > 0 && (
          <div className="divide-y divide-slate-100">
            {itens.map((i) => (
              <div key={i.uidLine} className="py-3">
                {editandoItem === i.uidLine ? (
                  <div className="space-y-2 rounded-xl border border-orange-200 bg-orange-50/70 p-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <Field label="Descrição">
                        <input className={inputCls} value={editForm.descricao} onChange={(e) => setEditForm((prev) => ({ ...prev, descricao: e.target.value }))} />
                      </Field>
                      <Field label="Valor">
                        <input type="number" min="0" className={inputCls} value={editForm.valor} onChange={(e) => setEditForm((prev) => ({ ...prev, valor: e.target.value }))} />
                      </Field>
                      <Field label="Qtd">
                        <input type="number" min="1" className={inputCls} value={editForm.qtd} onChange={(e) => setEditForm((prev) => ({ ...prev, qtd: e.target.value }))} />
                      </Field>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={salvarEdicaoItem} className="rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white">Salvar</button>
                      <button onClick={() => { setEditandoItem(null); setEditForm({ descricao: "", valor: "", qtd: "" }); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-sm gap-3">
                    <div>
                      <span className="font-medium">{i.descricao || i.nome}</span>
                      <span className="text-slate-400"> · {i.qtd}x {brl(i.precoUnit)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{brl(i.subtotal)}</span>
                      <button onClick={() => abrirEdicaoItem(i)} className="text-slate-400 hover:text-violet-600" title="Editar item">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => removeItem(i.uidLine)} className="text-slate-400 hover:text-red-500" title="Remover item">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div className="pt-3 flex items-center justify-between font-bold text-slate-900">
              <span>Total</span>
              <span>{brl(total)}</span>
            </div>
          </div>
        )}

        {hasServico && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
            <Field label="Funcionário responsável">
              <select className={inputCls} value={funcionarioId} onChange={(e) => setFuncionarioId(e.target.value)}>
                <option value="">Selecione...</option>
                {(db.funcionarios || []).map((funcionario) => (
                  <option key={funcionario.id} value={funcionario.id}>{funcionario.nome}</option>
                ))}
              </select>
            </Field>
            <p className="text-xs text-slate-500">Obrigatório quando houver serviço na ordem.</p>
          </div>
        )}

        <div className="pt-2 border-t border-slate-100 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="Forma de pagamento">
              <select className={inputCls} value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)}>
                <option>Dinheiro</option>
                <option>Pix</option>
                <option>Cartão de Débito</option>
                <option>Cartão de Crédito</option>
                <option>Carteira</option>
              </select>
            </Field>
            <Field label="Status do pagamento">
              <select className={inputCls} value={statusPagamento} onChange={(e) => setStatusPagamento(e.target.value)}>
                <option value="pago">À vista</option>
                <option value="pendente">A prazo</option>
                <option value="parcial">Entrada + prazo</option>
              </select>
            </Field>
            {mostraParcelas && (
              <Field label="Parcelas">
                <select className={inputCls} value={qtdParcelas} onChange={(e) => setQtdParcelas(Number(e.target.value))}>
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>{`${i + 1}x`}</option>
                  ))}
                </select>
              </Field>
            )}
            {statusPagamento === "parcial" && (
              <Field label="Valor pago">
                <input type="number" min="0" className={inputCls} value={valorPago} onChange={(e) => setValorPago(e.target.value)} />
              </Field>
            )}
          </div>

          {mostraParcelas && (
            <Field label="Vencimento inicial">
              <input type="date" className={inputCls} value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
            </Field>
          )}
        </div>

        <button
          onClick={salvar}
          disabled={itens.length === 0}
          className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-br from-orange-500 to-violet-600 text-white font-semibold text-sm disabled:opacity-40 hover:opacity-90 transition"
        >
          Salvar ordem de serviço
        </button>
      </Card>
    </div>
  );
}

// ---------- Ordens ----------
function Ordens({ db, update }) {
  const [editandoOrdemId, setEditandoOrdemId] = useState(null);
  const [editForm, setEditForm] = useState({
    clienteId: "",
    funcionarioId: "",
    formaPagamento: "Dinheiro",
    statusPagamento: "pago",
    valorPago: "",
    dataVencimento: "",
    itens: [],
  });

  const marcarPago = (id) =>
    update("ordens", (prev) => prev.map((o) => (o.id === id ? { ...o, statusPagamento: "pago", valorPago: o.total } : o)));

  const abrirEdicao = (ordem) => {
    setEditandoOrdemId(ordem.id);
    setEditForm({
      clienteId: ordem.clienteId || "",
      funcionarioId: ordem.funcionarioId || "",
      formaPagamento: ordem.formaPagamento || "Dinheiro",
      statusPagamento: ordem.statusPagamento || "pago",
      valorPago: String(Math.min(Number(ordem.valorPago || 0), Number(ordem.total || 0))),
      dataVencimento: ordem.dataVencimento || "",
      itens: (ordem.itens || []).map((item) => ({ ...item, descricao: item.descricao || item.nome || "", precoUnit: Number(item.precoUnit || 0), qtd: Number(item.qtd || 1) })),
    });
  };

  const cancelarEdicao = () => {
    setEditandoOrdemId(null);
    setEditForm({ clienteId: "", funcionarioId: "", formaPagamento: "Dinheiro", statusPagamento: "pago", valorPago: "", dataVencimento: "", itens: [] });
  };

  const atualizarItemEdicao = (uidLine, campo, valor) => {
    setEditForm((prev) => ({
      ...prev,
      itens: prev.itens.map((item) => (item.uidLine === uidLine ? { ...item, [campo]: campo === "precoUnit" ? Number(valor || 0) : campo === "qtd" ? Math.max(1, Number(valor || 1)) : valor } : item)),
    }));
  };

  const removerItemEdicao = (uidLine) => {
    setEditForm((prev) => ({ ...prev, itens: prev.itens.filter((item) => item.uidLine !== uidLine) }));
  };

  const salvarEdicao = () => {
    if (!editandoOrdemId) return;
    const ordemAtual = db.ordens.find((o) => o.id === editandoOrdemId);
    if (!ordemAtual) return;
    const itensValidos = editForm.itens.filter((item) => item && item.descricao && Number(item.qtd || 1) > 0);
    if (!itensValidos.length) return;

    const hasServico = itensValidos.some((item) => item.tipo === "servico");
    if (hasServico && !editForm.funcionarioId) return;

    const totalEditado = itensValidos.reduce((s, item) => s + Number(item.precoUnit || 0) * Number(item.qtd || 1), 0);
    const statusPagamento = editForm.statusPagamento;
    const valorPago = statusPagamento === "pago" ? totalEditado : statusPagamento === "parcial" ? Math.min(Math.max(Number(editForm.valorPago || 0), 0), totalEditado) : 0;
    const dataVencimento = statusPagamento === "pago" ? null : editForm.dataVencimento || null;

    const produtosAntes = (ordemAtual.itens || []).filter((item) => item.tipo === "produto").reduce((acc, item) => {
      acc[item.itemId] = (acc[item.itemId] || 0) + Number(item.qtd || 1);
      return acc;
    }, {});
    const produtosDepois = itensValidos.filter((item) => item.tipo === "produto").reduce((acc, item) => {
      acc[item.itemId] = (acc[item.itemId] || 0) + Number(item.qtd || 1);
      return acc;
    }, {});

    update("ordens", (prev) =>
      prev.map((o) => {
        if (o.id !== editandoOrdemId) return o;
        const cliente = db.clientes.find((c) => c.id === editForm.clienteId);
        const funcionario = (db.funcionarios || []).find((f) => f.id === editForm.funcionarioId);
        return {
          ...o,
          clienteId: editForm.clienteId,
          clienteNome: cliente?.nome || o.clienteNome || "Cliente Avulso",
          itens: itensValidos.map((item) => ({ ...item, subtotal: Number(item.precoUnit || 0) * Number(item.qtd || 1) })),
          total: totalEditado,
          formaPagamento: editForm.formaPagamento,
          funcionarioId: hasServico ? editForm.funcionarioId : null,
          funcionarioNome: hasServico ? funcionario?.nome || "" : "",
          statusPagamento,
          valorPago,
          dataVencimento,
        };
      })
    );

    update("produtos", (prev) =>
      prev.map((p) => {
        const antes = Number(produtosAntes[p.id] || 0);
        const depois = Number(produtosDepois[p.id] || 0);
        if (!antes && !depois) return p;
        return { ...p, quantidade: Math.max(0, Number(p.quantidade) + (antes - depois)) };
      })
    );

    cancelarEdicao();
  };

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

      {editandoOrdemId && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Editar ordem de serviço</h2>
            <button onClick={cancelarEdicao} className="text-sm text-slate-500 hover:text-slate-700">Cancelar</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Cliente">
              <select className={inputCls} value={editForm.clienteId} onChange={(e) => setEditForm((prev) => ({ ...prev, clienteId: e.target.value }))}>
                {db.clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>{cliente.nome}</option>
                ))}
              </select>
            </Field>
            <Field label="Funcionário">
              <select className={inputCls} value={editForm.funcionarioId} onChange={(e) => setEditForm((prev) => ({ ...prev, funcionarioId: e.target.value }))}>
                <option value="">Selecione...</option>
                {(db.funcionarios || []).map((funcionario) => (
                  <option key={funcionario.id} value={funcionario.id}>{funcionario.nome}</option>
                ))}
              </select>
            </Field>
            <Field label="Forma de pagamento">
              <select className={inputCls} value={editForm.formaPagamento} onChange={(e) => setEditForm((prev) => ({ ...prev, formaPagamento: e.target.value }))}>
                <option>Dinheiro</option>
                <option>Pix</option>
                <option>Cartão de Débito</option>
                <option>Cartão de Crédito</option>
                <option>Carteira</option>
              </select>
            </Field>
            <Field label="Status">
              <select className={inputCls} value={editForm.statusPagamento} onChange={(e) => setEditForm((prev) => ({ ...prev, statusPagamento: e.target.value }))}>
                <option value="pago">À vista</option>
                <option value="pendente">A prazo</option>
                <option value="parcial">Entrada + prazo</option>
              </select>
            </Field>
          </div>

          {editForm.statusPagamento === "parcial" && (
            <Field label="Valor pago">
              <input type="number" min="0" className={inputCls} value={editForm.valorPago} onChange={(e) => setEditForm((prev) => ({ ...prev, valorPago: e.target.value }))} />
            </Field>
          )}

          <Field label="Vencimento">
            <input type="date" className={inputCls} value={editForm.dataVencimento} onChange={(e) => setEditForm((prev) => ({ ...prev, dataVencimento: e.target.value }))} />
          </Field>

          <div className="space-y-2">
            <div className="text-sm font-semibold text-slate-700">Itens da ordem</div>
            {editForm.itens.map((item) => (
              <div key={item.uidLine} className="rounded-xl border border-slate-200 p-3 space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <Field label="Descrição">
                    <input className={inputCls} value={item.descricao || ""} onChange={(e) => atualizarItemEdicao(item.uidLine, "descricao", e.target.value)} />
                  </Field>
                  <Field label="Valor">
                    <input type="number" min="0" className={inputCls} value={item.precoUnit} onChange={(e) => atualizarItemEdicao(item.uidLine, "precoUnit", e.target.value)} />
                  </Field>
                  <Field label="Qtd">
                    <input type="number" min="1" className={inputCls} value={item.qtd} onChange={(e) => atualizarItemEdicao(item.uidLine, "qtd", e.target.value)} />
                  </Field>
                </div>
                <div className="flex justify-end">
                  <button onClick={() => removerItemEdicao(item.uidLine)} className="text-sm text-red-500 hover:text-red-600">Remover item</button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <button onClick={salvarEdicao} className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white">Salvar alterações</button>
          </div>
        </Card>
      )}

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
                <th className="text-left px-4 py-3">Funcionário</th>
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
                  <td className="px-4 py-3 text-slate-500">{o.funcionarioNome || "-"}</td>
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
                      <button onClick={() => abrirEdicao(o)} className="text-slate-400 hover:text-violet-600" title="Editar ordem">
                        <Pencil size={16} />
                      </button>
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
function Clientes({ db, update, empresaSegmento = "lava-jato" }) {
  const [form, setForm] = useState({ nome: "", telefone: "", veiculo: "", placa: "" });
  const [busca, setBusca] = useState("");

  const add = () => {
    if (!form.nome.trim()) return;
    update("clientes", (prev) => [...prev, { id: uid(), ...form }]);
    setForm({ nome: "", telefone: "", veiculo: "", placa: "" });
  };
  const mostraCamposVeiculo = (empresaSegmento || "lava-jato").toLowerCase() === "lava-jato";
  const remove = (id) => update("clientes", (prev) => prev.filter((c) => c.id !== id));

  const lista = db.clientes.filter((c) => c.nome.toLowerCase().includes(busca.toLowerCase()));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="headline text-2xl font-bold text-slate-900">Clientes</h1>
        <p className="text-slate-500 text-sm mt-1">Cadastre clientes e seus veículos.</p>
      </header>

      <Card className="p-5">
        <div className={`grid grid-cols-1 gap-3 ${mostraCamposVeiculo ? "sm:grid-cols-4" : "sm:grid-cols-2"}`}>
          <Field label="Nome"><input className={inputCls} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Field>
          <Field label="Telefone"><input className={inputCls} value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></Field>
          {mostraCamposVeiculo && (
            <>
              <Field label="Veículo"><input className={inputCls} value={form.veiculo} onChange={(e) => setForm({ ...form, veiculo: e.target.value })} /></Field>
              <Field label="Placa"><input className={inputCls} value={form.placa} onChange={(e) => setForm({ ...form, placa: e.target.value })} /></Field>
            </>
          )}
        </div>
        <button onClick={add} className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-violet-700"><Plus size={16} /> Adicionar cliente</button>
      </Card>

      <div className="relative max-w-xs">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className={inputCls + " pl-8"} placeholder="Buscar cliente..." value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      <Card className="p-0 overflow-hidden">
        {lista.length === 0 ? <EmptyState text="Nenhum cliente encontrado." /> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr><th className="text-left px-4 py-3">Nome</th><th className="text-left px-4 py-3">Telefone</th>{mostraCamposVeiculo && <><th className="text-left px-4 py-3">Veículo</th><th className="text-left px-4 py-3">Placa</th></>}<th className="px-4 py-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-medium">{c.nome}</td>
                  <td className="px-4 py-3 text-slate-500">{c.telefone || "-"}</td>
                  {mostraCamposVeiculo && <><td className="px-4 py-3 text-slate-500">{c.veiculo || "-"}</td><td className="px-4 py-3 text-slate-500">{c.placa || "-"}</td></>}
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
        <button onClick={add} className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-violet-700"><Plus size={16} /> Adicionar serviço</button>
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
  const [acerto, setAcerto] = useState({ produtoId: db.produtos[0]?.id || "", tipo: "corrigir", valor: "" });

  useEffect(() => {
    setAcerto((prev) => ({ ...prev, produtoId: prev.produtoId || db.produtos[0]?.id || "" }));
  }, [db.produtos]);

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
  const editarProduto = (id, campo, valor) =>
    update("produtos", (prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        if (campo === "nome") return { ...p, nome: valor };
        return { ...p, [campo]: Number(valor) };
      })
    );

  const salvarAcerto = () => {
    if (!acerto.produtoId) return;
    const valor = Math.max(0, Number(acerto.valor || 0));
    update("produtos", (prev) =>
      prev.map((p) => {
        if (p.id !== acerto.produtoId) return p;
        const atual = Number(p.quantidade || 0);
        const novaQuantidade = acerto.tipo === "adicionar" ? atual + valor : valor;
        return { ...p, quantidade: Math.max(0, novaQuantidade) };
      })
    );
    setAcerto((prev) => ({ ...prev, valor: "" }));
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="headline text-2xl font-bold text-slate-900">Estoque</h1>
        <p className="text-slate-500 text-sm mt-1">Produtos usados ou vendidos no sistema.</p>
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
        <button onClick={add} className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-violet-700"><Plus size={16} /> Adicionar produto</button>
      </Card>

      <Card className="p-5 bg-slate-50 border border-slate-200 space-y-3">
        <div className="text-sm font-semibold text-slate-700">Acerto de estoque</div>
        <div className="grid grid-cols-1 sm:grid-cols-[1.2fr_0.9fr_0.8fr_auto] gap-3">
          <Field label="Produto">
            <select className={inputCls} value={acerto.produtoId} onChange={(e) => setAcerto((prev) => ({ ...prev, produtoId: e.target.value }))}>
              {db.produtos.map((produto) => (
                <option key={produto.id} value={produto.id}>{produto.nome}</option>
              ))}
            </select>
          </Field>
          <Field label="Tipo">
            <select className={inputCls} value={acerto.tipo} onChange={(e) => setAcerto((prev) => ({ ...prev, tipo: e.target.value }))}>
              <option value="corrigir">Corrigir para</option>
              <option value="adicionar">Adicionar</option>
            </select>
          </Field>
          <Field label="Quantidade">
            <input type="number" min="0" className={inputCls} value={acerto.valor} onChange={(e) => setAcerto((prev) => ({ ...prev, valor: e.target.value }))} />
          </Field>
          <div className="flex items-end">
            <button onClick={salvarAcerto} className="w-full rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white">Salvar acerto</button>
          </div>
        </div>
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
                    <td className="px-4 py-3 font-medium">
                      <input
                        className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                        value={p.nome}
                        onChange={(e) => editarProduto(p.id, "nome", e.target.value)}
                      />
                      {baixo && <span className="ml-2"><Badge tone="amber">baixo</Badge></span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => ajustar(p.id, -1)} className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-600">−</button>
                        <span className="w-10 text-center">{p.quantidade} {p.unidade}</span>
                        <button onClick={() => ajustar(p.id, 1)} className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-600">+</button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      <input
                        type="number"
                        className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                        value={p.estoqueMinimo}
                        onChange={(e) => editarProduto(p.id, "estoqueMinimo", e.target.value)}
                      />
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      <input
                        type="number"
                        className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                        value={p.precoCusto}
                        onChange={(e) => editarProduto(p.id, "precoCusto", e.target.value)}
                      />
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      <input
                        type="number"
                        className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                        value={p.precoVenda}
                        onChange={(e) => editarProduto(p.id, "precoVenda", e.target.value)}
                      />
                    </td>
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
  const [baixa, setBaixa] = useState({ id: null, originalId: null, valor: "", data: todayISO(), formaPagamento: "Dinheiro" });

  const pendentes = contasReceberFormatadas(db.ordens)
    .filter((o) => o.statusPagamento !== "pago")
    .sort((a, b) => (a.dataVencimento || "") > (b.dataVencimento || "") ? 1 : -1);

  const abrirBaixa = (ordem) => {
    const restante = Math.max(0, Number(ordem.valorParcela || 0) - Number(ordem.valorPago || 0));
    setBaixa({
      id: ordem.id,
      originalId: ordem.originalId,
      valor: String(restante),
      data: ordem.dataBaixa || todayISO(),
      formaPagamento: ordem.formaPagamentoBaixa || ordem.formaPagamento || "Dinheiro",
    });
  };

  const atualizarVencimento = (id, valor) =>
    update("ordens", (prev) => prev.map((o) => {
      if (o.id !== id && (!Array.isArray(o.parcelas) || !o.parcelas.some((p) => p.id === id))) return o;
      if (!Array.isArray(o.parcelas) || !o.parcelas.length) {
        return o.id === id ? { ...o, dataVencimento: valor } : o;
      }
      return {
        ...o,
        parcelas: o.parcelas.map((p) => (p.id === id ? { ...p, dataVencimento: valor } : p)),
      };
    }));

  const confirmarBaixa = () => {
    if (!baixa.id) return;
    const ordem = db.ordens.find((o) => o.id === baixa.originalId);
    if (!ordem) return;

    const restante = Math.max(0, Number(baixa.valor || 0));
    const valor = Math.min(Math.max(toNumber(baixa.valor), 0), restante);
    if (valor <= 0) return;

    const parcelaAtual = Array.isArray(ordem.parcelas) && ordem.parcelas.length
      ? ordem.parcelas.find((p) => p.id === baixa.id)
      : null;
    const valorRestante = parcelaAtual ? Number(parcelaAtual.valor) - Number(parcelaAtual.valorPago || 0) : Number(ordem.total) - Number(ordem.valorPago || 0);
    const valorPago = Math.min(Math.max(toNumber(baixa.valor), 0), valorRestante);

    update("ordens", (prev) =>
      prev.map((o) => {
        if (o.id !== baixa.originalId) return o;
        if (!Array.isArray(o.parcelas) || !o.parcelas.length) {
          const totalPago = Number(o.valorPago || 0) + valorPago;
          const restanteAtual = Number(o.total) - totalPago;
          return {
            ...o,
            valorPago: Math.min(totalPago, Number(o.total)),
            dataBaixa: baixa.data || todayISO(),
            formaPagamentoBaixa: baixa.formaPagamento || "Dinheiro",
            statusPagamento: restanteAtual <= 0 ? "pago" : "parcial",
          };
        }
        return {
          ...o,
          parcelas: o.parcelas.map((p) => {
            if (p.id !== baixa.id) return p;
            const totalPago = Number(p.valorPago || 0) + valorPago;
            const restanteAtual = Number(p.valor) - totalPago;
            return {
              ...p,
              valorPago: Math.min(totalPago, Number(p.valor)),
              dataBaixa: baixa.data || todayISO(),
              formaPagamentoBaixa: baixa.formaPagamento || "Dinheiro",
              status: restanteAtual <= 0 ? "pago" : "parcial",
            };
          }),
        };
      })
    );
    setBaixa({ id: null, originalId: null, valor: "", data: todayISO(), formaPagamento: "Dinheiro" });
  };

  const totalPendente = pendentes.reduce((s, o) => s + Math.max(0, Number(o.valorParcela || 0) - Number(o.valorPago || 0)), 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="headline text-2xl font-bold text-slate-900">Contas a receber</h1>
        <p className="text-slate-500 text-sm mt-1">Gerado automaticamente a partir das ordens de serviço pendentes ou parciais.</p>
      </header>

      <StatCard icon={Wallet} label="Total pendente" value={brl(totalPendente)} tone="amber" />

      {baixa.id && (
        <Card className="p-4 bg-slate-50">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="Valor da baixa">
              <input type="number" min="0" className={inputCls} value={baixa.valor} onChange={(e) => setBaixa((prev) => ({ ...prev, valor: e.target.value }))} />
            </Field>
            <Field label="Data da baixa">
              <input type="date" className={inputCls} value={baixa.data} onChange={(e) => setBaixa((prev) => ({ ...prev, data: e.target.value }))} />
            </Field>
            <Field label="Forma de baixa">
              <select className={inputCls} value={baixa.formaPagamento} onChange={(e) => setBaixa((prev) => ({ ...prev, formaPagamento: e.target.value }))}>
                <option>Dinheiro</option>
                <option>Pix</option>
                <option>Cartão de Débito</option>
                <option>Cartão de Crédito</option>
                <option>Carteira</option>
              </select>
            </Field>
            <div className="flex gap-2">
              <button onClick={confirmarBaixa} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Confirmar baixa</button>
              <button onClick={() => setBaixa({ id: null, originalId: null, valor: "", data: todayISO(), formaPagamento: "Dinheiro" })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancelar</button>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-0 overflow-hidden">
        {pendentes.length === 0 ? <EmptyState text="Nenhuma conta a receber no momento." /> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr><th className="text-left px-4 py-3">OS</th><th className="text-left px-4 py-3">Cliente</th><th className="text-left px-4 py-3">Vencimento</th><th className="text-right px-4 py-3">Valor pendente</th><th className="text-left px-4 py-3">Baixa</th><th className="text-left px-4 py-3">Status</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pendentes.map((o) => {
                const vencida = o.dataVencimento && o.dataVencimento < todayISO();
                return (
                  <tr key={o.id}>
                    <td className="px-4 py-3 font-medium">
                      #{o.numero}
                      {o.totalParcelas > 1 ? ` · ${o.numeroParcela}/${o.totalParcelas}` : ""}
                    </td>
                    <td className="px-4 py-3">{o.clienteNome}</td>
                    <td className="px-4 py-3 text-slate-500">
                      <input
                        type="date"
                        className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                        value={o.dataVencimento || ""}
                        onChange={(e) => atualizarVencimento(o.id, e.target.value)}
                      />
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{brl(Math.max(0, Number(o.valorParcela || 0) - Number(o.valorPago || 0)))}</td>
                    <td className="px-4 py-3 text-slate-500">{o.dataBaixa ? fmtDate(o.dataBaixa) : "-"}</td>
                    <td className="px-4 py-3">{vencida ? <Badge tone="red">Vencida</Badge> : <StatusBadge status={o.statusPagamento} />}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => abrirBaixa(o)} className="text-emerald-600 hover:text-emerald-700" title="Registrar baixa"><CheckCircle2 size={17} /></button>
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
  const [baixa, setBaixa] = useState({ id: null, valor: "", data: todayISO(), formaPagamento: "Dinheiro" });

  const add = () => {
    if (!form.descricao.trim() || form.valor === "") return;
    update("contasPagar", (prev) => [...prev, { id: uid(), ...form, valor: Number(form.valor), status: "pendente", valorPago: 0, dataPagamento: null, dataBaixa: null }]);
    setForm({ descricao: "", categoria: "Fornecedor", valor: "", vencimento: todayISO() });
  };

  const abrirBaixa = (conta) => {
    const restante = Math.max(0, Number(conta.valor) - Number(conta.valorPago || 0));
    setBaixa({
      id: conta.id,
      valor: String(restante),
      data: conta.dataBaixa || todayISO(),
      formaPagamento: conta.formaPagamentoBaixa || "Dinheiro",
    });
  };

  const atualizarVencimento = (id, valor) =>
    update("contasPagar", (prev) => prev.map((c) => (c.id === id ? { ...c, vencimento: valor } : c)));

  const confirmarBaixa = () => {
    if (!baixa.id) return;
    const conta = db.contasPagar.find((c) => c.id === baixa.id);
    if (!conta) return;

    const restante = Math.max(0, Number(conta.valor) - Number(conta.valorPago || 0));
    const valor = Math.min(Math.max(toNumber(baixa.valor), 0), restante);
    if (valor <= 0) return;

    const totalPago = Number(conta.valorPago || 0) + valor;
    update("contasPagar", (prev) =>
      prev.map((c) =>
        c.id !== baixa.id
          ? c
          : {
              ...c,
              valorPago: Math.min(totalPago, Number(c.valor)),
              dataBaixa: baixa.data || todayISO(),
              formaPagamentoBaixa: baixa.formaPagamento || "Dinheiro",
              status: totalPago >= Number(c.valor) ? "pago" : "parcial",
            }
      )
    );
    setBaixa({ id: null, valor: "", data: todayISO(), formaPagamento: "Dinheiro" });
  };

  const remove = (id) => update("contasPagar", (prev) => prev.filter((c) => c.id !== id));

  const lista = [...db.contasPagar].sort((a, b) => (a.vencimento > b.vencimento ? 1 : -1));
  const totalPendente = lista.reduce((s, c) => s + Math.max(0, Number(c.valor) - Number(c.valorPago || 0)), 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="headline text-2xl font-bold text-slate-900">Contas a pagar</h1>
        <p className="text-slate-500 text-sm mt-1">Fornecedores, contas fixas e outras despesas.</p>
      </header>

      <StatCard icon={Landmark} label="Total pendente" value={brl(totalPendente)} tone="red" />

      {baixa.id && (
        <Card className="p-4 bg-slate-50">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="Valor da baixa">
              <input type="number" min="0" className={inputCls} value={baixa.valor} onChange={(e) => setBaixa((prev) => ({ ...prev, valor: e.target.value }))} />
            </Field>
            <Field label="Data da baixa">
              <input type="date" className={inputCls} value={baixa.data} onChange={(e) => setBaixa((prev) => ({ ...prev, data: e.target.value }))} />
            </Field>
            <Field label="Forma de baixa">
              <select className={inputCls} value={baixa.formaPagamento} onChange={(e) => setBaixa((prev) => ({ ...prev, formaPagamento: e.target.value }))}>
                <option>Dinheiro</option>
                <option>Pix</option>
                <option>Cartão de Débito</option>
                <option>Cartão de Crédito</option>
                <option>Carteira</option>
              </select>
            </Field>
            <div className="flex gap-2">
              <button onClick={confirmarBaixa} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Confirmar baixa</button>
              <button onClick={() => setBaixa({ id: null, valor: "", data: todayISO(), formaPagamento: "Dinheiro" })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancelar</button>
            </div>
          </div>
        </Card>
      )}

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
        <button onClick={add} className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-violet-700"><Plus size={16} /> Adicionar conta</button>
      </Card>

      <Card className="p-0 overflow-hidden">
        {lista.length === 0 ? <EmptyState text="Nenhuma conta a pagar cadastrada." /> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr><th className="text-left px-4 py-3">Descrição</th><th className="text-left px-4 py-3">Categoria</th><th className="text-left px-4 py-3">Vencimento</th><th className="text-right px-4 py-3">Valor</th><th className="text-left px-4 py-3">Baixa</th><th className="text-left px-4 py-3">Status</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.map((c) => {
                const vencida = c.status !== "pago" && c.vencimento < todayISO();
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-medium">{c.descricao}</td>
                    <td className="px-4 py-3 text-slate-500">{c.categoria}</td>
                    <td className="px-4 py-3 text-slate-500">
                      <input
                        type="date"
                        className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                        value={c.vencimento || ""}
                        onChange={(e) => atualizarVencimento(c.id, e.target.value)}
                      />
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{brl(c.valor)}</td>
                    <td className="px-4 py-3 text-slate-500">{c.dataBaixa ? fmtDate(c.dataBaixa) : "-"}</td>
                    <td className="px-4 py-3">
                      {c.status === "pago" ? <Badge tone="green">Pago</Badge> : c.status === "parcial" ? <Badge tone="amber">Parcial</Badge> : vencida ? <Badge tone="red">Vencida</Badge> : <Badge tone="amber">Pendente</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        {c.status !== "pago" && (
                          <button onClick={() => abrirBaixa(c)} className="text-emerald-600 hover:text-emerald-700" title="Registrar baixa"><CheckCircle2 size={17} /></button>
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
