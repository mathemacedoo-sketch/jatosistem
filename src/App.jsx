import { useEffect, useMemo, useRef, useState } from "react";
import { createCliente, loadDatabase, syncDatabase } from "./lib/database";

import {
  LayoutDashboard,
  FilePlus2,
  ClipboardList,
  Users,
  Sparkles,
  Boxes,
  Wallet,
  Landmark,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Plus,
  X,
  Droplets,
  TrendingUp,
  TrendingDown,
  Search,
  Building2,
  UserCog,
  Pencil,
  Printer,
  RotateCcw
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
const DEFAULT_ADMIN_PASSWORD = "admin";

const onlyDigits = (value = "") => value.replace(/\D/g, "");
const formatCpfCnpj = (value = "") => {
  const digits = onlyDigits(value).slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
};
const formatTelefone = (value = "") => {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d{4})$/, "$1-$2")
    .replace(/(\d{4})(\d{4})$/, "$1-$2");
};
const formatCep = (value = "") => onlyDigits(value).slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");
const escapeHtml = (value = "") =>
  String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));

const imprimirReciboOS = (ordem, empresa = {}, cliente = {}) => {
  const janela = window.open("", "_blank", "width=820,height=900");
  if (!janela) {
    window.alert("O navegador bloqueou a janela de impressão. Permita pop-ups para imprimir o recibo.");
    return;
  }

  const enderecoEmpresa = [empresa.endereco, empresa.numero, empresa.bairro, empresa.cidade, empresa.estado].filter(Boolean).join(", ");
  const enderecoCliente = [cliente.endereco, cliente.numero, cliente.bairro, cliente.cidade, cliente.estado].filter(Boolean).join(", ");
  const itens = (ordem.itens || []).map((item) => `
    <tr>
      <td>${escapeHtml(item.descricao || item.nome)}</td>
      <td class="center">${escapeHtml(item.qtd)}</td>
      <td class="right">${escapeHtml(brl(item.precoUnit))}</td>
      <td class="right">${escapeHtml(brl(item.subtotal ?? Number(item.precoUnit || 0) * Number(item.qtd || 1)))}</td>
    </tr>`).join("");

  janela.document.write(`<!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>OS ${escapeHtml(ordem.numero)}</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 28px; color: #172033; font: 14px Arial, sans-serif; }
          .receipt { max-width: 760px; margin: 0 auto; border: 1px solid #cbd5e1; padding: 26px; }
          .header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #172033; padding-bottom: 18px; }
          h1 { margin: 0 0 5px; font-size: 24px; } h2 { margin: 0; font-size: 20px; }
          .muted { color: #64748b; } .section { margin-top: 20px; }
          .section-title { margin-bottom: 8px; font-size: 12px; font-weight: bold; text-transform: uppercase; color: #64748b; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px 24px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { border-bottom: 1px solid #e2e8f0; padding: 9px 6px; text-align: left; }
          th { background: #f8fafc; font-size: 11px; text-transform: uppercase; color: #64748b; }
          .right { text-align: right; } .center { text-align: center; }
          .total { margin-top: 15px; text-align: right; font-size: 20px; font-weight: bold; }
          .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 50px; margin-top: 70px; text-align: center; }
          .signature { border-top: 1px solid #334155; padding-top: 8px; }
          .print-note { margin-top: 25px; text-align: center; font-size: 11px; color: #94a3b8; }
          .actions { max-width: 760px; margin: 0 auto 16px; display: flex; justify-content: flex-end; gap: 10px; }
          .actions button { border: 0; border-radius: 9px; padding: 11px 18px; cursor: pointer; font-weight: bold; }
          .print-button { background: #ea580c; color: white; }
          .close-button { background: #e2e8f0; color: #334155; }
          @media print { body { padding: 0; } .actions { display: none; } .receipt { border: 0; max-width: none; } @page { margin: 12mm; } }
        </style>
      </head>
      <body>
        <div class="actions">
          <button class="close-button" onclick="window.close()">Fechar</button>
          <button class="print-button" onclick="window.print()">Imprimir / Salvar PDF</button>
        </div>
        <main class="receipt">
          <div class="header">
            <div>
              <h1>${escapeHtml(empresa.nome || "Empresa")}</h1>
              ${empresa.razaoSocial ? `<div>${escapeHtml(empresa.razaoSocial)}</div>` : ""}
              ${empresa.cnpj ? `<div>CNPJ: ${escapeHtml(empresa.cnpj)}</div>` : ""}
              ${enderecoEmpresa ? `<div class="muted">${escapeHtml(enderecoEmpresa)}</div>` : ""}
              ${empresa.telefone || empresa.email ? `<div class="muted">${escapeHtml([empresa.telefone, empresa.email].filter(Boolean).join(" · "))}</div>` : ""}
            </div>
            <div class="right"><h2>ORDEM DE SERVIÇO</h2><div>Nº ${escapeHtml(ordem.numero)}</div><div class="muted">${escapeHtml(fmtDate(ordem.data))}</div></div>
          </div>
          <section class="section">
            <div class="section-title">Cliente</div>
            <div class="grid">
              <div><strong>Nome:</strong> ${escapeHtml(ordem.clienteNome || cliente.nome || "-")}</div>
              <div><strong>CPF/CNPJ:</strong> ${escapeHtml(cliente.cpfCnpj || "-")}</div>
              <div><strong>Telefone:</strong> ${escapeHtml(cliente.telefone || "-")}</div>
              <div><strong>E-mail:</strong> ${escapeHtml(cliente.email || "-")}</div>
              ${enderecoCliente ? `<div style="grid-column:1/-1"><strong>Endereço:</strong> ${escapeHtml(enderecoCliente)}</div>` : ""}
              ${ordem.veiculo || cliente.veiculo || ordem.placa || cliente.placa ? `<div style="grid-column:1/-1"><strong>Veículo:</strong> ${escapeHtml([ordem.marca || cliente.marca, ordem.veiculo || cliente.veiculo].filter(Boolean).join(" ") || "-")} ${ordem.cor || cliente.cor ? `· ${escapeHtml(ordem.cor || cliente.cor)}` : ""} ${ordem.ano || cliente.ano ? `· ${escapeHtml(ordem.ano || cliente.ano)}` : ""} ${ordem.placa || cliente.placa ? `· Placa ${escapeHtml(ordem.placa || cliente.placa)}` : ""}</div>` : ""}
              ${ordem.motorista || cliente.motorista ? `<div style="grid-column:1/-1"><strong>Motorista/Responsável:</strong> ${escapeHtml(ordem.motorista || cliente.motorista)}</div>` : ""}
            </div>
          </section>
          <section class="section">
            <div class="section-title">Itens da ordem</div>
            <table><thead><tr><th>Descrição</th><th class="center">Qtd.</th><th class="right">Unitário</th><th class="right">Subtotal</th></tr></thead><tbody>${itens}</tbody></table>
            <div class="total">Total: ${escapeHtml(brl(ordem.total))}</div>
          </section>
          <section class="section grid">
            <div><strong>Pagamento:</strong> ${escapeHtml(ordem.formaPagamento || "-")}</div>
            <div><strong>Status:</strong> ${escapeHtml(ordem.statusPagamento || "-")}</div>
            <div><strong>Responsável:</strong> ${escapeHtml(ordem.funcionarioNome || "-")}</div>
            <div><strong>Valor pago:</strong> ${escapeHtml(brl(ordem.valorPago || 0))}</div>
          </section>
          <div class="signatures"><div class="signature">Assinatura da empresa</div><div class="signature">Assinatura do cliente</div></div>
          <div class="print-note">No diálogo de impressão, selecione “Salvar como PDF” para gerar o arquivo.</div>
        </main>
      </body>
    </html>`);
  janela.document.close();
  janela.focus();
};

const createEmpresa = ({ nome, segmento = "lava-jato", ...dadosCadastrais }) => ({
  id: uid(),
  nome: nome.trim(),
  segmento: segmento?.trim() || "lava-jato",
  ...dadosCadastrais,
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
  ordens.filter((ordem) => !["rascunho", "pendente", "estornado"].includes(ordem.statusOS)).flatMap((ordem) => {
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
      formaPagamentoBaixa: parcela.formaPagamentoBaixa || ordem.formaPagamentoBaixa || null,
    }));
  });

const valorRecebidoOrdem = (ordem, incluirData = () => true) => {
  if (Array.isArray(ordem.parcelas) && ordem.parcelas.length) {
    return ordem.parcelas.reduce(
      (total, parcela) => total + (parcela.dataBaixa && incluirData(parcela.dataBaixa) ? Number(parcela.valorPago || 0) : 0),
      0
    );
  }
  const dataRecebimento = ordem.formaPagamento === "Carteira" ? ordem.dataBaixa : ordem.data;
  const valor = ordem.statusPagamento === "pago" ? Number(ordem.total || 0) : Number(ordem.valorPago || 0);
  return dataRecebimento && incluirData(dataRecebimento) ? valor : 0;
};

const empresaAdmId = "empresa-admin";
const usuarioAdmId = "usuario-admin";

const SEED = {
  empresas: [
    { id: empresaAdmId, nome: "ADM", segmento: "lava-jato", status: "ativo", criadoEm: todayISO() },
  ],
  usuarios: [
    { id: usuarioAdmId, nome: "Administrador", usuario: "admin", senha: DEFAULT_ADMIN_PASSWORD, empresaId: empresaAdmId, perfil: "master" },
  ],
  clientes: [
    { id: uid(), nome: "Consumidor", telefone: "", veiculo: "", placa: "", empresaId: empresaAdmId },
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
  const [ordemEmEdicao, setOrdemEmEdicao] = useState(null);
  const [auth, setAuth] = useState({ usuario: "", senha: "", empresaId: "", usuarioLogado: null });
  const saveTimer = useRef(null);
  const lastSynced = useRef(SEED);
  const syncQueue = useRef(Promise.resolve());

  useEffect(() => {
    (async () => {
      let initialData = SEED;
      let remoteInitialized = true;
      try {
        const loadedDatabase = await loadDatabase(SEED);
        initialData = loadedDatabase.database;
        remoteInitialized = loadedDatabase.initialized;
      } catch (error) {
        console.error("Erro ao carregar o Supabase; usando cópia local:", error);
        const localData = localStorage.getItem(STORAGE_KEY);
        if (localData) initialData = { ...SEED, ...JSON.parse(localData) };
      } finally {
        initialData = {
          ...initialData,
          empresas: (initialData.empresas || []).length ? initialData.empresas : SEED.empresas,
          usuarios: (() => {
            const usuarios = initialData.usuarios || [];
            const master = usuarios.find((usuario) => usuario.usuario === "admin" && usuario.perfil === "master");
            if (master) {
              return usuarios.map((usuario) => usuario.id === master.id ? { ...usuario, senha: "admin" } : usuario);
            }
            return [...usuarios, SEED.usuarios[0]];
          })(),
          clientes: (initialData.clientes || []).map((cliente) => cliente.nome === "Cliente Avulso" ? { ...cliente, nome: "Consumidor" } : cliente),
          ordens: (initialData.ordens || []).map((ordem) => ordem.clienteNome === "Cliente Avulso" ? { ...ordem, clienteNome: "Consumidor" } : ordem),
        };
        lastSynced.current = remoteInitialized ? initialData : {
          ...initialData,
          empresas: [],
          usuarios: [],
          funcionarios: [],
          servicos: [],
          produtos: [],
          ordens: [],
          contasPagar: [],
        };
        setDb(initialData);
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
  if (!loaded) return;

  if (saveTimer.current) {
    clearTimeout(saveTimer.current);
  }

  const snapshot = JSON.parse(JSON.stringify(db));
  saveTimer.current = setTimeout(() => {
    syncQueue.current = syncQueue.current
      .then(async () => {
        await syncDatabase(lastSynced.current, snapshot);
        lastSynced.current = snapshot;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      })
      .catch((error) => {
        console.error("Erro ao sincronizar dados com o Supabase:", error);
        window.alert(`Não foi possível sincronizar com o Supabase: ${error.message}`);
      });
  }, 0);

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
  const isGerente = authUser?.perfil === "gerente";
  const podeGerenciarUsuarios = isMaster || isGerente;
  const tabsUsuario = ["nova-os", "ordens", "clientes"];
  const podeAcessar = (tabId) => isMaster || isGerente || tabsUsuario.includes(tabId);

  const entrar = () => {
    const user = usuarios.find((u) => u.usuario === auth.usuario && u.senha === auth.senha);
    if (!user) return;
    const empresaId = user.empresaId || (auth.empresaId || empresas[0]?.id || "");
    setAuth((prev) => ({ ...prev, empresaId, usuarioLogado: user }));
    setTab(user.perfil === "usuario" ? "nova-os" : "dashboard");
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
      .filter((o) => !["rascunho", "pendente", "estornado"].includes(o.statusOS))
      .reduce((s, o) => s + valorRecebidoOrdem(o, (data) => monthKey(data) === mk), 0);
    const receitaDia = empresaData.ordens
      .filter((o) => !["rascunho", "pendente", "estornado"].includes(o.statusOS))
      .reduce((s, o) => s + valorRecebidoOrdem(o, (data) => data === todayISO()), 0);
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
  ].filter((item) => podeAcessar(item.id));

  if (!loaded) {
    return <div className="min-h-screen grid place-items-center bg-slate-50 text-sm font-medium text-slate-500">Carregando dados...</div>;
  }

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
          {podeGerenciarUsuarios && <button onClick={() => setTab("usuarios")} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${tab === "usuarios" ? "bg-orange-500/20 text-orange-200 border border-orange-400/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" : "text-slate-300 hover:bg-white/5 hover:text-white border border-transparent"}`}>
            <UserCog size={17} /> Usuários
          </button>}
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
          {tab === "dashboard" && podeAcessar("dashboard") && <Dashboard db={getEmpresaData(db, auth.empresaId || auth.usuarioLogado?.empresaId || "")} stats={stats} />}
          {tab === "nova-os" && <NovaOS db={getEmpresaData(db, auth.empresaId || auth.usuarioLogado?.empresaId || "")} update={update} empresa={empresaAtiva} ordemEmEdicao={ordemEmEdicao} onFinalizarEdicao={() => setOrdemEmEdicao(null)} podeEditarValor={isMaster || isGerente} />}
          {tab === "ordens" && <Ordens db={getEmpresaData(db, auth.empresaId || auth.usuarioLogado?.empresaId || "")} update={update} empresa={empresaAtiva} onEditarNaOS={(ordem) => { setOrdemEmEdicao(ordem); setTab("nova-os"); }} />}
          {tab === "clientes" && <Clientes db={getEmpresaData(db, auth.empresaId || auth.usuarioLogado?.empresaId || "")} update={update} empresaSegmento={empresaAtiva?.segmento || "lava-jato"} />}
          {tab === "funcionarios" && podeAcessar("funcionarios") && <FuncionariosScreen db={getEmpresaData(db, auth.empresaId || auth.usuarioLogado?.empresaId || "")} update={update} empresaId={auth.empresaId || auth.usuarioLogado?.empresaId || ""} />}
          {tab === "servicos" && podeAcessar("servicos") && <Servicos db={getEmpresaData(db, auth.empresaId || auth.usuarioLogado?.empresaId || "")} update={update} />}
          {tab === "estoque" && podeAcessar("estoque") && <Estoque db={getEmpresaData(db, auth.empresaId || auth.usuarioLogado?.empresaId || "")} update={update} />}
          {tab === "receber" && podeAcessar("receber") && <ContasReceber db={getEmpresaData(db, auth.empresaId || auth.usuarioLogado?.empresaId || "")} update={update} empresa={empresaAtiva} />}
          {tab === "pagar" && podeAcessar("pagar") && <ContasPagar db={getEmpresaData(db, auth.empresaId || auth.usuarioLogado?.empresaId || "")} update={update} empresa={empresaAtiva} />}
          {tab === "empresas" && isMaster && <EmpresasScreen db={db} update={update} />}
          {tab === "usuarios" && podeGerenciarUsuarios && <UsuariosScreen db={db} update={update} isMaster={isMaster} empresaId={auth.empresaId || auth.usuarioLogado?.empresaId || ""} />}
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

function EmpresasScreen({ db, update }) {
  const empresaFormInicial = {
    nome: "", razaoSocial: "", cnpj: "", inscricaoEstadual: "", email: "", telefone: "",
    cep: "", endereco: "", numero: "", bairro: "", cidade: "", estado: "",
    segmento: "lava-jato",
  };
  const [form, setForm] = useState(empresaFormInicial);
  const [editandoId, setEditandoId] = useState(null);
  const [segmentoEditandoId, setSegmentoEditandoId] = useState(null);
  const [segmentoEditado, setSegmentoEditado] = useState("lava-jato");

  const add = () => {
    if (!form.nome.trim()) return;
    if (editandoId) {
      update("empresas", (prev) => prev.map((empresa) => empresa.id === editandoId ? { ...empresa, ...form } : empresa));
      setEditandoId(null);
      setForm(empresaFormInicial);
      return;
    }
    const empresa = createEmpresa(form);
    update("empresas", (prev) => [...prev, empresa]);
    setForm(empresaFormInicial);
  };

  const editarEmpresa = (empresa) => {
    setEditandoId(empresa.id);
    setForm({ ...empresaFormInicial, ...empresa });
    window.scrollTo({ top: 0, behavior: "smooth" });
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
        <p className="text-slate-500 text-sm mt-1">Cadastre os dados da empresa. Os acessos são criados na tela de usuários.</p>
      </header>

      <Card className="p-5 space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Nome fantasia">
          <input className={inputCls} value={form.nome} onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))} />
        </Field>
        <Field label="Razão social"><input className={inputCls} value={form.razaoSocial} onChange={(e) => setForm((prev) => ({ ...prev, razaoSocial: e.target.value }))} /></Field>
        <Field label="CNPJ"><input inputMode="numeric" className={inputCls} placeholder="00.000.000/0000-00" value={form.cnpj} onChange={(e) => setForm((prev) => ({ ...prev, cnpj: formatCpfCnpj(e.target.value) }))} /></Field>
        <Field label="Inscrição estadual"><input className={inputCls} value={form.inscricaoEstadual} onChange={(e) => setForm((prev) => ({ ...prev, inscricaoEstadual: e.target.value }))} /></Field>
        <Field label="E-mail"><input type="email" className={inputCls} value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} /></Field>
        <Field label="Telefone"><input inputMode="tel" className={inputCls} value={form.telefone} onChange={(e) => setForm((prev) => ({ ...prev, telefone: formatTelefone(e.target.value) }))} /></Field>
        <Field label="Segmento">
          <select className={inputCls} value={form.segmento} onChange={(e) => setForm((prev) => ({ ...prev, segmento: e.target.value }))}>
            <option value="lava-jato">Lava Jato</option>
            <option value="cabeleleiro">Cabeleireiro</option>
            <option value="barbearia">Barbearia</option>
            <option value="estetica">Estética</option>
            <option value="outro">Outro</option>
          </select>
        </Field>
        <div />
        <Field label="CEP"><input inputMode="numeric" className={inputCls} placeholder="00000-000" value={form.cep} onChange={(e) => setForm((prev) => ({ ...prev, cep: formatCep(e.target.value) }))} /></Field>
        <Field label="Endereço"><input className={inputCls} value={form.endereco} onChange={(e) => setForm((prev) => ({ ...prev, endereco: e.target.value }))} /></Field>
        <Field label="Número"><input className={inputCls} value={form.numero} onChange={(e) => setForm((prev) => ({ ...prev, numero: e.target.value }))} /></Field>
        <Field label="Bairro"><input className={inputCls} value={form.bairro} onChange={(e) => setForm((prev) => ({ ...prev, bairro: e.target.value }))} /></Field>
        <Field label="Cidade"><input className={inputCls} value={form.cidade} onChange={(e) => setForm((prev) => ({ ...prev, cidade: e.target.value }))} /></Field>
        <Field label="UF"><input maxLength={2} className={inputCls} value={form.estado} onChange={(e) => setForm((prev) => ({ ...prev, estado: e.target.value.toUpperCase() }))} /></Field>
        </div>
        <div className="flex gap-2">
          <button onClick={add} className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white">{editandoId ? "Salvar alterações" : "Salvar empresa"}</button>
          {editandoId && <button onClick={() => { setEditandoId(null); setForm(empresaFormInicial); }} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600">Cancelar</button>}
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr><th className="text-left px-4 py-3">Empresa</th><th className="text-left px-4 py-3">Segmento</th><th className="text-left px-4 py-3">Criada em</th><th className="text-left px-4 py-3">Ações</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(db.empresas || []).map((empresa) => (
              <tr key={empresa.id}>
                <td className="px-4 py-3 font-medium">
                  <div>{empresa.nome}</div>
                  {empresa.cnpj && <div className="mt-0.5 text-xs font-normal text-slate-400">CNPJ: {empresa.cnpj}</div>}
                </td>
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
                    <button onClick={() => editarEmpresa(empresa)} className="text-sm font-semibold text-violet-600 hover:text-violet-700">Editar</button>
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
  const [editandoId, setEditandoId] = useState(null);
  const [empresaSelecionada, setEmpresaSelecionada] = useState(empresaId || (db.empresas?.[0]?.id || ""));

  const add = () => {
    if (!form.nome.trim() || !form.usuario.trim() || !form.senha.trim()) return;
    if (!isMaster && form.perfil === "master") return;
    const targetEmpresaId = isMaster ? (empresaSelecionada || form.empresaId) : empresaId;
    if (editandoId) {
      update("usuarios", (prev) => prev.map((usuario) => usuario.id === editandoId ? { ...usuario, nome: form.nome, usuario: form.usuario, senha: form.senha, perfil: form.perfil, empresaId: targetEmpresaId } : usuario));
      setEditandoId(null);
      setForm({ nome: "", usuario: "", senha: "", perfil: "usuario", empresaId: targetEmpresaId });
      return;
    }
    update("usuarios", (prev) => [...prev, createUsuario({
      nome: form.nome,
      usuario: form.usuario,
      senha: form.senha,
      empresaId: targetEmpresaId,
      perfil: form.perfil,
    })]);
    setForm({ nome: "", usuario: "", senha: "", perfil: "usuario", empresaId: targetEmpresaId });
  };

  const editarUsuario = (usuario) => {
    setEditandoId(usuario.id);
    setForm({ nome: usuario.nome, usuario: usuario.usuario, senha: usuario.senha, perfil: usuario.perfil || "usuario", empresaId: usuario.empresaId });
  };

  const removerUsuario = (usuario) => {
    if (!window.confirm(`Deseja excluir o usuário ${usuario.nome}?`)) return;
    update("usuarios", (prev) => prev.filter((item) => item.id !== usuario.id));
    if (editandoId === usuario.id) {
      setEditandoId(null);
      setForm({ nome: "", usuario: "", senha: "", perfil: "usuario", empresaId });
    }
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
            <option value="gerente">Gerente</option>
            {isMaster && <option value="master">Master</option>}
          </select>
        </Field>
        <div className="flex gap-2">
          <button onClick={add} className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white">{editandoId ? "Salvar alterações" : "Salvar usuário"}</button>
          {editandoId && <button onClick={() => { setEditandoId(null); setForm({ nome: "", usuario: "", senha: "", perfil: "usuario", empresaId }); }} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600">Cancelar</button>}
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr><th className="text-left px-4 py-3">Nome</th><th className="text-left px-4 py-3">Usuário</th><th className="text-left px-4 py-3">Perfil</th><th className="px-4 py-3 text-right">Ações</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lista.map((usuario) => (
              <tr key={usuario.id}>
                <td className="px-4 py-3 font-medium">{usuario.nome}</td>
                <td className="px-4 py-3 text-slate-500">{usuario.usuario}</td>
                <td className="px-4 py-3 text-slate-500">{usuario.perfil === "master" ? "Master" : usuario.perfil === "gerente" ? "Gerente" : "Usuário"}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-3">
                    <button onClick={() => editarUsuario(usuario)} className="text-slate-400 hover:text-violet-600" title="Editar usuário"><Pencil size={16} /></button>
                    <button onClick={() => removerUsuario(usuario)} className="text-slate-400 hover:text-red-500" title="Excluir usuário"><Trash2 size={16} /></button>
                  </div>
                </td>
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
  const [editandoId, setEditandoId] = useState(null);

  const add = () => {
    if (!form.nome.trim()) return;
    if (editandoId) {
      update("funcionarios", (prev) => prev.map((funcionario) => funcionario.id === editandoId ? { ...funcionario, nome: form.nome.trim(), cargo: form.cargo.trim() } : funcionario));
      setEditandoId(null);
      setForm({ nome: "", cargo: "" });
      return;
    }
    update("funcionarios", (prev) => [...prev, createFuncionario({ nome: form.nome, cargo: form.cargo, empresaId })]);
    setForm({ nome: "", cargo: "" });
  };

  const editarFuncionario = (funcionario) => {
    setEditandoId(funcionario.id);
    setForm({ nome: funcionario.nome, cargo: funcionario.cargo || "" });
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
        <div className="flex gap-2">
          <button onClick={add} className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white">{editandoId ? "Salvar alterações" : "Salvar funcionário"}</button>
          {editandoId && <button onClick={() => { setEditandoId(null); setForm({ nome: "", cargo: "" }); }} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600">Cancelar</button>}
        </div>
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
                  <td className="px-4 py-3 text-right"><div className="flex justify-end gap-3"><button onClick={() => editarFuncionario(funcionario)} className="text-slate-400 hover:text-violet-600"><Pencil size={16} /></button><button onClick={() => remove(funcionario.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={16} /></button></div></td>
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
function Dashboard({ db, stats }) {
  const ultimasOrdens = db.ordens.filter((ordem) => !ordem.lancamentoManual).sort((a, b) => (a.data < b.data ? 1 : -1)).slice(0, 6);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="headline text-2xl font-bold text-slate-900">Painel geral</h1>
        <p className="text-slate-500 text-sm mt-1">Visão rápida do seu sistema hoje, {fmtDate(todayISO())}.</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp} label="Faturado no mês" value={brl(stats.receitaMes)} tone="cyan" />
        <StatCard icon={TrendingDown} label="Faturamento diário" value={brl(stats.receitaDia)} tone="amber" />
        <StatCard icon={Wallet} label="A receber" value={brl(stats.aReceber)} tone="amber" />
        <StatCard icon={Landmark} label="A pagar" value={brl(stats.aPagar)} tone="red" />
      </div>

      <div>
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-800">Últimas ordens de serviço</h2>
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
                    {["rascunho", "pendente", "estornado"].includes(o.statusOS)
                      ? <Badge tone="amber">Pendente</Badge>
                      : <Badge tone="green">Concluído</Badge>}
                  </div>
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

function ReciboOSModal({ ordem, empresa = {}, cliente = {}, onClose }) {
  if (!ordem) return null;
  const enderecoEmpresa = [empresa.endereco, empresa.numero, empresa.bairro, empresa.cidade, empresa.estado].filter(Boolean).join(", ");
  const enderecoCliente = [cliente.endereco, cliente.numero, cliente.bairro, cliente.cidade, cliente.estado].filter(Boolean).join(", ");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 sm:p-8">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .os-print-area, .os-print-area * { visibility: visible !important; }
          .os-print-area { position: absolute !important; inset: 0 !important; width: 210mm !important; min-height: 297mm !important; max-width: none !important; padding: 15mm !important; box-sizing: border-box !important; box-shadow: none !important; border: 0 !important; }
          .os-print-area tr, .os-print-area section { break-inside: avoid; page-break-inside: avoid; }
          .os-print-actions { display: none !important; }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>
      <div className="my-auto w-full max-w-[210mm]">
        <div className="os-print-actions mb-3 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow">Fechar</button>
          <button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow">
            <Printer size={17} /> Imprimir / Salvar PDF
          </button>
        </div>
        <article className="os-print-area mx-auto min-h-[297mm] w-[210mm] max-w-full bg-white p-6 text-sm text-slate-800 shadow-2xl sm:p-[15mm]">
          <header className="flex justify-between gap-6 border-b-2 border-slate-800 pb-5">
            <div>
              <h1 className="text-2xl font-bold">{empresa.nome || "Empresa"}</h1>
              {empresa.razaoSocial && <div>{empresa.razaoSocial}</div>}
              {empresa.cnpj && <div>CNPJ: {empresa.cnpj}</div>}
              {enderecoEmpresa && <div className="text-slate-500">{enderecoEmpresa}</div>}
              {(empresa.telefone || empresa.email) && <div className="text-slate-500">{[empresa.telefone, empresa.email].filter(Boolean).join(" · ")}</div>}
            </div>
            <div className="text-right">
              <h2 className="text-xl font-bold">ORDEM DE SERVIÇO</h2>
              <div>Nº {ordem.numero}</div>
              <div className="text-slate-500">{fmtDate(ordem.data)}</div>
            </div>
          </header>

          <section className="mt-5">
            <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Cliente</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div><strong>Nome:</strong> {ordem.clienteNome || cliente.nome || "-"}</div>
              <div><strong>CPF/CNPJ:</strong> {cliente.cpfCnpj || "-"}</div>
              <div><strong>Telefone:</strong> {cliente.telefone || "-"}</div>
              <div><strong>E-mail:</strong> {cliente.email || "-"}</div>
              {enderecoCliente && <div className="sm:col-span-2"><strong>Endereço:</strong> {enderecoCliente}</div>}
              {(ordem.veiculo || cliente.veiculo || ordem.placa || cliente.placa) && <div className="sm:col-span-2"><strong>Veículo:</strong> {[ordem.marca || cliente.marca, ordem.veiculo || cliente.veiculo].filter(Boolean).join(" ") || "-"} {ordem.cor || cliente.cor ? `· ${ordem.cor || cliente.cor}` : ""} {ordem.ano || cliente.ano ? `· ${ordem.ano || cliente.ano}` : ""} {ordem.placa || cliente.placa ? `· Placa ${ordem.placa || cliente.placa}` : ""}</div>}
              {(ordem.motorista || cliente.motorista) && <div className="sm:col-span-2"><strong>Motorista/Responsável:</strong> {ordem.motorista || cliente.motorista}</div>}
            </div>
          </section>

          <section className="mt-5">
            <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Itens da ordem</h3>
            <table className="w-full border-collapse">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-2 text-left">Descrição</th><th className="p-2 text-center">Qtd.</th><th className="p-2 text-right">Unitário</th><th className="p-2 text-right">Subtotal</th></tr></thead>
              <tbody>{(ordem.itens || []).map((item) => <tr key={item.uidLine} className="border-b border-slate-200"><td className="p-2">{item.descricao || item.nome}</td><td className="p-2 text-center">{item.qtd}</td><td className="p-2 text-right">{brl(item.precoUnit)}</td><td className="p-2 text-right">{brl(item.subtotal ?? Number(item.precoUnit || 0) * Number(item.qtd || 1))}</td></tr>)}</tbody>
            </table>
            {Number(ordem.desconto || 0) > 0 && <div className="mt-4 text-right text-sm text-slate-500">Subtotal: {brl(ordem.subtotal || Number(ordem.total) + Number(ordem.desconto))}<br />Desconto: - {brl(ordem.desconto)}</div>}
            <div className="mt-4 text-right text-xl font-bold">Total: {brl(ordem.total)}</div>
          </section>

          <section className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div><strong>Pagamento:</strong> {ordem.formaPagamento || "-"}</div>
            <div><strong>Status financeiro:</strong> {ordem.statusPagamento || "-"}</div>
            <div><strong>Responsável:</strong> {ordem.funcionarioNome || "-"}</div>
            <div><strong>Valor pago:</strong> {brl(ordem.valorPago || 0)}</div>
          </section>
          <div className="mt-16 grid grid-cols-2 gap-12 text-center"><div className="border-t border-slate-700 pt-2">Assinatura da empresa</div><div className="border-t border-slate-700 pt-2">Assinatura do cliente</div></div>
        </article>
      </div>
    </div>
  );
}

function ReciboFinanceiroModal({ tipo, conta, empresa = {}, onClose }) {
  if (!conta) return null;
  const receber = tipo === "receber";
  const valorTotal = Number(conta.valorParcela ?? conta.valor ?? conta.total ?? 0);
  const valorPago = Number(conta.valorPago || 0);
  const restante = Math.max(0, valorTotal - valorPago);
  const pessoa = receber ? conta.clienteNome || "Cliente" : conta.fornecedor || conta.descricao || "Fornecedor";
  const descricao = receber
    ? conta.itens?.[0]?.descricao || conta.itens?.[0]?.nome || `Conta vinculada à OS ${conta.numero || ""}`
    : conta.descricao;
  const status = restante <= 0 ? "Pago" : valorPago > 0 ? "Parcial" : "Pendente";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 sm:p-8">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .finance-print-area, .finance-print-area * { visibility: visible !important; }
          .finance-print-area { position: absolute !important; inset: 0 !important; width: 210mm !important; min-height: 297mm !important; max-width: none !important; padding: 15mm !important; box-sizing: border-box !important; box-shadow: none !important; border: 0 !important; }
          .finance-print-area tr, .finance-print-area section { break-inside: avoid; page-break-inside: avoid; }
          .finance-print-actions { display: none !important; }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>
      <div className="my-auto w-full max-w-[210mm]">
        <div className="finance-print-actions mb-3 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow">Fechar</button>
          <button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow"><Printer size={17} /> Imprimir / Salvar PDF</button>
        </div>
        <article className="finance-print-area mx-auto min-h-[297mm] w-[210mm] max-w-full bg-white p-7 text-sm text-slate-800 shadow-2xl sm:p-[15mm]">
          <header className="flex justify-between gap-6 border-b-2 border-slate-800 pb-5">
            <div>
              <h1 className="text-2xl font-bold">{empresa.nome || "Empresa"}</h1>
              {empresa.cnpj && <div>CNPJ: {empresa.cnpj}</div>}
              {(empresa.telefone || empresa.email) && <div className="text-slate-500">{[empresa.telefone, empresa.email].filter(Boolean).join(" · ")}</div>}
            </div>
            <div className="text-right"><h2 className="text-xl font-bold">RECIBO</h2><div className="text-slate-500">{receber ? "Conta a receber" : "Conta a pagar"}</div></div>
          </header>
          <section className="mt-6 space-y-3">
            <div><strong>{receber ? "Cliente/Pagador" : "Fornecedor/Favorecido"}:</strong> {pessoa}</div>
            <div><strong>Descrição:</strong> {descricao || "-"}</div>
            {receber && conta.numero && <div><strong>Referência:</strong> OS/Conta #{conta.numero}{conta.totalParcelas > 1 ? ` · Parcela ${conta.numeroParcela}/${conta.totalParcelas}` : ""}</div>}
            <div className="grid grid-cols-1 gap-3 border-y border-slate-200 py-4 sm:grid-cols-3">
              <div><span className="text-xs uppercase text-slate-500">Valor total</span><div className="text-lg font-bold">{brl(valorTotal)}</div></div>
              <div><span className="text-xs uppercase text-slate-500">Valor pago</span><div className="text-lg font-bold text-emerald-700">{brl(valorPago)}</div></div>
              <div><span className="text-xs uppercase text-slate-500">Saldo</span><div className="text-lg font-bold text-amber-700">{brl(restante)}</div></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><strong>Vencimento:</strong> {fmtDate(conta.dataVencimento || conta.vencimento)}</div>
              <div><strong>Status:</strong> {status}</div>
              <div><strong>Data da baixa:</strong> {fmtDate(conta.dataBaixa)}</div>
              <div><strong>Forma da baixa:</strong> {conta.formaPagamentoBaixa || "-"}</div>
            </div>
          </section>
          <div className="mt-20 grid grid-cols-2 gap-12 text-center"><div className="border-t border-slate-700 pt-2">{empresa.nome || "Empresa"}</div><div className="border-t border-slate-700 pt-2">{pessoa}</div></div>
        </article>
      </div>
    </div>
  );
}

// ---------- Nova OS ----------
function NovaOS({ db, update, empresa, ordemEmEdicao, onFinalizarEdicao, podeEditarValor }) {
  const [clienteId, setClienteId] = useState(db.clientes[0]?.id || "");
  const [buscaCliente, setBuscaCliente] = useState("");
  const [seletorClienteAberto, setSeletorClienteAberto] = useState(false);
  const [itens, setItens] = useState([]);
  const [tipoSel, setTipoSel] = useState("servico");
  const [itemSel, setItemSel] = useState("");
  const [valorItem, setValorItem] = useState("");
  const [qtd, setQtd] = useState(1);
  const [formaPagamento, setFormaPagamento] = useState("Dinheiro");
  const [statusPagamento, setStatusPagamento] = useState("pago");
  const [valorPago, setValorPago] = useState(0);
  const [desconto, setDesconto] = useState("");
  const [vencimento, setVencimento] = useState(todayISO());
  const [qtdParcelas, setQtdParcelas] = useState(1);
  const [funcionarioId, setFuncionarioId] = useState("");
  const [editandoItem, setEditandoItem] = useState(null);
  const [editForm, setEditForm] = useState({ descricao: "", valor: "", qtd: "" });
  const [recibo, setRecibo] = useState(null);

  useEffect(() => {
    if (!ordemEmEdicao) return;
    setClienteId(ordemEmEdicao.clienteId || "");
    setBuscaCliente("");
    setItens((ordemEmEdicao.itens || []).map((item) => ({ ...item, uidLine: item.uidLine || uid() })));
    setFormaPagamento(ordemEmEdicao.formaPagamento || "Dinheiro");
    setStatusPagamento(ordemEmEdicao.statusPagamento || "pendente");
    setValorPago(Number(ordemEmEdicao.valorPago || 0));
    setDesconto(String(ordemEmEdicao.desconto || ""));
    setVencimento(ordemEmEdicao.dataVencimento || todayISO());
    setQtdParcelas(ordemEmEdicao.parcelas?.length || 1);
    setFuncionarioId(ordemEmEdicao.funcionarioId || "");
  }, [ordemEmEdicao]);

  const catalogo = tipoSel === "servico" ? db.servicos : db.produtos;
  const clientesComCodigo = db.clientes.map((cliente, index) => ({ ...cliente, codigoExibicao: cliente.codigo || String(index + 1).padStart(4, "0") }));
  const termoCliente = buscaCliente.trim().toLowerCase().replace(/^#/, "");
  const clientesFiltrados = clientesComCodigo.filter((cliente) =>
    !termoCliente
    || cliente.nome.toLowerCase().includes(termoCliente)
    || cliente.codigoExibicao.toLowerCase().includes(termoCliente)
    || (cliente.placa || "").toLowerCase().includes(termoCliente)
    || (cliente.motorista || "").toLowerCase().includes(termoCliente)
  );
  const subtotalItens = itens.reduce((s, i) => s + i.subtotal, 0);
  const descontoAplicado = Math.min(Math.max(Number(desconto) || 0, 0), subtotalItens);
  const total = Math.max(0, subtotalItens - descontoAplicado);
  const mostraParcelas = formaPagamento === "Carteira";
  const hasServico = itens.some((item) => item.tipo === "servico");

  const addItem = () => {
    const src = catalogo.find((c) => c.id === itemSel);
    if (!src || qtd <= 0) return;
    const precoCadastrado = tipoSel === "servico" ? src.preco : (src.precoVenda || src.precoCusto);
    const preco = valorItem === "" ? Number(precoCadastrado || 0) : Math.max(0, Number(valorItem));
    const quantidade = Number(qtd);
    setItens((prev) => [
      ...prev,
      { uidLine: uid(), tipo: tipoSel, itemId: src.id, nome: src.nome, descricao: src.nome, qtd: quantidade, precoUnit: preco, subtotal: preco * quantidade },
    ]);
    setItemSel("");
    setValorItem("");
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

  const salvar = (concluir) => {
    if (itens.length === 0 || !clienteId) return;
    if (concluir && hasServico && !funcionarioId) return;
    const cliente = db.clientes.find((c) => c.id === clienteId);
    const numero = ordemEmEdicao?.numero || (db.ordens.filter((item) => !item.lancamentoManual).length + 1).toString().padStart(4, "0");
    const ordemId = ordemEmEdicao?.id || uid();
    const vendaCarteira = formaPagamento === "Carteira";
    const statusFinanceiro = vendaCarteira ? "pendente" : "pago";
    const ordem = {
      id: ordemId,
      numero,
      data: todayISO(),
      clienteId,
      clienteNome: cliente?.nome || "Consumidor",
      veiculo: cliente?.veiculo || "",
      marca: cliente?.marca || "",
      cor: cliente?.cor || "",
      ano: cliente?.ano || "",
      placa: cliente?.placa || "",
      motorista: cliente?.motorista || "",
      itens,
      subtotal: subtotalItens,
      desconto: descontoAplicado,
      total,
      statusOS: concluir ? "concluido" : "pendente",
      formaPagamento,
      funcionarioId: hasServico ? funcionarioId : null,
      funcionarioNome: hasServico ? db.funcionarios.find((f) => f.id === funcionarioId)?.nome || "" : "",
      statusPagamento: concluir ? statusFinanceiro : "pendente",
      valorPago: concluir && !vendaCarteira ? total : 0,
      dataVencimento: concluir && vendaCarteira ? (vencimento || todayISO()) : null,
      parcelas: concluir && vendaCarteira ? gerarParcelas(ordemId, total, qtdParcelas, vencimento || todayISO()) : null,
    };
    update("ordens", (prev) => ordemEmEdicao ? prev.map((item) => item.id === ordemEmEdicao.id ? ordem : item) : [...prev, ordem]);
    const quantidadePorProduto = (lista) => lista.filter((item) => item.tipo === "produto").reduce((acc, item) => {
      acc[item.itemId] = (acc[item.itemId] || 0) + Number(item.qtd || 0);
      return acc;
    }, {});
    const produtosAntes = quantidadePorProduto(ordemEmEdicao?.itens || []);
    const produtosDepois = quantidadePorProduto(itens);
    const antesConcluida = ordemEmEdicao && !["rascunho", "pendente", "estornado"].includes(ordemEmEdicao.statusOS);
    update("produtos", (prev) => prev.map((produto) => {
      const quantidadeAntes = antesConcluida ? Number(produtosAntes[produto.id] || 0) : 0;
      const quantidadeDepois = concluir ? Number(produtosDepois[produto.id] || 0) : 0;
      if (!quantidadeAntes && !quantidadeDepois) return produto;
      return { ...produto, quantidade: Math.max(0, Number(produto.quantidade) + quantidadeAntes - quantidadeDepois) };
    }));
    if (concluir) setRecibo({ ordem, cliente });
    setItens([]);
    setValorPago(0);
    setDesconto("");
    setStatusPagamento("pago");
    setFormaPagamento("Dinheiro");
    setVencimento(todayISO());
    setQtdParcelas(1);
    setFuncionarioId("");
    onFinalizarEdicao?.();
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {recibo && <ReciboOSModal ordem={recibo.ordem} empresa={empresa} cliente={recibo.cliente} onClose={() => setRecibo(null)} />}
      <header>
        <h1 className="headline text-2xl font-bold text-slate-900">{ordemEmEdicao ? `Continuar OS #${ordemEmEdicao.numero}` : "Nova ordem de serviço"}</h1>
        <p className="text-slate-500 text-sm mt-1">{ordemEmEdicao ? "Edite os itens e conclua a venda quando estiver pronta." : "Registre uma venda de serviço e/ou produto."}</p>
      </header>

      <Card className="p-5 space-y-4">
        <Field label="Cliente">
          <button
            type="button"
            onClick={() => { setBuscaCliente(""); setSeletorClienteAberto(true); }}
            className={inputCls + " flex items-center justify-between text-left"}
          >
            <span>{clienteId ? (() => { const cliente = clientesComCodigo.find((item) => item.id === clienteId); return cliente ? `#${cliente.codigoExibicao} · ${cliente.nome}${cliente.placa ? ` · ${cliente.placa}` : ""}` : "Selecionar cliente"; })() : "Selecionar cliente"}</span>
            <Search size={17} className="text-violet-600" />
          </button>
        </Field>

        {seletorClienteAberto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-slate-900">Selecionar cliente</h2>
                  <p className="text-xs text-slate-500">Pesquise pelo nome, código, placa ou motorista.</p>
                </div>
                <button type="button" onClick={() => setSeletorClienteAberto(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
              </div>
              <div className="relative mb-3">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input autoFocus className={inputCls + " pl-9"} placeholder="Nome, código, placa ou motorista" value={buscaCliente} onChange={(e) => setBuscaCliente(e.target.value)} />
              </div>
              <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 p-1">
                {clientesFiltrados.length === 0 ? (
                  <div className="p-6 text-center text-sm text-slate-400">Nenhum cliente encontrado.</div>
                ) : clientesFiltrados.map((cliente) => (
                  <button
                    type="button"
                    key={cliente.id}
                    onClick={() => {
                      setClienteId(cliente.id);
                      setBuscaCliente("");
                      setSeletorClienteAberto(false);
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-orange-50 hover:text-orange-700"
                  >
                    <span><strong>#{cliente.codigoExibicao}</strong> · {cliente.nome}</span>
                    <span className="text-right text-xs text-slate-400">{cliente.placa || cliente.cpfCnpj || ""}{cliente.motorista ? <><br />{cliente.motorista}</> : null}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
          <div className="text-sm font-semibold text-slate-700">Adicionar item</div>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <Field label="Tipo">
              <select className={inputCls} value={tipoSel} onChange={(e) => { setTipoSel(e.target.value); setItemSel(""); setValorItem(""); }}>
                <option value="servico">Serviço</option>
                <option value="produto">Produto</option>
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label={tipoSel === "servico" ? "Serviço" : "Produto"}>
                <select className={inputCls} value={itemSel} onChange={(e) => {
                  const id = e.target.value;
                  const item = catalogo.find((registro) => registro.id === id);
                  setItemSel(id);
                  setValorItem(id ? String(tipoSel === "servico" ? item?.preco || 0 : item?.precoVenda || item?.precoCusto || 0) : "");
                }}>
                  <option value="">Selecione...</option>
                  {catalogo.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                      {tipoSel === "produto" ? ` (${c.quantidade} ${c.unidade} em estoque)` : ""}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Valor">
              <input type="number" min="0" step="0.01" disabled={!podeEditarValor} className={inputCls + " disabled:cursor-not-allowed disabled:bg-slate-100"} value={valorItem} onChange={(e) => setValorItem(e.target.value)} />
            </Field>
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
                        <input type="number" min="0" disabled={!podeEditarValor} className={inputCls + " disabled:cursor-not-allowed disabled:bg-slate-100"} value={editForm.valor} onChange={(e) => setEditForm((prev) => ({ ...prev, valor: e.target.value }))} />
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
            <div className="space-y-3 pt-3">
              <div className="ml-auto max-w-xs">
                <Field label="Desconto">
                  <input type="number" min="0" max={subtotalItens} step="0.01" className={inputCls} placeholder="R$ 0,00" value={desconto} onChange={(e) => setDesconto(e.target.value)} />
                </Field>
              </div>
              <div className="flex items-center justify-between font-bold text-slate-900">
                <span>Total</span>
                <div className="text-right">
                  {descontoAplicado > 0 && <div className="text-xs font-normal text-slate-400 line-through">{brl(subtotalItens)}</div>}
                  <span>{brl(total)}</span>
                </div>
              </div>
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
              <select className={inputCls} value={formaPagamento} onChange={(e) => {
                const forma = e.target.value;
                setFormaPagamento(forma);
                setStatusPagamento(forma === "Carteira" ? "pendente" : "pago");
                setValorPago(forma === "Carteira" ? 0 : total);
              }}>
                <option>Dinheiro</option>
                <option>Pix</option>
                <option>Cartão de Débito</option>
                <option>Cartão de Crédito</option>
                <option>Carteira</option>
              </select>
            </Field>
            <Field label="Status do pagamento">
              <select disabled className={inputCls + " disabled:cursor-not-allowed disabled:bg-slate-100"} value={formaPagamento === "Carteira" ? "pendente" : "pago"}>
                <option value="pago">À vista</option>
                <option value="pendente">A prazo</option>
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
          </div>

          {mostraParcelas && (
            <Field label="Vencimento inicial">
              <input type="date" className={inputCls} value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
            </Field>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button onClick={() => salvar(false)} disabled={itens.length === 0 || !clienteId} className="w-full rounded-xl border border-violet-300 bg-white px-5 py-2.5 text-sm font-semibold text-violet-700 disabled:opacity-40 sm:w-auto">
            Salvar OS
          </button>
          <button onClick={() => salvar(true)} disabled={itens.length === 0 || !clienteId} className="w-full rounded-xl bg-gradient-to-br from-orange-500 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40 sm:w-auto">
            Concluir OS
          </button>
        </div>
      </Card>
    </div>
  );
}

// ---------- Ordens ----------
function Ordens({ db, update, empresa, onEditarNaOS }) {
  const [editandoOrdemId, setEditandoOrdemId] = useState(null);
  const [recibo, setRecibo] = useState(null);
  const [filtros, setFiltros] = useState({ busca: "", dataInicial: "", dataFinal: "" });
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

  const salvarEdicao = (concluir = false) => {
    if (!editandoOrdemId) return;
    const ordemAtual = db.ordens.find((o) => o.id === editandoOrdemId);
    if (!ordemAtual) return;
    const itensValidos = editForm.itens.filter((item) => item && item.descricao && Number(item.qtd || 1) > 0);
    if (!itensValidos.length) return;

    const hasServico = itensValidos.some((item) => item.tipo === "servico");
    if ((concluir || !["rascunho", "pendente", "estornado"].includes(ordemAtual.statusOS)) && hasServico && !editForm.funcionarioId) return;

    const totalEditado = itensValidos.reduce((s, item) => s + Number(item.precoUnit || 0) * Number(item.qtd || 1), 0);
    const vendaCarteira = editForm.formaPagamento === "Carteira";
    const permanecePendente = ["rascunho", "pendente", "estornado"].includes(ordemAtual.statusOS) && !concluir;
    const statusPagamento = permanecePendente || vendaCarteira ? "pendente" : "pago";
    const valorPago = permanecePendente || vendaCarteira ? 0 : totalEditado;
    const dataVencimento = !permanecePendente && vendaCarteira ? editForm.dataVencimento || todayISO() : null;

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
          clienteNome: cliente?.nome || o.clienteNome || "Consumidor",
          itens: itensValidos.map((item) => ({ ...item, subtotal: Number(item.precoUnit || 0) * Number(item.qtd || 1) })),
          total: totalEditado,
          statusOS: concluir ? "concluido" : (o.statusOS || "concluido"),
          formaPagamento: editForm.formaPagamento,
          funcionarioId: hasServico ? editForm.funcionarioId : null,
          funcionarioNome: hasServico ? funcionario?.nome || "" : "",
          statusPagamento,
          valorPago,
          dataVencimento,
          parcelas: vendaCarteira
            ? (!["rascunho", "pendente", "estornado"].includes(o.statusOS) && Array.isArray(o.parcelas) && o.parcelas.length
              ? o.parcelas
              : gerarParcelas(o.id, totalEditado, o.parcelas?.length || 1, dataVencimento))
            : null,
        };
      })
    );

    update("produtos", (prev) =>
      prev.map((p) => {
        const antes = Number(produtosAntes[p.id] || 0);
        const depois = Number(produtosDepois[p.id] || 0);
        if (!antes && !depois) return p;
        if (["rascunho", "pendente", "estornado"].includes(ordemAtual.statusOS) && !concluir) return p;
        if (["rascunho", "pendente", "estornado"].includes(ordemAtual.statusOS) && concluir) return { ...p, quantidade: Math.max(0, Number(p.quantidade) - depois) };
        return { ...p, quantidade: Math.max(0, Number(p.quantidade) + (antes - depois)) };
      })
    );

    if (concluir) {
      const cliente = db.clientes.find((item) => item.id === editForm.clienteId) || {};
      const funcionario = (db.funcionarios || []).find((item) => item.id === editForm.funcionarioId);
      setRecibo({
        cliente,
        ordem: {
          ...ordemAtual,
          clienteId: editForm.clienteId,
          clienteNome: cliente.nome || ordemAtual.clienteNome,
          funcionarioNome: funcionario?.nome || "",
          itens: itensValidos.map((item) => ({ ...item, subtotal: Number(item.precoUnit || 0) * Number(item.qtd || 1) })),
          total: totalEditado,
          statusOS: "concluido",
          formaPagamento: editForm.formaPagamento,
          statusPagamento,
          valorPago,
          dataVencimento,
        },
      });
    }
    cancelarEdicao();
  };

  const excluir = (id) => {
    const ordem = db.ordens.find((o) => o.id === id);
    if (!ordem) return;
    // devolve estoque
    const produtosVendidos = ordem.itens.filter((i) => i.tipo === "produto");
    if (!["rascunho", "pendente", "estornado"].includes(ordem.statusOS) && produtosVendidos.length) {
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

  const estornar = (ordem) => {
    if (!ordem || ["rascunho", "pendente", "estornado"].includes(ordem.statusOS)) return;
    if (!window.confirm(`Deseja estornar a OS nº ${ordem.numero}? Os produtos voltarão ao estoque e os recebíveis serão cancelados.`)) return;
    const produtosDaOrdem = (ordem.itens || []).filter((item) => item.tipo === "produto").reduce((acc, item) => {
      acc[item.itemId] = (acc[item.itemId] || 0) + Number(item.qtd || 0);
      return acc;
    }, {});
    update("produtos", (prev) => prev.map((produto) =>
      produtosDaOrdem[produto.id]
        ? { ...produto, quantidade: Number(produto.quantidade) + produtosDaOrdem[produto.id] }
        : produto
    ));
    update("ordens", (prev) => prev.map((item) => item.id === ordem.id ? {
      ...item,
      statusOS: "pendente",
      statusPagamento: "pendente",
      valorPago: 0,
      parcelas: null,
      dataEstorno: todayISO(),
    } : item));
  };

  const imprimir = (ordem) => {
    const cliente = db.clientes.find((item) => item.id === ordem.clienteId) || {};
    setRecibo({ ordem, cliente });
  };

  const lista = db.ordens
    .filter((ordem) => !ordem.lancamentoManual)
    .filter((ordem) => {
      const termo = filtros.busca.trim().toLowerCase();
      const correspondeTexto = !termo
        || (ordem.clienteNome || "").toLowerCase().includes(termo)
        || String(ordem.numero || "").toLowerCase().includes(termo.replace(/^#/, ""))
        || (ordem.itens || []).some((item) => `${item.nome || ""} ${item.descricao || ""}`.toLowerCase().includes(termo));
      return correspondeTexto
        && (!filtros.dataInicial || ordem.data >= filtros.dataInicial)
        && (!filtros.dataFinal || ordem.data <= filtros.dataFinal);
    })
    .sort((a, b) => (a.data < b.data ? 1 : -1));

  return (
    <div className="space-y-6">
      {recibo && <ReciboOSModal ordem={recibo.ordem} empresa={empresa} cliente={recibo.cliente} onClose={() => setRecibo(null)} />}
      <header>
        <h1 className="headline text-2xl font-bold text-slate-900">Ordens de serviço</h1>
        <p className="text-slate-500 text-sm mt-1">{lista.length} ordem(ns) encontrada(s).</p>
      </header>

      <Card className="p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px_180px_auto] md:items-end">
          <Field label="Cliente, OS, produto ou serviço">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className={inputCls + " pl-9"} placeholder="Digite para pesquisar..." value={filtros.busca} onChange={(e) => setFiltros((prev) => ({ ...prev, busca: e.target.value }))} />
            </div>
          </Field>
          <Field label="Data inicial">
            <input type="date" className={inputCls} value={filtros.dataInicial} onChange={(e) => setFiltros((prev) => ({ ...prev, dataInicial: e.target.value }))} />
          </Field>
          <Field label="Data final">
            <input type="date" className={inputCls} value={filtros.dataFinal} onChange={(e) => setFiltros((prev) => ({ ...prev, dataFinal: e.target.value }))} />
          </Field>
          <button onClick={() => setFiltros({ busca: "", dataInicial: "", dataFinal: "" })} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Limpar</button>
        </div>
      </Card>

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
              <select className={inputCls} value={editForm.formaPagamento} onChange={(e) => {
                const formaPagamento = e.target.value;
                setEditForm((prev) => ({ ...prev, formaPagamento, statusPagamento: formaPagamento === "Carteira" ? "pendente" : "pago" }));
              }}>
                <option>Dinheiro</option>
                <option>Pix</option>
                <option>Cartão de Débito</option>
                <option>Cartão de Crédito</option>
                <option>Carteira</option>
              </select>
            </Field>
            <Field label="Status">
              <select disabled className={inputCls + " disabled:cursor-not-allowed disabled:bg-slate-100"} value={editForm.formaPagamento === "Carteira" ? "pendente" : "pago"}>
                <option value="pago">À vista</option>
                <option value="pendente">A prazo</option>
              </select>
            </Field>
          </div>

          {editForm.formaPagamento === "Carteira" && <Field label="Vencimento">
            <input type="date" className={inputCls} value={editForm.dataVencimento} onChange={(e) => setEditForm((prev) => ({ ...prev, dataVencimento: e.target.value }))} />
          </Field>}

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

          <div className="flex justify-end gap-2">
            <button onClick={() => salvarEdicao(false)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Salvar alterações</button>
            {["rascunho", "pendente", "estornado"].includes(db.ordens.find((ordem) => ordem.id === editandoOrdemId)?.statusOS) && (
              <button onClick={() => salvarEdicao(true)} className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white">Concluir OS</button>
            )}
          </div>
        </Card>
      )}

      <Card className="p-0 overflow-hidden">
        {lista.length === 0 ? (
          <EmptyState text="Nenhuma ordem encontrada para os filtros informados." />
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
                <th className="text-left px-4 py-3">OS</th>
                <th className="text-left px-4 py-3">Financeiro</th>
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
                  <td className="px-4 py-3">{["rascunho", "pendente", "estornado"].includes(o.statusOS) ? <Badge tone="amber">Pendente</Badge> : <Badge tone="green">Concluído</Badge>}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={
                      ["rascunho", "pendente", "estornado"].includes(o.statusOS)
                        ? "pendente"
                        : Array.isArray(o.parcelas) && o.parcelas.length && o.parcelas.every((parcela) => parcela.status === "pago")
                          ? "pago"
                          : o.statusPagamento
                    } />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => imprimir(o)} className="text-slate-400 hover:text-orange-600" title="Imprimir ou salvar recibo em PDF">
                        <Printer size={17} />
                      </button>
                      {!["rascunho", "pendente", "estornado"].includes(o.statusOS) && o.formaPagamento !== "Carteira" && o.statusPagamento !== "pago" && (
                        <button onClick={() => marcarPago(o.id)} className="text-emerald-600 hover:text-emerald-700" title="Marcar como pago">
                          <CheckCircle2 size={17} />
                        </button>
                      )}
                      {["rascunho", "pendente", "estornado"].includes(o.statusOS) && <button onClick={() => onEditarNaOS(o)} className="text-slate-400 hover:text-violet-600" title="Continuar venda / editar OS"><Pencil size={16} /></button>}
                      {!["rascunho", "pendente", "estornado"].includes(o.statusOS) && <button onClick={() => estornar(o)} className="text-amber-600 hover:text-red-600" title="Estornar OS"><RotateCcw size={17} /></button>}
                      {["rascunho", "pendente", "estornado"].includes(o.statusOS) && <button onClick={() => excluir(o.id)} className="text-slate-400 hover:text-red-500" title="Excluir"><Trash2 size={16} /></button>}
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
  const clienteFormInicial = {
    tipoPessoa: "fisica", nome: "", cpfCnpj: "", dataNascimento: "", email: "", telefone: "",
    cep: "", endereco: "", numero: "", bairro: "", cidade: "", estado: "",
    marca: "", veiculo: "", cor: "", ano: "", placa: "", motorista: "",
  };
  const [form, setForm] = useState(clienteFormInicial);
  const [busca, setBusca] = useState("");

  const add = async () => {
    if (!form.nome.trim()) {
      alert("Informe o nome do cliente.");
      return;
    }
    const proximoCodigo = String(Math.max(0, ...db.clientes.map((cliente) => Number(cliente.codigo) || 0)) + 1).padStart(4, "0");
    try {
      const cliente = await createCliente({ codigo: proximoCodigo, ...form });
      update("clientes", (prev) => [...prev, cliente]);
      setForm(clienteFormInicial);
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  };
  const mostraCamposVeiculo = (empresaSegmento || "lava-jato").toLowerCase() === "lava-jato";
  const remove = (id) => update("clientes", (prev) => prev.filter((c) => c.id !== id));

  const lista = db.clientes.filter((c) => {
    const termo = busca.toLowerCase();
    return c.nome.toLowerCase().includes(termo)
      || (c.cpfCnpj || "").toLowerCase().includes(termo)
      || (c.placa || "").toLowerCase().includes(termo)
      || (c.motorista || "").toLowerCase().includes(termo);
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="headline text-2xl font-bold text-slate-900">Clientes</h1>
        <p className="text-slate-500 text-sm mt-1">Cadastre clientes e seus veículos.</p>
      </header>

      <Card className="p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Tipo de pessoa">
            <select className={inputCls} value={form.tipoPessoa} onChange={(e) => setForm({ ...form, tipoPessoa: e.target.value, cpfCnpj: "", dataNascimento: "" })}>
              <option value="fisica">Pessoa física</option>
              <option value="juridica">Pessoa jurídica</option>
            </select>
          </Field>
          <Field label="Nome"><input className={inputCls} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Field>
          <Field label={form.tipoPessoa === "juridica" ? "CNPJ" : "CPF"}><input inputMode="numeric" className={inputCls} value={form.cpfCnpj} onChange={(e) => setForm({ ...form, cpfCnpj: formatCpfCnpj(e.target.value) })} /></Field>
          <Field label="Data de nascimento"><input type="date" disabled={form.tipoPessoa === "juridica"} className={inputCls} value={form.dataNascimento} onChange={(e) => setForm({ ...form, dataNascimento: e.target.value })} /></Field>
          <Field label="E-mail"><input type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Telefone"><input inputMode="tel" className={inputCls} value={form.telefone} onChange={(e) => setForm({ ...form, telefone: formatTelefone(e.target.value) })} /></Field>
          <Field label="CEP"><input inputMode="numeric" className={inputCls} value={form.cep} onChange={(e) => setForm({ ...form, cep: formatCep(e.target.value) })} /></Field>
          <Field label="Endereço"><input className={inputCls} value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} /></Field>
          <Field label="Número"><input className={inputCls} value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} /></Field>
          <Field label="Bairro"><input className={inputCls} value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} /></Field>
          <Field label="Cidade"><input className={inputCls} value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} /></Field>
          <Field label="UF"><input maxLength={2} className={inputCls} value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value.toUpperCase() })} /></Field>
          {mostraCamposVeiculo && (
            <div className="col-span-full mt-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3">
                <h2 className="text-sm font-semibold text-slate-800">Dados do veículo</h2>
                <p className="text-xs text-slate-500">Identificação do carro e da pessoa responsável por levá-lo ao lava-jato.</p>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                <Field label="Marca"><input className={inputCls} placeholder="Ex.: Toyota" value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} /></Field>
                <Field label="Modelo"><input className={inputCls} placeholder="Ex.: Corolla" value={form.veiculo} onChange={(e) => setForm({ ...form, veiculo: e.target.value })} /></Field>
                <Field label="Cor"><input className={inputCls} placeholder="Ex.: Prata" value={form.cor} onChange={(e) => setForm({ ...form, cor: e.target.value })} /></Field>
                <Field label="Ano"><input inputMode="numeric" maxLength={4} className={inputCls} placeholder="Ex.: 2024" value={form.ano} onChange={(e) => setForm({ ...form, ano: e.target.value.replace(/\D/g, "").slice(0, 4) })} /></Field>
                <Field label="Placa"><input maxLength={8} className={inputCls} placeholder="Ex.: ABC1D23" value={form.placa} onChange={(e) => setForm({ ...form, placa: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7) })} /></Field>
                <Field label="Motorista/Responsável"><input className={inputCls} placeholder="Quem costuma levar o veículo?" value={form.motorista} onChange={(e) => setForm({ ...form, motorista: e.target.value })} /></Field>
              </div>
            </div>
          )}
        </div>
        <button onClick={add} className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-violet-700"><Plus size={16} /> Adicionar cliente</button>
      </Card>

      <div className="relative max-w-xs">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className={inputCls + " pl-8"} placeholder="Buscar por nome, documento, placa..." value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      <Card className="p-0 overflow-hidden">
        {lista.length === 0 ? <EmptyState text="Nenhum cliente encontrado." /> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr><th className="text-left px-4 py-3">Nome</th><th className="text-left px-4 py-3">Telefone</th>{mostraCamposVeiculo && <><th className="text-left px-4 py-3">Veículo</th><th className="text-left px-4 py-3">Motorista</th></>}<th className="px-4 py-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-medium">
                    <div>#{c.codigo || String(db.clientes.findIndex((cliente) => cliente.id === c.id) + 1).padStart(4, "0")} · {c.nome}</div>
                    {c.cpfCnpj && <div className="mt-0.5 text-xs font-normal text-slate-400">{c.tipoPessoa === "juridica" ? "CNPJ" : "CPF"}: {c.cpfCnpj}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{c.telefone || "-"}</td>
                  {mostraCamposVeiculo && (
                    <>
                      <td className="px-4 py-3 text-slate-500">
                        <div>{[c.marca, c.veiculo].filter(Boolean).join(" ") || "-"}</div>
                        {(c.cor || c.ano || c.placa) && <div className="mt-0.5 text-xs text-slate-400">{[c.cor, c.ano, c.placa].filter(Boolean).join(" · ")}</div>}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{c.motorista || "-"}</td>
                    </>
                  )}
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
function ContasReceber({ db, update, empresa }) {
  const [baixa, setBaixa] = useState({ id: null, originalId: null, valor: "", data: todayISO(), formaPagamento: "Dinheiro" });
  const [reciboFinanceiro, setReciboFinanceiro] = useState(null);
  const [filtros, setFiltros] = useState({ busca: "", cliente: "", status: "todos", dataInicial: "", dataFinal: "" });
  const receberInicial = { cliente: "", descricao: "", valor: "", vencimento: todayISO() };
  const [formReceber, setFormReceber] = useState(receberInicial);
  const [editandoReceber, setEditandoReceber] = useState(null);

  const salvarReceber = () => {
    if (!formReceber.cliente.trim() || !formReceber.descricao.trim() || Number(formReceber.valor) <= 0) return;
    if (editandoReceber) {
      update("ordens", (prev) => prev.map((ordem) => {
        if (ordem.id !== editandoReceber.originalId) return ordem;
        const valor = Math.max(Number(editandoReceber.valorPago || 0), Number(formReceber.valor));
        const itens = ordem.lancamentoManual
          ? [{ uidLine: ordem.itens?.[0]?.uidLine || uid(), tipo: "manual", nome: formReceber.descricao, descricao: formReceber.descricao, qtd: 1, precoUnit: valor, subtotal: valor }]
          : ordem.itens;
        if (Array.isArray(ordem.parcelas) && ordem.parcelas.length) {
          return { ...ordem, clienteNome: formReceber.cliente, itens, total: ordem.total, parcelas: ordem.parcelas.map((parcela) => parcela.id === editandoReceber.id ? { ...parcela, valor, dataVencimento: formReceber.vencimento } : parcela) };
        }
        return { ...ordem, clienteNome: formReceber.cliente, itens, total: valor, dataVencimento: formReceber.vencimento };
      }));
      setEditandoReceber(null);
      setFormReceber(receberInicial);
      return;
    }
    const id = uid();
    const valor = Number(formReceber.valor);
    update("ordens", (prev) => [...prev, {
      id,
      numero: `REC-${String(prev.filter((ordem) => ordem.lancamentoManual).length + 1).padStart(4, "0")}`,
      data: ordemEmEdicao?.data || todayISO(),
      clienteId: null,
      clienteNome: formReceber.cliente.trim(),
      itens: [{ uidLine: uid(), tipo: "manual", nome: formReceber.descricao.trim(), descricao: formReceber.descricao.trim(), qtd: 1, precoUnit: valor, subtotal: valor }],
      total: valor,
      statusOS: "concluido",
      formaPagamento: "Carteira",
      statusPagamento: "pendente",
      valorPago: 0,
      dataVencimento: formReceber.vencimento,
      parcelas: null,
      lancamentoManual: true,
    }]);
    setFormReceber(receberInicial);
  };

  const editarReceber = (conta) => {
    setEditandoReceber(conta);
    setFormReceber({
      cliente: conta.clienteNome || "",
      descricao: conta.itens?.[0]?.descricao || conta.itens?.[0]?.nome || `Conta ${conta.numero}`,
      valor: String(conta.valorParcela || conta.total || ""),
      vencimento: conta.dataVencimento || todayISO(),
    });
  };

  const contasFiltradasBase = contasReceberFormatadas(db.ordens)
    .filter((o) => {
      const termo = filtros.busca.trim().toLowerCase();
      const correspondeTexto = !termo
        || (o.clienteNome || "").toLowerCase().includes(termo)
        || String(o.numero || "").toLowerCase().includes(termo.replace(/^#/, ""));
      return correspondeTexto
        && (!filtros.cliente || o.clienteNome === filtros.cliente)
        && (!filtros.dataInicial || (o.dataVencimento || "") >= filtros.dataInicial)
        && (!filtros.dataFinal || (o.dataVencimento || "") <= filtros.dataFinal);
    });
  const pendentes = contasFiltradasBase
    .filter((o) => filtros.status === "todos" || o.statusPagamento === filtros.status)
    .sort((a, b) => (a.dataVencimento || "") > (b.dataVencimento || "") ? 1 : -1);
  const clientesReceber = [...new Set(contasReceberFormatadas(db.ordens).map((conta) => conta.clienteNome).filter(Boolean))].sort();

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
            statusOS: "concluido",
            valorPago: Math.min(totalPago, Number(o.total)),
            dataBaixa: baixa.data || todayISO(),
            formaPagamentoBaixa: baixa.formaPagamento || "Dinheiro",
            statusPagamento: restanteAtual <= 0 ? "pago" : "parcial",
          };
        }
        return {
          ...o,
          statusOS: "concluido",
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

  const totalPendente = contasFiltradasBase.reduce((s, o) => s + Math.max(0, Number(o.valorParcela || 0) - Number(o.valorPago || 0)), 0);
  const totalPago = contasFiltradasBase.reduce((s, o) => s + Number(o.valorPago || 0), 0);
  const totalGeral = contasFiltradasBase.reduce((s, o) => s + Number(o.valorParcela || 0), 0);

  return (
    <div className="space-y-6">
      {reciboFinanceiro && <ReciboFinanceiroModal tipo="receber" conta={reciboFinanceiro} empresa={empresa} onClose={() => setReciboFinanceiro(null)} />}
      <header>
        <h1 className="headline text-2xl font-bold text-slate-900">Contas a receber</h1>
        <p className="text-slate-500 text-sm mt-1">Gerado automaticamente a partir das ordens de serviço pendentes ou parciais.</p>
      </header>

      <Card className="p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-6 lg:items-end">
          <Field label="Conta ou OS">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className={inputCls + " pl-9"} placeholder="Digite para pesquisar..." value={filtros.busca} onChange={(e) => setFiltros((prev) => ({ ...prev, busca: e.target.value }))} />
            </div>
          </Field>
          <Field label="Cliente/Pagador">
            <select className={inputCls} value={filtros.cliente} onChange={(e) => setFiltros((prev) => ({ ...prev, cliente: e.target.value }))}>
              <option value="">Todos</option>
              {clientesReceber.map((cliente) => <option key={cliente} value={cliente}>{cliente}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className={inputCls} value={filtros.status} onChange={(e) => setFiltros((prev) => ({ ...prev, status: e.target.value }))}>
              <option value="todos">Todos</option><option value="pendente">Pendente</option><option value="parcial">Parcial</option><option value="pago">Pago</option>
            </select>
          </Field>
          <Field label="Vencimento inicial"><input type="date" className={inputCls} value={filtros.dataInicial} onChange={(e) => setFiltros((prev) => ({ ...prev, dataInicial: e.target.value }))} /></Field>
          <Field label="Vencimento final"><input type="date" className={inputCls} value={filtros.dataFinal} onChange={(e) => setFiltros((prev) => ({ ...prev, dataFinal: e.target.value }))} /></Field>
          <button onClick={() => setFiltros({ busca: "", cliente: "", status: "todos", dataInicial: "", dataFinal: "" })} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Limpar</button>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-semibold text-slate-800">{editandoReceber ? "Editar conta a receber" : "Lançar conta a receber manualmente"}</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Cliente/Pagador"><input className={inputCls} value={formReceber.cliente} onChange={(e) => setFormReceber((prev) => ({ ...prev, cliente: e.target.value }))} /></Field>
          <Field label="Descrição"><input className={inputCls} value={formReceber.descricao} onChange={(e) => setFormReceber((prev) => ({ ...prev, descricao: e.target.value }))} /></Field>
          <Field label="Valor"><input type="number" min="0" className={inputCls} value={formReceber.valor} onChange={(e) => setFormReceber((prev) => ({ ...prev, valor: e.target.value }))} /></Field>
          <Field label="Vencimento"><input type="date" className={inputCls} value={formReceber.vencimento} onChange={(e) => setFormReceber((prev) => ({ ...prev, vencimento: e.target.value }))} /></Field>
        </div>
        <div className="mt-3 flex gap-3">
          <button onClick={salvarReceber} className="flex items-center gap-1.5 text-sm font-semibold text-violet-700">{editandoReceber ? <Pencil size={16} /> : <Plus size={16} />} {editandoReceber ? "Salvar alterações" : "Adicionar recebimento"}</button>
          {editandoReceber && <button onClick={() => { setEditandoReceber(null); setFormReceber(receberInicial); }} className="text-sm text-slate-500">Cancelar</button>}
        </div>
      </Card>

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
                      <div className="flex justify-end gap-3">
                        <button onClick={() => setReciboFinanceiro(o)} className="text-slate-400 hover:text-orange-600" title="Gerar recibo"><Printer size={17} /></button>
                        <button onClick={() => editarReceber(o)} className="text-slate-400 hover:text-violet-600" title="Editar"><Pencil size={16} /></button>
                        {o.statusPagamento !== "pago" && <button onClick={() => abrirBaixa(o)} className="text-emerald-600 hover:text-emerald-700" title="Registrar baixa"><CheckCircle2 size={17} /></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <div className="flex justify-end">
        <div className="flex w-full flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm sm:w-auto sm:justify-end">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Saldo do filtro</span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="text-slate-500">Total <strong className="ml-1 text-slate-700">{brl(totalGeral)}</strong></span>
            <span className="text-slate-500">Recebido <strong className="ml-1 text-emerald-600">{brl(totalPago)}</strong></span>
            <span className="text-slate-500">A receber <strong className="ml-1 text-amber-600">{brl(totalPendente)}</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Contas a Pagar ----------
function ContasPagar({ db, update, empresa }) {
  const [form, setForm] = useState({ descricao: "", categoria: "Fornecedor", valor: "", vencimento: todayISO() });
  const [editandoId, setEditandoId] = useState(null);
  const [baixa, setBaixa] = useState({ id: null, valor: "", data: todayISO(), formaPagamento: "Dinheiro" });
  const [reciboFinanceiro, setReciboFinanceiro] = useState(null);
  const [filtros, setFiltros] = useState({ busca: "", status: "todos", dataInicial: "", dataFinal: "" });

  const add = () => {
    if (!form.descricao.trim() || form.valor === "") return;
    if (editandoId) {
      update("contasPagar", (prev) => prev.map((conta) => conta.id === editandoId ? { ...conta, ...form, valor: Math.max(Number(conta.valorPago || 0), Number(form.valor)) } : conta));
      setEditandoId(null);
      setForm({ descricao: "", categoria: "Fornecedor", valor: "", vencimento: todayISO() });
      return;
    }
    update("contasPagar", (prev) => [...prev, { id: uid(), ...form, valor: Number(form.valor), status: "pendente", valorPago: 0, dataPagamento: null, dataBaixa: null }]);
    setForm({ descricao: "", categoria: "Fornecedor", valor: "", vencimento: todayISO() });
  };

  const editarConta = (conta) => {
    setEditandoId(conta.id);
    setForm({ descricao: conta.descricao, categoria: conta.categoria, valor: String(conta.valor), vencimento: conta.vencimento });
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

  const lista = db.contasPagar
    .filter((conta) => {
      const termo = filtros.busca.trim().toLowerCase();
      return (!termo || `${conta.descricao || ""} ${conta.categoria || ""}`.toLowerCase().includes(termo))
        && (filtros.status === "todos" || conta.status === filtros.status)
        && (!filtros.dataInicial || (conta.vencimento || "") >= filtros.dataInicial)
        && (!filtros.dataFinal || (conta.vencimento || "") <= filtros.dataFinal);
    })
    .sort((a, b) => (a.vencimento > b.vencimento ? 1 : -1));
  const totalPendente = lista.reduce((s, c) => s + Math.max(0, Number(c.valor) - Number(c.valorPago || 0)), 0);
  const totalPago = lista.reduce((s, c) => s + Number(c.valorPago || 0), 0);
  const totalGeral = lista.reduce((s, c) => s + Number(c.valor || 0), 0);

  return (
    <div className="space-y-6">
      {reciboFinanceiro && <ReciboFinanceiroModal tipo="pagar" conta={reciboFinanceiro} empresa={empresa} onClose={() => setReciboFinanceiro(null)} />}
      <header>
        <h1 className="headline text-2xl font-bold text-slate-900">Contas a pagar</h1>
        <p className="text-slate-500 text-sm mt-1">Fornecedores, contas fixas e outras despesas.</p>
      </header>

      <Card className="p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_160px_180px_180px_auto] md:items-end">
          <Field label="Descrição ou categoria">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className={inputCls + " pl-9"} placeholder="Digite para pesquisar..." value={filtros.busca} onChange={(e) => setFiltros((prev) => ({ ...prev, busca: e.target.value }))} />
            </div>
          </Field>
          <Field label="Status">
            <select className={inputCls} value={filtros.status} onChange={(e) => setFiltros((prev) => ({ ...prev, status: e.target.value }))}>
              <option value="todos">Todos</option><option value="pendente">Pendente</option><option value="parcial">Parcial</option><option value="pago">Pago</option>
            </select>
          </Field>
          <Field label="Vencimento inicial"><input type="date" className={inputCls} value={filtros.dataInicial} onChange={(e) => setFiltros((prev) => ({ ...prev, dataInicial: e.target.value }))} /></Field>
          <Field label="Vencimento final"><input type="date" className={inputCls} value={filtros.dataFinal} onChange={(e) => setFiltros((prev) => ({ ...prev, dataFinal: e.target.value }))} /></Field>
          <button onClick={() => setFiltros({ busca: "", status: "todos", dataInicial: "", dataFinal: "" })} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Limpar</button>
        </div>
      </Card>

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
        <div className="mt-3 flex gap-3">
          <button onClick={add} className="flex items-center gap-1.5 text-sm font-semibold text-violet-700">{editandoId ? <Pencil size={16} /> : <Plus size={16} />} {editandoId ? "Salvar alterações" : "Adicionar conta"}</button>
          {editandoId && <button onClick={() => { setEditandoId(null); setForm({ descricao: "", categoria: "Fornecedor", valor: "", vencimento: todayISO() }); }} className="text-sm text-slate-500">Cancelar</button>}
        </div>
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
                        <button onClick={() => setReciboFinanceiro(c)} className="text-slate-400 hover:text-orange-600" title="Gerar recibo"><Printer size={17} /></button>
                        {c.status !== "pago" && (
                          <button onClick={() => abrirBaixa(c)} className="text-emerald-600 hover:text-emerald-700" title="Registrar baixa"><CheckCircle2 size={17} /></button>
                        )}
                        <button onClick={() => editarConta(c)} className="text-slate-400 hover:text-violet-600" title="Editar"><Pencil size={16} /></button>
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

      <div className="flex justify-end">
        <div className="flex w-full flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm sm:w-auto sm:justify-end">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Saldo do filtro</span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="text-slate-500">Total <strong className="ml-1 text-slate-700">{brl(totalGeral)}</strong></span>
            <span className="text-slate-500">Pago <strong className="ml-1 text-emerald-600">{brl(totalPago)}</strong></span>
            <span className="text-slate-500">A pagar <strong className="ml-1 text-red-600">{brl(totalPendente)}</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
}
