import { useEffect, useMemo, useRef, useState } from "react";
import { createCliente, loadDatabase, syncDatabase } from "./lib/database";
import PedidoVenda from "./componentes/PedidoVenda";
import { calcularItem, filtrarItensValidos, sincronizarParcelas, somarItens } from "./lib/pedido";
import { ClienteDocumento, ItensDocumento, ObservacoesDocumento } from "./componentes/DocumentoVenda";

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
  TrendingUp,
  TrendingDown,
  Search,
  Building2,
  UserCog,
  Pencil,
  Printer,
  RotateCcw,
  ExternalLink,
  MessageCircle,
  ChevronDown
} from "lucide-react";

// ---------- helpers ----------
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const veiculosDoCliente = (cliente = {}) => {
  if (Array.isArray(cliente.veiculos) && cliente.veiculos.length) return cliente.veiculos;
  return cliente.tipoVeiculo || cliente.marca || cliente.veiculo || cliente.cor || cliente.ano || cliente.placa || cliente.frota || cliente.motorista
    ? [{ id: `legado-${cliente.id || "cliente"}`, tipoVeiculo: cliente.tipoVeiculo || "", marca: cliente.marca || "", veiculo: cliente.veiculo || "", cor: cliente.cor || "", ano: cliente.ano || "", placa: cliente.placa || "", frota: cliente.frota || "", motorista: cliente.motorista || "" }]
    : [];
};
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
const enderecoCompleto = (pessoa = {}) =>
  [
    [pessoa.endereco, pessoa.numero].filter(Boolean).join(", "),
    pessoa.bairro,
    [pessoa.cidade, pessoa.estado].filter(Boolean).join(" - "),
  ].filter(Boolean).join(" · ");
const rotuloDocumentoCliente = (cliente = {}) =>
  cliente.tipoPessoa === "juridica" || onlyDigits(cliente.cpfCnpj || "").length > 11 ? "CNPJ" : "CPF";
const dayNumber = (date) => {
  const [year, month, day] = (date || "").split("-").map(Number);
  return year && month && day ? Math.floor(Date.UTC(year, month - 1, day) / 86400000) : null;
};
const addDays = (date, days) => {
  const base = dayNumber(date);
  if (base === null) return "";
  return new Date((base + Number(days || 0)) * 86400000).toISOString().slice(0, 10);
};
const monthKey = (d) => (d || "").slice(0, 7);
const confirmarExclusao = (descricao = "este registro") =>
  window.confirm(`Deseja realmente excluir ${descricao}? Esta ação não poderá ser desfeita.`);
const DEFAULT_ADMIN_USERNAME = "admin";
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

const createDefaultCompanyAdmin = (empresa) => createUsuario({
  nome: "Administrador",
  usuario: DEFAULT_ADMIN_USERNAME,
  senha: DEFAULT_ADMIN_PASSWORD,
  empresaId: empresa.id,
  perfil: "gerente",
});

const createFuncionario = ({ nome, cargo = "Funcionário", empresaId }) => ({
  id: uid(),
  nome: nome.trim(),
  cargo: cargo.trim(),
  empresaId,
});

const getEmpresaData = (db, empresaId) => ({
  ...db,
  clientes: (db.clientes || []).filter((item) => item.empresaId === empresaId),
  funcionarios: (db.funcionarios || []).filter((item) => item.empresaId === empresaId),
  servicos: (db.servicos || []).filter((item) => item.empresaId === empresaId),
  produtos: (db.produtos || []).filter((item) => item.empresaId === empresaId),
  ordens: (db.ordens || []).filter((item) => item.empresaId === empresaId),
  orcamentos: (db.orcamentos || []).filter((item) => item.empresaId === empresaId),
  contasPagar: (db.contasPagar || []).filter((item) => item.empresaId === empresaId),
  contatosRetorno: (db.contatosRetorno || []).filter((item) => item.empresaId === empresaId),
});

const clientesParaRetorno = (db, hoje = todayISO()) => {
  const servicos = new Map((db.servicos || []).map((servico) => [String(servico.id), servico]));
  const clientes = new Map((db.clientes || []).map((cliente) => [String(cliente.id), cliente]));
  const ultimoPorCliente = new Map();

  [...(db.ordens || [])]
    .filter((ordem) => ordem.statusOS === "concluido" && ordem.clienteId && ordem.data)
    .sort((a, b) => String(b.data).localeCompare(String(a.data)))
    .forEach((ordem) => {
      if (ultimoPorCliente.has(String(ordem.clienteId))) return;
      const item = (ordem.itens || []).find((registro) => {
        const servico = servicos.get(String(registro.itemId));
        return registro.tipo === "servico" && Number(servico?.diasRetornoSugerido) > 0;
      });
      if (!item) return;
      const servico = servicos.get(String(item.itemId));
      ultimoPorCliente.set(String(ordem.clienteId), { ordem, servico, item });
    });

  const hojeNumero = dayNumber(hoje);
  return [...ultimoPorCliente.entries()].flatMap(([clienteId, { ordem, servico, item }]) => {
    const cliente = clientes.get(clienteId);
    const retornoPrevisto = addDays(ordem.data, servico.diasRetornoSugerido);
    const diasParaRetorno = dayNumber(retornoPrevisto) - hojeNumero;
    if (!cliente || diasParaRetorno > 5) return [];
    const status = diasParaRetorno > 0 ? "proximo" : diasParaRetorno >= -7 ? "hora" : "atrasado";
    const contatos = (db.contatosRetorno || [])
      .filter((contato) => String(contato.clienteId) === clienteId)
      .sort((a, b) => String(b.dataContato).localeCompare(String(a.dataContato)));
    return [{
      cliente,
      ordem,
      servico,
      nomeServico: item.descricao || servico.nome || item.nome || "Serviço",
      ultimoAtendimento: ordem.data,
      retornoPrevisto,
      diasDesdeUltimoAtendimento: hojeNumero - dayNumber(ordem.data),
      diasAtraso: Math.max(0, -diasParaRetorno),
      diasParaRetorno,
      status,
      ultimoContato: contatos[0]?.dataContato || "",
    }];
  }).sort((a, b) => {
    const prioridade = { atrasado: 0, hora: 1, proximo: 2 };
    return prioridade[a.status] - prioridade[b.status]
      || dayNumber(a.retornoPrevisto) - dayNumber(b.retornoPrevisto);
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
      valorParcela: Number(parcela.valor ?? ordem.total ?? 0),
      formaPagamento: parcela.formaPagamento || ordem.formaPagamento,
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
  orcamentos: [],
  contasPagar: [],
  contatosRetorno: [],
};

const STORAGE_KEY = "jato_sistem_db_v1";
const UI_STORAGE_KEY = "jato_sistem_ui_v1";

const loadSavedUi = () => {
  try {
    return JSON.parse(localStorage.getItem(UI_STORAGE_KEY) || "{}") || {};
  } catch {
    return {};
  }
};

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
  "app-input w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm text-slate-700 shadow-sm placeholder:text-slate-400 transition focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-700";

function Card({ children, className = "" }) {
  return (
    <div className={`app-card rounded-2xl border border-slate-200/80 bg-white/90 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.45)] backdrop-blur-sm ${className}`}>
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
    cyan: "bg-emerald-100 text-emerald-800",
    violet: "bg-emerald-100 text-emerald-800",
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
  const [servicoAberto, setServicoAberto] = useState(false);
  const [cadastrosAberto, setCadastrosAberto] = useState(false);
  const [financeiroAberto, setFinanceiroAberto] = useState(false);
  const [ordemEmEdicao, setOrdemEmEdicao] = useState(null);
  const [auth, setAuth] = useState({ usuario: "", senha: "", empresaId: "", usuarioLogado: null });
  const lastSynced = useRef(SEED);
  const dbRef = useRef(SEED);
  const syncQueue = useRef(Promise.resolve());
  const mainRef = useRef(null);

  const persistSnapshot = (snapshot) => {
    const task = syncQueue.current
      .catch(() => undefined)
      .then(async () => {
        await syncDatabase(lastSynced.current, snapshot);
        lastSynced.current = snapshot;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      });
    syncQueue.current = task.catch((error) => {
      console.error("Erro ao sincronizar dados com o Supabase:", error);
    });
    return task;
  };

  useEffect(() => {
    let active = true;
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
        const legacyCompanyId = initialData.empresas[0]?.id || empresaAdmId;
        ["usuarios", "clientes", "funcionarios", "servicos", "produtos", "ordens", "orcamentos", "contasPagar", "contatosRetorno"].forEach((collection) => {
          initialData[collection] = (initialData[collection] || []).map((item) =>
            item.empresaId ? item : { ...item, empresaId: legacyCompanyId }
          );
        });
        const companyIdsWithAdmin = new Set(
          (initialData.usuarios || [])
            .filter((usuario) => String(usuario.usuario || "").trim().toLowerCase() === DEFAULT_ADMIN_USERNAME)
            .map((usuario) => usuario.empresaId)
        );
        const missingCompanyAdmins = (initialData.empresas || [])
          .filter((empresa) => !companyIdsWithAdmin.has(empresa.id))
          .map((empresa) => createDefaultCompanyAdmin(empresa));
        if (missingCompanyAdmins.length) {
          initialData.usuarios = [...(initialData.usuarios || []), ...missingCompanyAdmins];
        }
        lastSynced.current = remoteInitialized ? initialData : {
          ...initialData,
          empresas: [],
          usuarios: [],
          funcionarios: [],
          servicos: [],
          produtos: [],
          ordens: [],
          orcamentos: [],
          contasPagar: [],
          contatosRetorno: [],
        };
        if (!active) return;
        dbRef.current = initialData;
        setDb(initialData);
        const savedUi = loadSavedUi();
        const savedUser = (initialData.usuarios || []).find((usuario) => usuario.id === savedUi.usuarioId);
        if (savedUser) {
          const allowedUserTabs = ["ordens", "orcamentos", "clientes"];
          const managerTabs = ["dashboard", "ordens", "orcamentos", "clientes", "funcionarios", "catalogo", "receber", "pagar", "usuarios"];
          const masterTabs = [...managerTabs, "empresas"];
          const allowedTabs = savedUser.perfil === "master" ? masterTabs : savedUser.perfil === "gerente" ? managerTabs : allowedUserTabs;
          const savedTab = ["nova-os", "agenda"].includes(savedUi.tab)
            ? "ordens"
            : ["servicos", "estoque"].includes(savedUi.tab) ? "catalogo" : savedUi.tab;
          const restoredTab = allowedTabs.includes(savedTab)
            ? savedTab
            : savedUser.perfil === "usuario" ? "ordens" : "dashboard";
          setAuth({ usuario: savedUser.usuario, senha: "", empresaId: savedUser.empresaId || savedUi.empresaId || "", usuarioLogado: savedUser });
          setTab(restoredTab);
        }
        setLoaded(true);
        persistSnapshot(initialData).catch((error) => {
          window.alert(`Não foi possível inicializar o Supabase: ${error.message}`);
        });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded || !auth.usuarioLogado || tab === "login") return;

    let cancelled = false;
    const refreshFromRemote = async () => {
      try {
        const { database } = await loadDatabase(SEED);
        if (cancelled) return;
        const nextSnapshot = JSON.parse(JSON.stringify(database));
        const hasChanged = JSON.stringify(dbRef.current) !== JSON.stringify(nextSnapshot);
        if (hasChanged) {
          dbRef.current = nextSnapshot;
          setDb(nextSnapshot);
          lastSynced.current = nextSnapshot;
        }
      } catch (error) {
        console.error("Erro ao sincronizar dados em segundo plano:", error);
      }
    };

    refreshFromRemote();
    const timer = window.setInterval(refreshFromRemote, 7000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [loaded, auth.usuarioLogado, auth.empresaId, tab]);

  useEffect(() => {
    if (!loaded || !auth.usuarioLogado || tab === "login") return;
    const savedUi = loadSavedUi();
    localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({
      ...savedUi,
      usuarioId: auth.usuarioLogado.id,
      empresaId: auth.empresaId || auth.usuarioLogado.empresaId || "",
      tab,
    }));
  }, [loaded, auth.usuarioLogado, auth.empresaId, tab]);

  useEffect(() => {
    if (["ordens", "orcamentos"].includes(tab)) setServicoAberto(true);
    if (["empresas", "usuarios", "clientes", "funcionarios", "catalogo"].includes(tab)) setCadastrosAberto(true);
    if (["receber", "pagar"].includes(tab)) setFinanceiroAberto(true);
  }, [tab]);

  useEffect(() => {
    if (!loaded || tab === "login") return;
    const savedUi = loadSavedUi();
    const scrollTop = Number(savedUi.scrollByTab?.[tab] || 0);
    const frame = window.requestAnimationFrame(() => {
      if (mainRef.current) mainRef.current.scrollTop = scrollTop;
      window.scrollTo({ top: scrollTop, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loaded, tab]);

  useEffect(() => {
    if (!loaded || tab === "login") return;
    const saveWindowScroll = () => {
      const savedUi = loadSavedUi();
      const scrollTop = Math.max(window.scrollY, mainRef.current?.scrollTop || 0);
      localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({
        ...savedUi,
        scrollByTab: { ...savedUi.scrollByTab, [tab]: scrollTop },
      }));
    };
    window.addEventListener("scroll", saveWindowScroll, { passive: true });
    window.addEventListener("beforeunload", saveWindowScroll);
    return () => {
      saveWindowScroll();
      window.removeEventListener("scroll", saveWindowScroll);
      window.removeEventListener("beforeunload", saveWindowScroll);
    };
  }, [loaded, tab]);

  const update = (key, updater) => {
    const previous = dbRef.current;
    let next = { ...previous };
    const changes = typeof key === "string" ? { [key]: updater } : key;
    for (const [collection, applyUpdate] of Object.entries(changes)) {
      if (collection === "empresas" || collection === "usuarios") {
        next = { ...next, [collection]: applyUpdate(next[collection] || []) };
      } else {
        const companyId = auth.empresaId || auth.usuarioLogado?.empresaId || "";
        if (!companyId) throw new Error("Operação bloqueada: nenhuma empresa está vinculada ao usuário.");
        const items = next[collection] || [];
        const currentItems = items.filter((item) => item.empresaId === companyId);
        const otherItems = items.filter((item) => item.empresaId !== companyId);
        const updatedItems = applyUpdate(currentItems).map((item) => ({ ...(collection === "ordens" ? sincronizarParcelas(item) : item), empresaId: companyId }));
        next = { ...next, [collection]: [...otherItems, ...updatedItems] };
        if (collection === "ordens") {
          const remainingIds = new Set(updatedItems.map((item) => String(item.id)));
          const removedOrders = currentItems.filter((item) => !remainingIds.has(String(item.id)));
          next.orcamentos = (next.orcamentos || []).map((orcamento) => {
            const pedidoExcluido = orcamento.empresaId === companyId && removedOrders.some((ordem) =>
              orcamento.pedidoId
                ? String(orcamento.pedidoId) === String(ordem.id)
                : ordem.origemOrcamentoId != null && String(ordem.origemOrcamentoId) === String(orcamento.id)
            );
            return pedidoExcluido
              ? { ...orcamento, status: "pendente", pedidoId: null, convertidoEm: null }
              : orcamento;
          });
        }
      }
    }

    const snapshot = JSON.parse(JSON.stringify(next));
    dbRef.current = snapshot;
    setDb(snapshot);
    return persistSnapshot(snapshot);
  };

  const excluirEmpresa = (empresaId) => {
    const previous = dbRef.current;
    const tenantCollections = [
      "usuarios", "clientes", "funcionarios", "servicos", "produtos",
      "ordens", "orcamentos", "contasPagar", "contatosRetorno",
    ];
    const next = {
      ...previous,
      empresas: (previous.empresas || []).filter((empresa) => empresa.id !== empresaId),
    };

    tenantCollections.forEach((collection) => {
      next[collection] = (previous[collection] || []).filter((item) => item.empresaId !== empresaId);
    });

    const snapshot = JSON.parse(JSON.stringify(next));
    dbRef.current = snapshot;
    setDb(snapshot);
    return persistSnapshot(snapshot);
  };

  const empresas = db.empresas || [];
  const usuarios = db.usuarios || [];
  const empresaAtiva = empresas.find((empresa) => empresa.id === (auth.empresaId || auth.usuarioLogado?.empresaId)) || null;
  const enderecoEmpresaAtiva = empresaAtiva
    ? [
        [empresaAtiva.endereco, empresaAtiva.numero].filter(Boolean).join(", "),
        empresaAtiva.bairro,
        [empresaAtiva.cidade, empresaAtiva.estado].filter(Boolean).join(" - "),
      ].filter(Boolean).join(" · ")
    : "";
  const authUser = auth.usuarioLogado || usuarios.find((u) => u.usuario === auth.usuario && u.senha === auth.senha);
  const isMaster = authUser?.perfil === "master";
  const isGerente = authUser?.perfil === "gerente";
  const podeGerenciarUsuarios = isMaster || isGerente;
  const tabsUsuario = ["ordens", "orcamentos", "clientes"];
  const podeAcessar = (tabId) => isMaster || isGerente || tabsUsuario.includes(tabId);
  const canShowCadastros = isMaster || isGerente || podeAcessar("clientes") || podeAcessar("funcionarios") || podeAcessar("catalogo") || podeGerenciarUsuarios;
  const canShowFinanceiro = podeAcessar("receber") || podeAcessar("pagar");

  const entrar = () => {
    const isDefaultAdmin = auth.usuario.trim().toLowerCase() === DEFAULT_ADMIN_USERNAME;
    const user = usuarios.find((u) =>
      u.usuario === auth.usuario
      && u.senha === auth.senha
      && (!isDefaultAdmin || u.empresaId === auth.empresaId)
    );
    if (!user) return;
    const empresaId = user.empresaId || (auth.empresaId || empresas[0]?.id || "");
    setAuth((prev) => ({ ...prev, empresaId, usuarioLogado: user }));
    setTab("ordens");
  };

  const sair = () => {
    localStorage.removeItem(UI_STORAGE_KEY);
    setAuth({ usuario: "", senha: "", empresaId: "", usuarioLogado: null });
    setTab("login");
  };

  const saveScrollPosition = (event) => {
    if (tab === "login") return;
    const savedUi = loadSavedUi();
    localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({
      ...savedUi,
      scrollByTab: { ...savedUi.scrollByTab, [tab]: event.currentTarget.scrollTop },
    }));
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
  ].filter((item) => podeAcessar(item.accessId || item.id));

  if (!loaded) {
    return <div className="min-h-screen grid place-items-center bg-slate-50 text-sm font-medium text-slate-500">Carregando MM ERP...</div>;
  }

  if (tab === "login") {
    return <LoginScreen auth={auth} setAuth={setAuth} entrar={entrar} db={db} />;
  }

  return (
    <div className="app-shell min-h-screen w-full text-slate-800 flex" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');
        .headline { font-family: 'Space Grotesk', system-ui, sans-serif; }
      `}</style>

      {/* Sidebar */}
      <aside className="app-sidebar w-64 shrink-0 text-white flex flex-col">
        <div className="sidebar-identity px-4 pt-4 pb-3">
          <div className="brand-panel overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-white/20">
            <img src="/mm-erp-logo.png" alt="MM ERP" className="mx-auto h-[104px] w-auto object-contain" />
          </div>
          <section className="company-identity mt-3 rounded-xl border border-white/10 bg-black/10 px-3 py-2.5" aria-label="Empresa conectada">
            <div className="mb-1 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-orange-200">
              <Building2 size={11} aria-hidden="true" /> Empresa conectada
            </div>
            <div className="company-name truncate text-[13px] font-semibold leading-tight text-white" title={empresaAtiva?.nome || "Empresa não identificada"}>
              {empresaAtiva?.nome || "Empresa não identificada"}
            </div>
            <div className="mt-1.5 space-y-0.5 text-[10px] leading-[1.35] text-slate-300">
              {empresaAtiva?.cnpj && <div title={`CNPJ ${empresaAtiva.cnpj}`}>CNPJ {empresaAtiva.cnpj}</div>}
              {enderecoEmpresaAtiva && <div className="company-address line-clamp-2" title={enderecoEmpresaAtiva}>{enderecoEmpresaAtiva}</div>}
              {empresaAtiva?.telefone && <div title={`Telefone ${empresaAtiva.telefone}`}>Tel. {empresaAtiva.telefone}</div>}
              {!empresaAtiva?.cnpj && !enderecoEmpresaAtiva && !empresaAtiva?.telefone && (
                <div className="italic text-slate-400">Dados cadastrais não informados</div>
              )}
            </div>
          </section>
          <div className="hidden">
            <div className="headline font-bold text-lg leading-tight">MM ERP</div>
            <div className="text-[11px] text-orange-200 tracking-wide uppercase">MM Tecnologia</div>
          </div>
        </div>
        <svg viewBox="0 0 256 12" className="w-full" preserveAspectRatio="none" style={{ height: 10 }}>
          <path d="M0,6 C40,0 80,12 120,6 C160,0 200,12 256,6 L256,12 L0,12 Z" fill="url(#wave)" />
          <defs>
            <linearGradient id="wave" x1="0" x2="1">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="100%" stopColor="#991b1b" />
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
                    ? "bg-orange-500/20 text-orange-200 border border-orange-400/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    : "text-slate-300 hover:bg-white/5 hover:text-white border border-transparent"
                }`}
              >
                <Icon size={17} />
                {n.label}
              </button>
            );
          })}

          {canShowCadastros && (
            <div>
              <button
                type="button"
                onClick={() => setCadastrosAberto((aberto) => !aberto)}
                aria-expanded={cadastrosAberto}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                  ["empresas", "usuarios", "clientes", "funcionarios", "catalogo"].includes(tab)
                    ? "bg-orange-500/20 text-orange-200 border border-orange-400/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    : "text-slate-300 hover:bg-white/5 hover:text-white border border-transparent"
                }`}
              >
                <Users size={17} />
                Cadastros
                <ChevronDown size={16} className={`ml-auto transition-transform ${cadastrosAberto ? "rotate-180" : ""}`} />
              </button>
              {cadastrosAberto && (
                <div className="ml-5 mt-1 space-y-1 border-l border-white/15 pl-3">
                  {isMaster && (
                    <button type="button" onClick={() => setTab("empresas")} className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${tab === "empresas" ? "bg-white/10 font-semibold text-orange-200" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>
                      Empresas
                    </button>
                  )}
                  {podeGerenciarUsuarios && (
                    <button type="button" onClick={() => setTab("usuarios")} className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${tab === "usuarios" ? "bg-white/10 font-semibold text-orange-200" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>
                      Usuários
                    </button>
                  )}
                  {podeAcessar("clientes") && (
                    <button type="button" onClick={() => setTab("clientes")} className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${tab === "clientes" ? "bg-white/10 font-semibold text-orange-200" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>
                      Clientes
                    </button>
                  )}
                  {podeAcessar("funcionarios") && (
                    <button type="button" onClick={() => setTab("funcionarios")} className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${tab === "funcionarios" ? "bg-white/10 font-semibold text-orange-200" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>
                      Funcionários
                    </button>
                  )}
                  {podeAcessar("catalogo") && (
                    <button type="button" onClick={() => setTab("catalogo")} className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${tab === "catalogo" ? "bg-white/10 font-semibold text-orange-200" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>
                      Produtos e Serviços
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={() => setServicoAberto((aberto) => !aberto)}
              aria-expanded={servicoAberto}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                ["ordens", "orcamentos"].includes(tab)
                  ? "bg-orange-500/20 text-orange-200 border border-orange-400/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                  : "text-slate-300 hover:bg-white/5 hover:text-white border border-transparent"
              }`}
            >
              <ClipboardList size={17} />
              Serviço
              <ChevronDown size={16} className={`ml-auto transition-transform ${servicoAberto ? "rotate-180" : ""}`} />
            </button>
            {servicoAberto && (
              <div className="ml-5 mt-1 space-y-1 border-l border-white/15 pl-3">
                <button
                  type="button"
                  onClick={() => setTab("orcamentos")}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${tab === "orcamentos" ? "bg-white/10 font-semibold text-orange-200" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}
                >
                  Orçamento
                </button>
                <button
                  type="button"
                  onClick={() => setTab("ordens")}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${tab === "ordens" ? "bg-white/10 font-semibold text-orange-200" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}
                >
                  Pedido
                </button>
              </div>
            )}
          </div>

          {canShowFinanceiro && (
            <div>
              <button
                type="button"
                onClick={() => setFinanceiroAberto((aberto) => !aberto)}
                aria-expanded={financeiroAberto}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                  ["receber", "pagar"].includes(tab)
                    ? "bg-orange-500/20 text-orange-200 border border-orange-400/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    : "text-slate-300 hover:bg-white/5 hover:text-white border border-transparent"
                }`}
              >
                <Wallet size={17} />
                Financeiro
                <ChevronDown size={16} className={`ml-auto transition-transform ${financeiroAberto ? "rotate-180" : ""}`} />
              </button>
              {financeiroAberto && (
                <div className="ml-5 mt-1 space-y-1 border-l border-white/15 pl-3">
                  {podeAcessar("receber") && (
                    <button type="button" onClick={() => setTab("receber")} className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${tab === "receber" ? "bg-white/10 font-semibold text-orange-200" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>
                      Contas a Receber
                    </button>
                  )}
                  {podeAcessar("pagar") && (
                    <button type="button" onClick={() => setTab("pagar")} className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${tab === "pagar" ? "bg-white/10 font-semibold text-orange-200" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>
                      Contas a Pagar
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </nav>
        <div className="px-5 py-4 text-[11px] text-slate-400 border-t border-white/10">
          <div className="mb-1 font-medium text-slate-200">{authUser?.nome || "Usuário"}</div>
          <div className="mb-3 text-[10px] uppercase tracking-[0.14em] text-slate-400">MM ERP · MM Tecnologia</div>
          <button onClick={sair} className="text-orange-200 hover:text-white">Sair do sistema</button>
        </div>
      </aside>

      {/* Main */}
      <main ref={mainRef} onScroll={saveScrollPosition} className="app-main flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6 md:p-8">
          {tab === "dashboard" && podeAcessar("dashboard") && <Dashboard db={getEmpresaData(db, auth.empresaId || auth.usuarioLogado?.empresaId || "")} stats={stats} update={update} authUser={authUser} />}
          {tab === "orcamentos" && podeAcessar("orcamentos") && <OrcamentosWorkspace db={getEmpresaData(db, auth.empresaId || auth.usuarioLogado?.empresaId || "")} update={update} empresa={empresaAtiva} onAbrirPedido={(pedido) => { setOrdemEmEdicao(pedido); setTab("ordens"); }} />}
          {tab === "ordens" && <OrdensWorkspace db={getEmpresaData(db, auth.empresaId || auth.usuarioLogado?.empresaId || "")} update={update} empresa={empresaAtiva} ordemEmEdicao={ordemEmEdicao} setOrdemEmEdicao={setOrdemEmEdicao} podeEditarValor={isMaster || isGerente} />}
          {tab === "clientes" && <Clientes db={getEmpresaData(db, auth.empresaId || auth.usuarioLogado?.empresaId || "")} update={update} empresaId={auth.empresaId || auth.usuarioLogado?.empresaId || ""} empresaSegmento={empresaAtiva?.segmento || "lava-jato"} />}
          {tab === "funcionarios" && podeAcessar("funcionarios") && <FuncionariosScreen db={getEmpresaData(db, auth.empresaId || auth.usuarioLogado?.empresaId || "")} update={update} empresaId={auth.empresaId || auth.usuarioLogado?.empresaId || ""} />}
          {tab === "catalogo" && podeAcessar("catalogo") && <ProdutosServicos db={getEmpresaData(db, auth.empresaId || auth.usuarioLogado?.empresaId || "")} update={update} />}
          {tab === "receber" && podeAcessar("receber") && <ContasReceber db={getEmpresaData(db, auth.empresaId || auth.usuarioLogado?.empresaId || "")} update={update} empresa={empresaAtiva} />}
          {tab === "pagar" && podeAcessar("pagar") && <ContasPagar db={getEmpresaData(db, auth.empresaId || auth.usuarioLogado?.empresaId || "")} update={update} empresa={empresaAtiva} />}
          {tab === "empresas" && isMaster && <EmpresasScreen db={db} update={update} excluirEmpresa={excluirEmpresa} empresaAtivaId={empresaAtiva?.id} />}
          {tab === "usuarios" && podeGerenciarUsuarios && <UsuariosScreen db={db} update={update} isMaster={isMaster} empresaId={auth.empresaId || auth.usuarioLogado?.empresaId || ""} />}
        </div>
      </main>
    </div>
  );
}

function LoginScreen({ auth, setAuth, entrar, db }) {
  const [erro, setErro] = useState("");
  const [modo, setModo] = useState("login");
  const [sucesso, setSucesso] = useState("");
  const [cadastro, setCadastro] = useState({
    nome: "",
    email: "",
    empresa: "",
    telefone: "",
    segmento: "lava-jato",
    mensagem: "",
  });
  const isDefaultAdmin = auth.usuario.trim().toLowerCase() === DEFAULT_ADMIN_USERNAME;
  const beneficios = [
    "Controle financeiro em tempo real",
    "Gestão de pedidos, clientes e estoque",
    "Relatórios para decisões mais rápidas",
    "Fluxo organizado para equipes e empresas",
  ];

  const solicitarAcesso = () => {
    if (!cadastro.nome || !cadastro.email || !cadastro.empresa) {
      setErro("Preencha nome, e-mail e empresa para solicitar o acesso.");
      setSucesso("");
      return;
    }

    const subject = encodeURIComponent("Solicitação de acesso ao MM ERP");
    const body = encodeURIComponent(
      `Nome: ${cadastro.nome}\n` +
      `E-mail: ${cadastro.email}\n` +
      `Empresa: ${cadastro.empresa}\n` +
      `Segmento: ${cadastro.segmento}\n` +
      `Telefone: ${cadastro.telefone || "Não informado"}\n\n` +
      `Mensagem: ${cadastro.mensagem || "Quero conhecer os benefícios do sistema para a minha empresa."}`
    );

    setErro("");
    setSucesso("Solicitação enviada. Seu e-mail foi preparado para liberar o acesso após aprovação.");
    window.location.href = `mailto:contato@mmtec.com.br?subject=${subject}&body=${body}`;
  };

  const entrarComCredenciais = () => {
    const user = (db.usuarios || []).find((u) =>
      u.usuario === auth.usuario &&
      u.senha === auth.senha &&
      (!isDefaultAdmin || u.empresaId === auth.empresaId)
    );

    if (!user) {
      setErro(isDefaultAdmin && !auth.empresaId ? "Selecione a empresa." : "Usuário ou senha inválidos.");
      setSucesso("");
      return;
    }

    setErro("");
    setSucesso("");
    entrar();
  };

  return (
    <div className="min-h-screen bg-[#f7f5f1] text-slate-800">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <img src="/mm-erp-logo.png" alt="MM ERP" className="h-12 w-auto" />
            <div className="text-gray-500">|</div>
            <div className="headline text-xl font-bold text-slate-800">MM ERP</div>
          </div>
          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
            <span>Vantagens</span>
            <span>Funcionalidades</span>
            <span>Segmentos</span>
            <span>Contato</span>
          </nav>
          <button className="rounded-xl bg-[#d96a5a] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#c75a4a]">Acessar conta</button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8 md:py-12">
        <section className="overflow-hidden rounded-[30px] bg-[linear-gradient(135deg,#d77a63_0%,#c1544a_48%,#8e3e3a_100%)] shadow-[0_30px_80px_-40px_rgba(95,38,34,0.9)]">
          <div className="grid items-center gap-8 px-6 py-8 md:grid-cols-[1.2fr_0.8fr] md:px-12 md:py-12">
            <div className="space-y-6 text-white">
              <div className="inline-flex items-center rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-rose-50">
                Gestão inteligente
              </div>
              <h1 className="headline max-w-xl text-4xl font-bold leading-tight md:text-5xl">
                Sua empresa mais organizada, eficiente e pronta para crescer.
              </h1>
              <p className="max-w-xl text-base text-rose-50/90 md:text-lg">
                O MM ERP centraliza clientes, vendas, finanças, estoque e operação em um único sistema pensado para acelerar a rotina do seu negócio.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                {beneficios.map((item) => (
                  <div key={item} className="flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-rose-50 backdrop-blur-sm">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-xs font-bold">✓</span>
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[26px] bg-white p-5 shadow-2xl ring-1 ring-slate-200/90 md:p-6">
              <div className="mb-5 flex rounded-full bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setModo("login")}
                  className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold transition ${modo === "login" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  onClick={() => setModo("cadastro")}
                  className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold transition ${modo === "cadastro" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                >
                  Cadastrar
                </button>
              </div>

              {modo === "login" ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#b85c4a]">MM Tecnologia</p>
                    <h2 className="headline mt-1 text-2xl font-bold text-slate-900">Acessar o sistema</h2>
                  </div>

                  <Field label="Usuário">
                    <input className={inputCls} value={auth.usuario} onChange={(e) => setAuth((prev) => ({ ...prev, usuario: e.target.value }))} />
                  </Field>
                  <Field label="Senha">
                    <input type="password" className={inputCls} value={auth.senha} onChange={(e) => setAuth((prev) => ({ ...prev, senha: e.target.value }))} />
                  </Field>
                  {isDefaultAdmin && (
                    <Field label="Empresa">
                      <select className={inputCls} value={auth.empresaId} onChange={(e) => setAuth((prev) => ({ ...prev, empresaId: e.target.value }))}>
                        <option value="">Selecione a empresa</option>
                        {(db.empresas || []).map((empresa) => <option key={empresa.id} value={empresa.id}>{empresa.nome}</option>)}
                      </select>
                    </Field>
                  )}

                  {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}
                  {sucesso && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{sucesso}</div>}

                  <button onClick={entrarComCredenciais} className="w-full rounded-xl bg-[#d76b5d] py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#c8574c]">
                    Entrar no MM ERP
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#b85c4a]">Solicite seu acesso</p>
                    <h2 className="headline mt-1 text-2xl font-bold text-slate-900">Cadastrar empresa</h2>
                  </div>

                  <Field label="Seu nome">
                    <input className={inputCls} value={cadastro.nome} onChange={(e) => setCadastro((prev) => ({ ...prev, nome: e.target.value }))} />
                  </Field>
                  <Field label="E-mail">
                    <input type="email" className={inputCls} value={cadastro.email} onChange={(e) => setCadastro((prev) => ({ ...prev, email: e.target.value }))} />
                  </Field>
                  <Field label="Empresa">
                    <input className={inputCls} value={cadastro.empresa} onChange={(e) => setCadastro((prev) => ({ ...prev, empresa: e.target.value }))} />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Telefone">
                      <input className={inputCls} value={cadastro.telefone} onChange={(e) => setCadastro((prev) => ({ ...prev, telefone: e.target.value }))} />
                    </Field>
                    <Field label="Segmento">
                      <select className={inputCls} value={cadastro.segmento} onChange={(e) => setCadastro((prev) => ({ ...prev, segmento: e.target.value }))}>
                        <option value="lava-jato">Lava Jato</option>
                        <option value="barbearia">Barbearia</option>
                        <option value="cabeleleiro">Cabeleireiro</option>
                        <option value="estetica">Estética</option>
                        <option value="outro">Outro</option>
                      </select>
                    </Field>
                  </div>
                  <Field label="Qual a vantagem que você quer no sistema?">
                    <textarea rows="3" className={inputCls} value={cadastro.mensagem} onChange={(e) => setCadastro((prev) => ({ ...prev, mensagem: e.target.value }))} placeholder="Ex.: Quero controlar pedidos, estoque e financeiro em um só lugar." />
                  </Field>

                  {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}
                  {sucesso && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{sucesso}</div>}

                  <button onClick={solicitarAcesso} className="w-full rounded-xl bg-[#c55d50] py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#af4b40]">
                    Solicitar acesso
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function EmpresasScreen({ db, update, excluirEmpresa, empresaAtivaId }) {
  const empresaFormInicial = {
    nome: "", razaoSocial: "", cnpj: "", inscricaoEstadual: "", email: "", telefone: "",
    cep: "", endereco: "", numero: "", bairro: "", cidade: "", estado: "",
    segmento: "lava-jato",
  };
  const [form, setForm] = useState(empresaFormInicial);
  const [editandoId, setEditandoId] = useState(null);
  const [segmentoEditandoId, setSegmentoEditandoId] = useState(null);
  const [segmentoEditado, setSegmentoEditado] = useState("lava-jato");
  const [excluindoId, setExcluindoId] = useState(null);
  const [erroExcluir, setErroExcluir] = useState("");

  const add = async () => {
    if (!form.nome.trim()) return;
    if (editandoId) {
      update("empresas", (prev) => prev.map((empresa) => empresa.id === editandoId ? { ...empresa, ...form } : empresa));
      setEditandoId(null);
      setForm(empresaFormInicial);
      return;
    }
    const empresa = createEmpresa(form);
    await update("empresas", (prev) => [...prev, empresa]);
    await update("usuarios", (prev) => [...prev, createDefaultCompanyAdmin(empresa)]);
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

  const removerEmpresa = async (empresa) => {
    if (empresa.id === empresaAtivaId) {
      setErroExcluir("A empresa conectada não pode ser excluída. Entre por outra empresa administradora para removê-la.");
      return;
    }
    if (!window.confirm(`Excluir a empresa "${empresa.nome}"? Todos os usuários e dados vinculados a ela também serão excluídos.`)) return;

    setErroExcluir("");
    setExcluindoId(empresa.id);
    try {
      await excluirEmpresa(empresa.id);
      if (editandoId === empresa.id) {
        setEditandoId(null);
        setForm(empresaFormInicial);
      }
    } catch (error) {
      setErroExcluir(`Não foi possível excluir a empresa: ${error.message}`);
    } finally {
      setExcluindoId(null);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="headline text-2xl font-bold text-slate-900">Empresas</h1>
        <p className="text-slate-500 text-sm mt-1">Ao cadastrar uma empresa, o acesso administrativo padrão é criado automaticamente.</p>
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
          <button onClick={add} className="rounded-xl bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white">{editandoId ? "Salvar alterações" : "Salvar empresa"}</button>
          {editandoId && <button onClick={() => { setEditandoId(null); setForm(empresaFormInicial); }} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600">Cancelar</button>}
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {erroExcluir && <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{erroExcluir}</div>}
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
                      <button onClick={() => salvarEdicaoSegmento(empresa.id)} className="text-sm font-semibold text-orange-700">Salvar</button>
                      <button onClick={cancelarEdicaoSegmento} className="text-sm text-slate-500">Cancelar</button>
                    </div>
                  ) : (
                    <span>{empresa.segmento || "lava-jato"}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">{fmtDate(empresa.criadoEm)}</td>
                <td className="px-4 py-3 text-slate-500">
                  {segmentoEditandoId === empresa.id ? null : (
                    <div className="flex items-center gap-3">
                      <button onClick={() => editarEmpresa(empresa)} className="text-sm font-semibold text-emerald-700 hover:text-emerald-800">Editar</button>
                      <button
                        onClick={() => removerEmpresa(empresa)}
                        disabled={excluindoId === empresa.id || empresa.id === empresaAtivaId}
                        title={empresa.id === empresaAtivaId ? "A empresa conectada não pode ser excluída" : "Excluir empresa"}
                        className="text-sm font-semibold text-red-600 hover:text-red-700 disabled:cursor-not-allowed disabled:text-slate-300"
                      >
                        {excluindoId === empresa.id ? "Excluindo..." : "Excluir"}
                      </button>
                    </div>
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
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState("");
  const empresasDisponiveis = db.empresas || [];
  const empresaSelecionadaValida = empresasDisponiveis.some((empresa) => String(empresa.id) === String(empresaSelecionada))
    ? empresaSelecionada
    : (empresasDisponiveis[0]?.id || empresaId || "");

  useEffect(() => {
    if (empresaSelecionadaValida && String(empresaSelecionada) !== String(empresaSelecionadaValida)) {
      setEmpresaSelecionada(empresaSelecionadaValida);
    }
  }, [empresaSelecionada, empresaSelecionadaValida]);

  const add = async () => {
    if (!form.nome.trim() || !form.usuario.trim() || !form.senha.trim()) {
      setErroSalvar("Preencha nome, usuário e senha.");
      return;
    }
    const targetEmpresaId = isMaster ? (empresaSelecionadaValida || form.empresaId) : empresaId;
    const usuarioDuplicado = (db.usuarios || []).some(
      (usuario) => usuario.id !== editandoId
        && (form.usuario.trim().toLowerCase() !== DEFAULT_ADMIN_USERNAME || usuario.empresaId === targetEmpresaId)
        && usuario.usuario.trim().toLowerCase() === form.usuario.trim().toLowerCase()
    );
    if (usuarioDuplicado) {
      setErroSalvar("Este nome de usuário já está em uso. Escolha outro.");
      return;
    }
    if (!isMaster && form.perfil === "master") return;
    setSalvando(true);
    setErroSalvar("");
    try {
      if (editandoId) {
        await update("usuarios", (prev) => prev.map((usuario) => usuario.id === editandoId ? { ...usuario, nome: form.nome, usuario: form.usuario, senha: form.senha, perfil: form.perfil, empresaId: targetEmpresaId } : usuario));
        setEditandoId(null);
      } else {
        await update("usuarios", (prev) => [...prev, createUsuario({
          nome: form.nome,
          usuario: form.usuario,
          senha: form.senha,
          empresaId: targetEmpresaId,
          perfil: form.perfil,
        })]);
      }
      setForm({ nome: "", usuario: "", senha: "", perfil: "usuario", empresaId: targetEmpresaId });
    } catch (error) {
      setErroSalvar(error.message);
    } finally {
      setSalvando(false);
    }
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
    if (String(usuario.id) === "usuario-admin") return false;
    if (!isMaster) return String(usuario.empresaId) === String(empresaId);
    if (empresasDisponiveis.length <= 1) return true;
    return String(usuario.empresaId) === String(empresaSelecionadaValida);
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
            <select className={inputCls} value={empresaSelecionadaValida} onChange={(e) => setEmpresaSelecionada(e.target.value)}>
              {empresasDisponiveis.map((empresa) => <option key={empresa.id} value={empresa.id}>{empresa.nome}</option>)}
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
        {erroSalvar && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erroSalvar}</div>}
        <div className="flex gap-2">
          <button disabled={salvando} onClick={add} className="rounded-xl bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60">{salvando ? "Salvando..." : editandoId ? "Salvar alterações" : "Salvar usuário"}</button>
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
                    <button onClick={() => editarUsuario(usuario)} className="text-slate-400 hover:text-emerald-700" title="Editar usuário"><Pencil size={16} /></button>
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

  const remove = (id) => {
    if (!confirmarExclusao("este funcionário")) return;
    update("funcionarios", (prev) => prev.filter((funcionario) => funcionario.id !== id));
  };

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
          <button onClick={add} className="rounded-xl bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white">{editandoId ? "Salvar alterações" : "Salvar funcionário"}</button>
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
                  <td className="px-4 py-3 text-right"><div className="flex justify-end gap-3"><button onClick={() => editarFuncionario(funcionario)} className="text-slate-400 hover:text-emerald-700"><Pencil size={16} /></button><button onClick={() => remove(funcionario.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={16} /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function RetornoStatusBadge({ status }) {
  if (status === "atrasado") return <Badge tone="red">Atrasado</Badge>;
  if (status === "hora") return <Badge tone="green">Hora de voltar</Badge>;
  return <Badge tone="amber">Próximo</Badge>;
}

function ClientesRetornoModal({ clientes, update, authUser, onClose }) {
  const [filtro, setFiltro] = useState("todos");
  const hoje = todayISO();
  const lista = clientes.filter((item) => {
    if (filtro === "contatados") return Boolean(item.ultimoContato);
    if (filtro === "nao-contatados") return !item.ultimoContato;
    return true;
  });

  const abrirWhatsApp = (item) => {
    const telefone = onlyDigits(item.cliente.telefone);
    if (!telefone) return;
    const numero = telefone.startsWith("55") && telefone.length >= 12 ? telefone : `55${telefone}`;
    const mensagem = `Olá, ${item.cliente.nome}! Tudo bem?\n\nJá faz um tempinho desde o seu último serviço de ${item.nomeServico}.\n\nSe quiser, podemos agendar um novo horário para você. 😊`;
    update("contatosRetorno", (prev) => [...prev, {
      id: uid(),
      clienteId: item.cliente.id,
      ordemServicoId: item.ordem.id,
      servicoId: item.servico.id,
      dataContato: hoje,
      tipoContato: "whatsapp",
      usuarioId: authUser?.id || null,
      createdAt: new Date().toISOString(),
    }]);
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="retorno-title">
      <Card className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="retorno-title" className="headline text-xl font-bold text-slate-900">Clientes na hora de voltar</h2>
            <p className="mt-1 text-sm text-slate-500">Clientes com retorno previsto para os próximos dias ou em atraso.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" title="Fechar"><X size={19} /></button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-3">
          {[
            ["todos", "Todos"],
            ["nao-contatados", "Não contatados"],
            ["contatados", "Contatados"],
          ].map(([valor, rotulo]) => (
            <button key={valor} type="button" onClick={() => setFiltro(valor)} className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${filtro === valor ? "bg-emerald-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{rotulo}</button>
          ))}
        </div>

        <div className="overflow-auto">
          {lista.length === 0 ? <div className="p-5"><EmptyState text="Nenhum cliente encontrado neste filtro." /></div> : (
            <table className="w-full min-w-[1050px] text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
                <tr><th className="px-4 py-3 text-left">Cliente</th><th className="px-4 py-3 text-left">Último serviço</th><th className="px-4 py-3 text-left">Último atendimento</th><th className="px-4 py-3 text-left">Retorno previsto</th><th className="px-4 py-3 text-left">Dias desde atendimento</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">WhatsApp</th><th className="px-4 py-3 text-right">Ações</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lista.map((item) => {
                  const semTelefone = !onlyDigits(item.cliente.telefone);
                  return (
                    <tr key={item.cliente.id} className="align-top">
                      <td className="px-4 py-3 font-medium text-slate-900">{item.cliente.nome}</td>
                      <td className="px-4 py-3 text-slate-600">{item.nomeServico}</td>
                      <td className="px-4 py-3 text-slate-600">{fmtDate(item.ultimoAtendimento)}</td>
                      <td className="px-4 py-3 text-slate-600">{fmtDate(item.retornoPrevisto)}</td>
                      <td className="px-4 py-3 text-slate-600">{item.diasDesdeUltimoAtendimento} dias</td>
                      <td className="px-4 py-3"><RetornoStatusBadge status={item.status} />{item.diasAtraso > 0 && <div className="mt-1 text-xs text-red-600">{item.diasAtraso} dias de atraso</div>}</td>
                      <td className="px-4 py-3 text-slate-600">{item.cliente.telefone || "-"}<div className="mt-1 text-xs text-slate-400">{item.ultimoContato ? (item.ultimoContato === hoje ? "Contatado hoje" : `Último contato: ${fmtDate(item.ultimoContato)}`) : "Ainda não contatado"}</div></td>
                      <td className="px-4 py-3 text-right"><button type="button" disabled={semTelefone} title={semTelefone ? "Cliente sem WhatsApp cadastrado" : "Abrir conversa no WhatsApp"} onClick={() => abrirWhatsApp(item)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"><MessageCircle size={15} /> WhatsApp</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}

// ---------- Dashboard ----------
function Dashboard({ db, stats, update, authUser }) {
  const [retornosAbertos, setRetornosAbertos] = useState(false);
  const retornos = useMemo(() => clientesParaRetorno(db), [db]);
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

      <Card className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-700 to-orange-700 text-white shadow-lg shadow-slate-200"><MessageCircle size={19} /></div>
            <div>
              <h2 className="font-semibold text-slate-800">Clientes na hora de voltar</h2>
              <p className="mt-0.5 text-sm text-slate-500">{retornos.length} {retornos.length === 1 ? "cliente pode estar pronto" : "clientes podem estar prontos"} para retornar</p>
            </div>
          </div>
          <button type="button" onClick={() => setRetornosAbertos(true)} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900"><ExternalLink size={16} /> Ver clientes</button>
        </div>
      </Card>

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
      {retornosAbertos && <ClientesRetornoModal clientes={retornos} update={update} authUser={authUser} onClose={() => setRetornosAbertos(false)} />}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }) {
  const tones = {
    cyan: "from-orange-700 to-emerald-800",
    amber: "from-amber-400 to-orange-700",
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

function OrcamentoPrintModal({ orcamento, empresa = {}, cliente = {}, onClose }) {
  if (!orcamento) return null;
  const clienteCompleto = { ...(orcamento.clienteSnapshot || {}), ...(cliente || {}) };
  const enderecoEmpresa = enderecoCompleto(empresa);
  const enderecoCliente = enderecoCompleto(clienteCompleto);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 sm:p-8">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .orcamento-print-area, .orcamento-print-area * { visibility: visible !important; }
          .orcamento-print-area { position: absolute !important; inset: 0 !important; width: 210mm !important; min-height: 297mm !important; max-width: none !important; padding: 15mm !important; box-sizing: border-box !important; box-shadow: none !important; border: 0 !important; }
          .orcamento-print-area tr, .orcamento-print-area section { break-inside: avoid; page-break-inside: avoid; }
          .orcamento-print-actions { display: none !important; }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>
      <div className="my-auto w-full max-w-[210mm]">
        <div className="orcamento-print-actions mb-3 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow">Fechar</button>
          <button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white shadow">
            <Printer size={17} /> Imprimir / Salvar PDF
          </button>
        </div>
        <article className="orcamento-print-area mx-auto min-h-[297mm] w-[210mm] max-w-full bg-white p-6 text-sm text-slate-800 shadow-2xl sm:p-[15mm]">
          <header className="flex justify-between gap-6 border-b-2 border-slate-800 pb-5">
            <div>
              <h1 className="text-2xl font-bold">{empresa.nome || "Empresa"}</h1>
              {empresa.razaoSocial && <div>{empresa.razaoSocial}</div>}
              {empresa.cnpj && <div>CNPJ: {empresa.cnpj}</div>}
              {enderecoEmpresa && <div className="text-slate-500">{enderecoEmpresa}</div>}
              {(empresa.telefone || empresa.email) && <div className="text-slate-500">{[empresa.telefone, empresa.email].filter(Boolean).join(" · ")}</div>}
            </div>
            <div className="text-right">
              <h2 className="text-xl font-bold">ORÇAMENTO</h2>
              <div>Nº {orcamento.numero || "Rascunho"}</div>
              <div className="text-slate-500">{fmtDate(orcamento.data || todayISO())}</div>
            </div>
          </header>

          <section className="mt-5">
            <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Cliente</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div><strong>Nome:</strong> {orcamento.clienteNome || clienteCompleto.nome || "-"}</div>
              <div><strong>{rotuloDocumentoCliente(clienteCompleto)}:</strong> {clienteCompleto.cpfCnpj || "-"}</div>
              <div className="sm:col-span-2"><strong>Endereço:</strong> {enderecoCliente || "-"}</div>
            </div>
          </section>

          <section className="mt-5">
            <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Itens do orçamento</h3>
            <table className="w-full border-collapse">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-2 text-left">Descrição</th><th className="p-2 text-center">Qtd.</th><th className="p-2 text-right">Valor unitário</th><th className="p-2 text-right">Total</th></tr></thead>
              <tbody>{(orcamento.itens || []).map((item, index) => <tr key={item.uidLine || item.id || index} className="border-b border-slate-200"><td className="p-2">{item.descricao || item.nome}</td><td className="p-2 text-center">{item.qtd}</td><td className="p-2 text-right">{brl(item.precoUnit)}</td><td className="p-2 text-right">{brl(item.subtotal ?? Number(item.precoUnit || 0) * Number(item.qtd || 1))}</td></tr>)}</tbody>
            </table>
            <div className="mt-4 text-right text-xl font-bold">Total: {brl(orcamento.total)}</div>
          </section>
        </article>
      </div>
    </div>
  );
}

function ReciboOSModal({ ordem, empresa = {}, cliente = {}, onClose }) {
  if (!ordem) return null;
  cliente = { ...cliente, ...ordem.clienteSnapshot };
  const enderecoEmpresa = [empresa.endereco, empresa.numero, empresa.bairro, empresa.cidade, empresa.estado].filter(Boolean).join(", ");
  const enderecoCliente = [cliente.endereco, cliente.numero, cliente.bairro, cliente.cidade, cliente.estado].filter(Boolean).join(", ");
  const parcelasRecibo = ordem.parcelas?.length ? ordem.parcelas : (ordem.pagamentos || []).flatMap((pagamento) => pagamento.parcelas.map((parcela) => ({ ...parcela, formaPagamento: pagamento.formaPagamento, tipoPagamento: pagamento.tipoPagamento })));

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
          <button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white shadow">
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
              <h2 className="text-xl font-bold">PEDIDO DE VENDA</h2>
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
            </div>
          </section>

          <section className="mt-5">
            <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Itens do pedido</h3>
            <table className="w-full border-collapse">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-2 text-left">Cód.</th><th className="p-2 text-left">Descrição</th><th className="p-2 text-center">Qtd.</th><th className="p-2 text-right">Unitário</th><th className="p-2 text-right">Desconto</th><th className="p-2 text-right">Total</th></tr></thead>
              <tbody>{(ordem.itens || []).map((item, index) => <tr key={item.uidLine || index} className="border-b border-slate-200"><td className="p-2">{item.codigo || "-"}</td><td className="p-2">{item.descricao || item.nome}</td><td className="p-2 text-center">{item.qtd}</td><td className="p-2 text-right">{brl(item.precoUnit)}</td><td className="p-2 text-right">{brl(item.desconto)}</td><td className="p-2 text-right">{brl(item.subtotal ?? Number(item.precoUnit || 0) * Number(item.qtd || 1) - Number(item.desconto || 0))}</td></tr>)}</tbody>
            </table>
            {Number(ordem.desconto || 0) > 0 && <div className="mt-4 text-right text-sm text-slate-500">Subtotal: {brl(ordem.subtotal || Number(ordem.total) + Number(ordem.desconto))}<br />Desconto: - {brl(ordem.desconto)}</div>}
            <div className="mt-4 text-right text-xl font-bold">Total: {brl(ordem.total)}</div>
          </section>

          {ordem.observacao && <section className="mt-5"><h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Observações</h3><p className="whitespace-pre-wrap">{ordem.observacao}</p></section>}
          <section className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div><strong>Pagamento:</strong> {ordem.formaPagamento || "-"}</div>
            <div><strong>Status financeiro:</strong> {ordem.statusPagamento || "-"}</div>
            <div><strong>Valor pago:</strong> {brl(ordem.valorPago || 0)}</div>
          </section>
          {parcelasRecibo.length > 0 && <table className="mt-4 w-full text-xs"><thead className="bg-slate-50 text-left text-slate-500"><tr><th className="p-2">Modalidade</th><th className="p-2">Condição</th><th className="p-2">Forma</th><th className="p-2">Vencimento</th><th className="p-2 text-right">Valor</th></tr></thead><tbody>{parcelasRecibo.map((parcela) => <tr key={parcela.id}><td className="p-2">{parcela.tipoPagamento === "avista" ? "À vista" : "A prazo"}</td><td className="p-2">{parcela.numeroParcela}/{parcela.totalParcelas}</td><td className="p-2">{parcela.formaPagamento || ordem.formaPagamento}</td><td className="p-2">{fmtDate(parcela.dataVencimento)}</td><td className="p-2 text-right">{brl(parcela.valor)}</td></tr>)}</tbody></table>}
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
          <button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white shadow"><Printer size={17} /> Imprimir / Salvar PDF</button>
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

function BaixaFinanceiraModal({ titulo, referencia, baixa, setBaixa, onConfirmar, onClose }) {
  if (!baixa?.id) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-lg bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="baixa-modal-title">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div><h2 id="baixa-modal-title" className="text-lg font-bold text-slate-900">{titulo}</h2>{referencia && <p className="mt-1 text-sm text-slate-500">{referencia}</p>}</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" title="Fechar" aria-label="Fechar"><X size={20} /></button>
        </header>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          <Field label="Valor da baixa"><input autoFocus type="number" min="0.01" step="0.01" className={inputCls} value={baixa.valor} onChange={(e) => setBaixa((prev) => ({ ...prev, valor: e.target.value }))} /></Field>
          <Field label="Data da baixa"><input type="date" className={inputCls} value={baixa.data} onChange={(e) => setBaixa((prev) => ({ ...prev, data: e.target.value }))} /></Field>
          <div className="sm:col-span-2"><Field label="Forma de pagamento"><select className={inputCls} value={baixa.formaPagamento} onChange={(e) => setBaixa((prev) => ({ ...prev, formaPagamento: e.target.value }))}><option>Dinheiro</option><option>Pix</option><option>Cartão de Débito</option><option>Cartão de Crédito</option><option>Carteira</option></select></Field></div>
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button onClick={onConfirmar} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">Confirmar baixa</button>
        </footer>
      </div>
    </div>
  );
}

// ---------- Orçamentos ----------
function OrcamentosWorkspace({ db, update, empresa, onAbrirPedido }) {
  const [clienteId, setClienteId] = useState("");
  const [itens, setItens] = useState([]);
  const [observacao, setObservacao] = useState("");
  const operacaoEmCurso = useRef(false);
  const novoOrcamentoId = useRef(uid());
  const [orcamentoAtual, setOrcamentoAtual] = useState(null);
  const [orcamentoParaImpressao, setOrcamentoParaImpressao] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");

  const clienteSelecionado = (db.clientes || []).find((cliente) => String(cliente.id) === String(clienteId));
  const numeroSeguinte = `ORC-${String(Math.max(0, ...(db.orcamentos || []).map((item) => Number(String(item.numero || "").replace(/\D/g, "")) || 0)) + 1).padStart(4, "0")}`;
  const orcamentos = [...(db.orcamentos || [])].sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")));
  const registroAtual = (db.orcamentos || []).find((item) => String(item.id) === String(orcamentoAtual?.id)) || orcamentoAtual;
  const convertido = Boolean(registroAtual?.pedidoId);

  const resetarFormulario = () => {
    setClienteId("");
    setItens([]);
    setOrcamentoAtual(null);
    setObservacao("");
    novoOrcamentoId.current = uid();
    setMensagem("");
  };

  const carregarOrcamento = (orcamento) => {
    setClienteId(orcamento.clienteId || "");
    setItens((orcamento.itens || []).map((item) => ({
      ...item,
      uidLine: item.uidLine || uid(),
      descricao: item.descricao || item.nome || "",
      qtd: Number(item.qtd ?? 1),
      precoUnit: Number(item.precoUnit || 0),
      subtotal: Number(item.subtotal ?? Number(item.precoUnit || 0) * Number(item.qtd || 1)),
    })));
    setOrcamentoAtual(orcamento);
    setObservacao(orcamento.observacao || "");
    setMensagem("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const montarOrcamento = () => {
    if (!clienteSelecionado) {
      window.alert("Selecione o cliente do orçamento.");
      return null;
    }
    const itensValidos = filtrarItensValidos(itens).map((item) => calcularItem({ ...item, descricao: String(item.descricao || item.nome || "").trim(), nome: item.nome || String(item.descricao || item.nome || "").trim() }));
    if (!itensValidos.length) {
      window.alert("Preencha os itens com descrição, quantidade maior que zero e valor unitário válido.");
      return null;
    }
    const resumo = somarItens(itensValidos);
    const clienteSnapshot = Object.fromEntries(["nome", "tipoPessoa", "cpfCnpj", "dataNascimento", "telefone", "email", "cep", "endereco", "numero", "bairro", "cidade", "estado"].map((campo) => [campo, clienteSelecionado[campo] || ""]));
    return {
      ...registroAtual,
      id: registroAtual?.id || novoOrcamentoId.current,
      numero: orcamentoAtual?.numero || numeroSeguinte,
      data: orcamentoAtual?.data || todayISO(),
      clienteId: clienteSelecionado.id,
      clienteNome: clienteSelecionado.nome || "Cliente",
      clienteSnapshot,
      itens: itensValidos,
      subtotal: resumo.subtotal,
      total: resumo.total,
      observacao: observacao.trim(),
      status: orcamentoAtual?.status || "aberto",
      pedidoId: orcamentoAtual?.pedidoId || null,
      convertidoEm: orcamentoAtual?.convertidoEm || null,
    };
  };

  const salvarOrcamento = async () => {
    if (convertido) {
      window.alert("Este orçamento já foi convertido em pedido e não pode mais ser alterado.");
      return;
    }
    const orcamento = montarOrcamento();
    if (!orcamento) return;
    setSalvando(true);
    try {
      await update("orcamentos", (anteriores) => {
        const existe = anteriores.some((item) => String(item.id) === String(orcamento.id));
        return existe ? anteriores.map((item) => String(item.id) === String(orcamento.id) ? orcamento : item) : [...anteriores, orcamento];
      });
      setOrcamentoAtual(orcamento);
      setMensagem(`Orçamento ${orcamento.numero} salvo com sucesso.`);
    } catch (error) {
      window.alert(`Não foi possível salvar o orçamento: ${error.message}`);
    } finally {
      setSalvando(false);
    }
  };

  const excluirOrcamento = async (orcamento) => {
    if (orcamento.pedidoId) {
      window.alert("Este orçamento já foi convertido em pedido e não pode ser excluído.");
      return;
    }
    if (!confirmarExclusao(`o orçamento ${orcamento.numero || ""}`.trim())) return;
    try {
      await update("orcamentos", (anteriores) => anteriores.filter((item) => String(item.id) !== String(orcamento.id)));
      if (String(orcamentoAtual?.id) === String(orcamento.id)) resetarFormulario();
      else setMensagem(`Orçamento ${orcamento.numero} excluído.`);
    } catch (error) {
      window.alert(`Não foi possível excluir o orçamento: ${error.message}`);
    }
  };

  const imprimirOrcamento = (registro = null) => {
    const orcamento = registro || montarOrcamento();
    if (orcamento) setOrcamentoParaImpressao(orcamento);
  };

  const converterEmPedido = async (registro = null) => {
    const orcamento = registro || montarOrcamento();
    if (!orcamento) return;
    if (orcamento.pedidoId) {
      const pedidoExistente = (db.ordens || []).find((item) => String(item.id) === String(orcamento.pedidoId));
      if (pedidoExistente) onAbrirPedido(pedidoExistente);
      else window.alert("O pedido vinculado a este orçamento não foi encontrado.");
      return;
    }
    await converterOrcamentoEmPedido(orcamento);
  };

  const converterOrcamentoEmPedido = async (orcamento) => {
    const pedidoId = uid();
    const numeroPedido = String(Math.max(0, ...(db.ordens || [])
      .filter((item) => !item.lancamentoManual)
      .map((item) => Number(String(item.numero || "").replace(/\D/g, "")) || 0)) + 1).padStart(4, "0");
    const pedido = {
      id: pedidoId,
      numero: numeroPedido,
      data: todayISO(),
      clienteId: orcamento.clienteId,
      clienteNome: orcamento.clienteNome,
      itens: (orcamento.itens || []).map((item) => ({ ...item, uidLine: item.uidLine || uid() })),
      subtotal: Number(orcamento.subtotal || orcamento.total || 0),
      desconto: 0,
      total: Number(orcamento.total || 0),
      statusOS: "pendente",
      formaPagamento: "Dinheiro",
      statusPagamento: "pendente",
      valorPago: 0,
      dataVencimento: null,
      parcelas: null,
      origemOrcamentoId: orcamento.id,
    };
    const orcamentoConvertido = { ...orcamento, status: "convertido", pedidoId, convertidoEm: todayISO() };
    try {
      await update("orcamentos", (anteriores) => {
        const existe = anteriores.some((item) => String(item.id) === String(orcamento.id));
        return existe
          ? anteriores.map((item) => String(item.id) === String(orcamento.id) ? orcamentoConvertido : item)
          : [...anteriores, orcamentoConvertido];
      });
      await update("ordens", (anteriores) => [...anteriores, pedido]);
      onAbrirPedido(pedido);
    } catch (error) {
      window.alert(`Não foi possível converter o orçamento em pedido: ${error.message}`);
    }
  };

  const clienteImpressao = orcamentoParaImpressao
    ? (db.clientes || []).find((cliente) => String(cliente.id) === String(orcamentoParaImpressao.clienteId)) || orcamentoParaImpressao.clienteSnapshot || {}
    : {};

  return (
    <div className="space-y-6">
      {orcamentoParaImpressao && <OrcamentoPrintModal orcamento={orcamentoParaImpressao} empresa={empresa} cliente={clienteImpressao} onClose={() => setOrcamentoParaImpressao(null)} />}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="headline text-2xl font-bold text-slate-900">Orçamentos</h1>
          <p className="mt-1 text-sm text-slate-500">Selecione o cliente, inclua os itens e converta em pedido quando aprovado.</p>
        </div>
        <button type="button" onClick={resetarFormulario} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <FilePlus2 size={16} /> Novo orçamento
        </button>
      </header>

      <div className="space-y-5">
        {mensagem && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{mensagem}</div>}
        {convertido && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Este orçamento já foi convertido em pedido. Use o botão abaixo para abrir o pedido.</div>}
        <fieldset disabled={salvando || convertido} className="min-w-0 space-y-5">
          <ClienteDocumento db={db} clienteId={clienteId} setClienteId={setClienteId} />
          <ItensDocumento db={db} itens={itens} setItens={setItens} titulo="Itens do orçamento" comDesconto={false} />
          <ObservacoesDocumento tipo="orçamento" observacao={observacao} setObservacao={setObservacao} />
        </fieldset>
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" onClick={salvarOrcamento} disabled={salvando || convertido || !clienteId || !filtrarItensValidos(itens).length} className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"><CheckCircle2 size={16} /> {salvando ? "Salvando..." : "Salvar orçamento"}</button>
          <button type="button" onClick={() => converterEmPedido()} disabled={!clienteId || !filtrarItensValidos(itens).length} className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><ExternalLink size={16} /> {convertido ? "Abrir pedido" : "Converter para pedido"}</button>
          <button type="button" onClick={() => imprimirOrcamento()} disabled={!clienteId || !filtrarItensValidos(itens).length} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"><Printer size={16} /> Imprimir</button>
          {orcamentoAtual && !convertido && <button type="button" onClick={() => excluirOrcamento(orcamentoAtual)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50"><Trash2 size={16} /> Excluir orçamento</button>}
        </div>

        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-semibold text-slate-800">Orçamentos salvos</h2><p className="mt-0.5 text-xs text-slate-500">{orcamentos.length} orçamento(s) registrado(s).</p></div></div>
          {orcamentos.length === 0 ? (
            <EmptyState text="Nenhum orçamento salvo ainda." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Número</th>
                    <th className="px-4 py-3 text-left">Data</th>
                    <th className="px-4 py-3 text-left">Cliente</th>
                    <th className="px-4 py-3 text-left">CNPJ/CPF</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orcamentos.map((orcamento) => {
                    const cliente = (db.clientes || []).find((item) => String(item.id) === String(orcamento.clienteId)) || orcamento.clienteSnapshot || {};
                    return (
                      <tr key={orcamento.id}>
                        <td className="px-4 py-3 font-medium">{orcamento.numero}</td>
                        <td className="px-4 py-3 text-slate-500">{fmtDate(orcamento.data)}</td>
                        <td className="px-4 py-3">{orcamento.clienteNome}</td>
                        <td className="px-4 py-3 text-slate-500">{cliente.cpfCnpj || "-"}</td>
                        <td className="px-4 py-3 text-right font-semibold">{brl(orcamento.total)}</td>
                        <td className="px-4 py-3">{orcamento.pedidoId ? <Badge tone="green">Convertido</Badge> : <Badge tone="amber">{orcamento.status === "pendente" ? "Pendente" : "Aberto"}</Badge>}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-3">
                            <button type="button" onClick={() => carregarOrcamento(orcamento)} className="text-slate-400 hover:text-emerald-700" title="Abrir orçamento"><Pencil size={16} /></button>
                            <button type="button" onClick={() => imprimirOrcamento(orcamento)} className="text-slate-400 hover:text-orange-700" title="Imprimir orçamento"><Printer size={16} /></button>
                            <button type="button" onClick={() => converterEmPedido(orcamento)} className="text-slate-400 hover:text-orange-700" title={orcamento.pedidoId ? "Abrir pedido" : "Converter para pedido"}><ExternalLink size={16} /></button>
                            {!orcamento.pedidoId && <button type="button" onClick={() => excluirOrcamento(orcamento)} className="text-slate-400 hover:text-red-600" title="Excluir orçamento"><Trash2 size={16} /></button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ---------- Pedidos ----------
function OrdensWorkspace({ db, update, empresa, ordemEmEdicao, setOrdemEmEdicao, podeEditarValor }) {
  const [formKey, setFormKey] = useState(0);
  const ordens = (db.ordens || []).filter((ordem) => !ordem.lancamentoManual);
  const pendentes = ordens.filter((ordem) => ["rascunho", "pendente", "estornado"].includes(ordem.statusOS)).length;

  const abrirNova = () => {
    setOrdemEmEdicao(null);
    setFormKey((value) => value + 1);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="headline text-2xl font-bold text-slate-900">Pedidos</h1>
          <p className="mt-1 text-sm text-slate-500">
            {ordemEmEdicao ? `Continuando o pedido #${ordemEmEdicao.numero}.` : pendentes ? `${pendentes} pedido(s) em andamento.` : "Preencha os dados para registrar um novo pedido."}
          </p>
        </div>
        <button onClick={abrirNova} className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-orange-700 to-emerald-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm">
          <FilePlus2 size={16} /> Novo pedido
        </button>
      </header>

      <div className="block">
        <PedidoVenda
          ReciboModal={ReciboOSModal}
          key={formKey}
          db={db}
          update={update}
          empresa={empresa}
          ordemEmEdicao={ordemEmEdicao}
          onFinalizarEdicao={() => setOrdemEmEdicao(null)}
          onConcluirFechado={() => setOrdemEmEdicao(null)}
          onSelecionarPedido={(pedido) => {
            setOrdemEmEdicao(pedido);
            setFormKey((value) => value + 1);
          }}
          podeEditarValor={podeEditarValor}
          embedded
        />
      </div>
    </div>
  );
}

// ---------- Ordens ----------
function Ordens({ db, update, empresa, onEditarNaOS, embedded = false }) {
  const [recibo, setRecibo] = useState(null);
  const [filtros, setFiltros] = useState({ busca: "", dataInicial: "", dataFinal: "" });
  const excluir = (id) => {
    const ordem = db.ordens.find((o) => o.id === id);
    if (!ordem) return;
    if (!confirmarExclusao(`a OS #${ordem.numero}`)) return;
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
      pagamentos: Array.isArray(item.pagamentos) ? item.pagamentos.map((pagamento) => ({ ...pagamento, parcelas: pagamento.parcelas.map((parcela) => ({ ...parcela, status: "pendente", valorPago: 0, dataBaixa: null, formaPagamentoBaixa: null })) })) : undefined,
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
      {!embedded && <header>
        <h1 className="headline text-2xl font-bold text-slate-900">Pedidos</h1>
        <p className="text-slate-500 text-sm mt-1">{lista.length} pedido(s) encontrado(s).</p>
      </header>}

      <Card className="p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px_180px_auto] md:items-end">
          <Field label="Cliente, pedido, produto ou serviço">
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

      <Card className="p-0 overflow-hidden">
        {lista.length === 0 ? (
          <EmptyState text="Nenhum pedido encontrado para os filtros informados." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Nº</th>
                <th className="text-left px-4 py-3">Data</th>
                <th className="text-left px-4 py-3">Cliente</th>
                <th className="text-left px-4 py-3">Itens</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="text-left px-4 py-3">Pedido</th>
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
                  <td className="px-4 py-3 text-slate-500">{o.itens.map((i) => i.descricao || i.nome).join(", ")}</td>
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
                      <button onClick={() => imprimir(o)} className="text-slate-400 hover:text-orange-700" title="Imprimir ou salvar recibo em PDF">
                        <Printer size={17} />
                      </button>
                      {["rascunho", "pendente", "estornado"].includes(o.statusOS) && <button onClick={() => onEditarNaOS(o)} className="text-slate-400 hover:text-emerald-700" title="Continuar venda / editar pedido"><Pencil size={16} /></button>}
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
function Clientes({ db, update, empresaId, empresaSegmento = "lava-jato" }) {
  const clienteFormInicial = {
    tipoPessoa: "fisica", nome: "", cpfCnpj: "", dataNascimento: "", email: "", telefone: "",
    cep: "", endereco: "", numero: "", bairro: "", cidade: "", estado: "",
    tipoVeiculo: "", marca: "", veiculo: "", cor: "", ano: "", placa: "", frota: "", motorista: "",
    veiculos: [],
  };
  const [form, setForm] = useState(clienteFormInicial);
  const [busca, setBusca] = useState("");
  const [editandoId, setEditandoId] = useState(null);
  const [mensagemSucesso, setMensagemSucesso] = useState("");
  const formularioRef = useRef(null);
  const mensagemTimerRef = useRef(null);

  useEffect(() => () => clearTimeout(mensagemTimerRef.current), []);

  const mostrarSucesso = (mensagem) => {
    clearTimeout(mensagemTimerRef.current);
    setMensagemSucesso(mensagem);
    mensagemTimerRef.current = setTimeout(() => setMensagemSucesso(""), 3500);
  };

  const salvar = async () => {
    if (!form.nome.trim()) {
      alert("Informe o nome do cliente.");
      return;
    }
    try {
      if (!empresaId) throw new Error("Não foi possível identificar a empresa deste cliente.");
      const temVeiculoPendente = [form.tipoVeiculo, form.marca, form.veiculo, form.cor, form.ano, form.placa, form.frota, form.motorista].some(Boolean);
      const veiculos = temVeiculoPendente
        ? [...form.veiculos, { id: uid(), tipoVeiculo: form.tipoVeiculo, marca: form.marca, veiculo: form.veiculo, cor: form.cor, ano: form.ano, placa: form.placa, frota: form.frota, motorista: form.motorista }]
        : form.veiculos;
      const primeiroVeiculo = veiculos[0] || {};
      const { id: _veiculoId, ...dadosPrimeiroVeiculo } = primeiroVeiculo;
      const dadosCliente = { ...form, ...dadosPrimeiroVeiculo, veiculos };
      if (editandoId) {
        await update("clientes", (prev) => prev.map((cliente) => cliente.id === editandoId ? { ...cliente, ...dadosCliente } : cliente));
        setEditandoId(null);
        setForm(clienteFormInicial);
        mostrarSucesso("Cliente atualizado com sucesso!");
        return;
      }
      const proximoCodigo = String(Math.max(0, ...db.clientes.map((cliente) => Number(cliente.codigo) || 0)) + 1).padStart(4, "0");
      const cliente = await createCliente({ codigo: proximoCodigo, ...dadosCliente, empresaId });
      update("clientes", (prev) => [...prev, cliente]);
      setForm(clienteFormInicial);
      mostrarSucesso("Cliente cadastrado com sucesso!");
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  };
  const editar = (cliente) => {
    const dadosFormulario = Object.fromEntries(
      Object.keys(clienteFormInicial).map((campo) => [campo, cliente[campo] ?? clienteFormInicial[campo]])
    );
    dadosFormulario.veiculos = veiculosDoCliente(cliente);
    ["tipoVeiculo", "marca", "veiculo", "cor", "ano", "placa", "frota", "motorista"].forEach((campo) => { dadosFormulario[campo] = ""; });
    setEditandoId(cliente.id);
    setForm(dadosFormulario);
    formularioRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const cancelarEdicao = () => {
    setEditandoId(null);
    setForm(clienteFormInicial);
  };
  const mostraCamposVeiculo = (empresaSegmento || "lava-jato").toLowerCase() === "lava-jato";
  const adicionarVeiculo = () => {
    if (![form.tipoVeiculo, form.marca, form.veiculo, form.cor, form.ano, form.placa, form.frota, form.motorista].some(Boolean)) return;
    const novo = { id: uid(), tipoVeiculo: form.tipoVeiculo, marca: form.marca, veiculo: form.veiculo, cor: form.cor, ano: form.ano, placa: form.placa, frota: form.frota, motorista: form.motorista };
    setForm((anterior) => ({ ...anterior, veiculos: [...anterior.veiculos, novo], tipoVeiculo: "", marca: "", veiculo: "", cor: "", ano: "", placa: "", frota: "", motorista: "" }));
  };
  const remove = (id) => {
    if (!confirmarExclusao("este cliente")) return;
    update("clientes", (prev) => prev.filter((c) => c.id !== id));
  };

  const lista = db.clientes.filter((c) => {
    const termo = busca.toLowerCase();
    return c.nome.toLowerCase().includes(termo)
      || (c.cpfCnpj || "").toLowerCase().includes(termo)
      || veiculosDoCliente(c).some((veiculo) => (veiculo.placa || "").toLowerCase().includes(termo) || (veiculo.frota || "").toLowerCase().includes(termo) || (veiculo.motorista || "").toLowerCase().includes(termo));
  });

  return (
    <div className="space-y-6">
      {mensagemSucesso && (
        <div role="status" className="fixed right-4 top-4 z-[100] flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 shadow-lg">
          <CheckCircle2 size={19} />
          {mensagemSucesso}
        </div>
      )}
      <header>
        <h1 className="headline text-2xl font-bold text-slate-900">Clientes</h1>
        <p className="text-slate-500 text-sm mt-1">Cadastre clientes e seus veículos.</p>
      </header>

      <div ref={formularioRef}>
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
                <Field label="Tipo de veículo">
                  <select className={inputCls} value={form.tipoVeiculo} onChange={(e) => setForm({ ...form, tipoVeiculo: e.target.value })}>
                    <option value="">Selecionar tipo</option>
                    <option value="carro">Carro</option>
                    <option value="moto">Moto</option>
                    <option value="caminhao">Caminhão</option>
                    <option value="van">Van</option>
                    <option value="utilitario">Utilitário</option>
                    <option value="outro">Outro</option>
                  </select>
                </Field>
                <Field label="Marca"><input className={inputCls} placeholder="Ex.: Toyota" value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} /></Field>
                <Field label="Modelo"><input className={inputCls} placeholder="Ex.: Corolla" value={form.veiculo} onChange={(e) => setForm({ ...form, veiculo: e.target.value })} /></Field>
                <Field label="Cor"><input className={inputCls} placeholder="Ex.: Prata" value={form.cor} onChange={(e) => setForm({ ...form, cor: e.target.value })} /></Field>
                <Field label="Ano"><input inputMode="numeric" maxLength={4} className={inputCls} placeholder="Ex.: 2024" value={form.ano} onChange={(e) => setForm({ ...form, ano: e.target.value.replace(/\D/g, "").slice(0, 4) })} /></Field>
                <Field label="Placa"><input maxLength={8} className={inputCls} placeholder="Ex.: ABC1D23" value={form.placa} onChange={(e) => setForm({ ...form, placa: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7) })} /></Field>
                <Field label="Frota"><input className={inputCls} placeholder="Ex.: 001" value={form.frota} onChange={(e) => setForm({ ...form, frota: e.target.value })} /></Field>
                <Field label="Motorista/Responsável"><input className={inputCls} placeholder="Quem costuma levar o veículo?" value={form.motorista} onChange={(e) => setForm({ ...form, motorista: e.target.value })} /></Field>
              </div>
              <button type="button" onClick={adicionarVeiculo} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"><Plus size={15} /> Adicionar veículo à lista</button>
              {form.veiculos.length > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="text-xs font-semibold uppercase text-slate-500">Veículos cadastrados ({form.veiculos.length})</div>
                  {form.veiculos.map((veiculo, index) => (
                    <div key={veiculo.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                      <span><strong>{index + 1}.</strong> {[veiculo.marca, veiculo.veiculo, veiculo.placa, veiculo.frota ? `Frota ${veiculo.frota}` : ""].filter(Boolean).join(" · ") || "Veículo sem identificação"}{veiculo.motorista ? ` · ${veiculo.motorista}` : ""}</span>
                      <button type="button" onClick={() => { if (confirmarExclusao("este veículo")) setForm((anterior) => ({ ...anterior, veiculos: anterior.veiculos.filter((item) => item.id !== veiculo.id) })); }} className="ml-3 text-slate-400 hover:text-red-500" title="Remover veículo"><Trash2 size={15} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button onClick={salvar} className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800">{editandoId ? <Pencil size={16} /> : <Plus size={16} />} {editandoId ? "Salvar alterações" : "Adicionar cliente"}</button>
          {editandoId && <button type="button" onClick={cancelarEdicao} className="text-sm font-semibold text-slate-500 hover:text-slate-800">Cancelar</button>}
        </div>
      </Card>
      </div>

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
                        {veiculosDoCliente(c).length ? veiculosDoCliente(c).map((veiculo) => <div key={veiculo.id} className="mb-1 last:mb-0">{[veiculo.marca, veiculo.veiculo, veiculo.placa].filter(Boolean).join(" · ") || "Veículo sem identificação"}</div>) : "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{veiculosDoCliente(c).map((veiculo) => veiculo.motorista).filter(Boolean).join(", ") || "-"}</td>
                    </>
                  )}
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      <button type="button" onClick={() => editar(c)} className="text-slate-400 hover:text-emerald-700" title="Editar cliente"><Pencil size={16} /></button>
                      <button type="button" onClick={() => remove(c.id)} className="text-slate-400 hover:text-red-500" title="Excluir cliente"><Trash2 size={16} /></button>
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

// ---------- Serviços (catálogo) ----------
function ProdutosServicos({ db, update }) {
  const [tipo, setTipo] = useState("produto");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="headline text-2xl font-bold text-slate-900">{"Produtos e Servi\u00e7os"}</h1>
        <p className="mt-1 text-sm text-slate-500">{"Cadastre e gerencie todo o cat\u00e1logo usado nas ordens de servi\u00e7o."}</p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => setTipo("produto")} className={`rounded-2xl border p-4 text-left transition ${tipo === "produto" ? "border-emerald-700 bg-emerald-50 shadow-sm ring-1 ring-emerald-700" : "border-slate-200 bg-white hover:border-emerald-300"}`}>
          <div className="flex items-center gap-3">
            <span className={`grid h-10 w-10 place-items-center rounded-xl ${tipo === "produto" ? "bg-emerald-800 text-white" : "bg-slate-100 text-slate-500"}`}><Boxes size={20} /></span>
            <div><div className="font-semibold text-slate-900">Produto</div><div className="text-xs text-slate-500">{db.produtos.length} cadastrado(s) {"\u00b7"} controla estoque e preços</div></div>
          </div>
        </button>
        <button type="button" onClick={() => setTipo("servico")} className={`rounded-2xl border p-4 text-left transition ${tipo === "servico" ? "border-orange-700 bg-orange-50 shadow-sm ring-1 ring-orange-700" : "border-slate-200 bg-white hover:border-orange-300"}`}>
          <div className="flex items-center gap-3">
            <span className={`grid h-10 w-10 place-items-center rounded-xl ${tipo === "servico" ? "bg-orange-700 text-white" : "bg-slate-100 text-slate-500"}`}><Sparkles size={20} /></span>
            <div><div className="font-semibold text-slate-900">{"Servi\u00e7o"}</div><div className="text-xs text-slate-500">{db.servicos.length} cadastrado(s) {"\u00b7"} nome e preço de venda</div></div>
          </div>
        </button>
      </div>

      <div className={tipo === "produto" ? "block" : "hidden"}><Estoque db={db} update={update} embedded /></div>
      <div className={tipo === "servico" ? "block" : "hidden"}><Servicos db={db} update={update} embedded /></div>
    </div>
  );
}

function Servicos({ db, update, embedded = false }) {
  const [form, setForm] = useState({ nome: "", preco: "", diasRetornoSugerido: "" });
  const add = () => {
    if (!form.nome.trim() || form.preco === "") return;
    update("servicos", (prev) => [...prev, {
      id: uid(),
      nome: form.nome,
      preco: Number(form.preco),
      diasRetornoSugerido: form.diasRetornoSugerido === "" ? null : Math.max(1, Number(form.diasRetornoSugerido)),
    }]);
    setForm({ nome: "", preco: "", diasRetornoSugerido: "" });
  };
  const remove = (id) => {
    if (!confirmarExclusao("este serviço")) return;
    update("servicos", (prev) => prev.filter((s) => s.id !== id));
  };
  const editarPreco = (id, preco) => update("servicos", (prev) => prev.map((s) => (s.id === id ? { ...s, preco: Number(preco) } : s)));
  const editarRetorno = (id, dias) => update("servicos", (prev) => prev.map((s) => (s.id === id ? {
    ...s,
    diasRetornoSugerido: dias === "" ? null : Math.max(1, Number(dias)),
  } : s)));

  return (
    <div className="space-y-6">
      {!embedded && <header>
        <h1 className="headline text-2xl font-bold text-slate-900">Catálogo de serviços</h1>
        <p className="text-slate-500 text-sm mt-1">Serviços oferecidos e seus preços.</p>
      </header>}

      <Card className="p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_210px]">
          <Field label="Nome do serviço"><input className={inputCls} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Field>
          <Field label="Preço"><input type="number" className={inputCls} value={form.preco} onChange={(e) => setForm({ ...form, preco: e.target.value })} /></Field>
          <Field label="Retorno sugerido (dias)"><input type="number" min="1" className={inputCls} value={form.diasRetornoSugerido} onChange={(e) => setForm({ ...form, diasRetornoSugerido: e.target.value })} placeholder="Opcional" /></Field>
        </div>
        <button onClick={add} className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-emerald-800"><Plus size={16} /> Adicionar serviço</button>
      </Card>

      <Card className="overflow-x-auto p-0">
        {db.servicos.length === 0 ? <EmptyState text="Nenhum serviço cadastrado." /> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase"><tr><th className="text-left px-4 py-3">Serviço</th><th className="text-left px-4 py-3">Preço</th><th className="text-left px-4 py-3">Retorno sugerido</th><th className="px-4 py-3"></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {db.servicos.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 font-medium">{s.nome}</td>
                  <td className="px-4 py-3">
                    <input type="number" className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-sm" value={s.preco} onChange={(e) => editarPreco(s.id, e.target.value)} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <input type="number" min="1" className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm" value={s.diasRetornoSugerido ?? ""} onChange={(e) => editarRetorno(s.id, e.target.value)} placeholder="-" />
                      <span className="text-xs text-slate-400">dias</span>
                    </div>
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
function Estoque({ db, update, embedded = false }) {
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
  const remove = (id) => {
    if (!confirmarExclusao("este produto")) return;
    update("produtos", (prev) => prev.filter((p) => p.id !== id));
  };
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
      {!embedded && <header>
        <h1 className="headline text-2xl font-bold text-slate-900">Estoque</h1>
        <p className="text-slate-500 text-sm mt-1">Produtos usados ou vendidos no sistema.</p>
      </header>}

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
        <button onClick={add} className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-emerald-800"><Plus size={16} /> Adicionar produto</button>
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
            <button onClick={salvarAcerto} className="w-full rounded-xl bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white">Salvar acerto</button>
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
  const filtrosIniciais = { cliente: "", dataConta: "", dataVencimento: "", dataPagamento: "", status: "todos" };
  const [filtrosForm, setFiltrosForm] = useState(filtrosIniciais);
  const [filtrosAplicados, setFiltrosAplicados] = useState(filtrosIniciais);
  const [pesquisaAtiva, setPesquisaAtiva] = useState(false);
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
      data: todayISO(),
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

  const pesquisarContas = (event) => {
    event?.preventDefault();
    setFiltrosAplicados({ ...filtrosForm, cliente: filtrosForm.cliente.trim() });
    setPesquisaAtiva(true);
  };

  const limparPesquisa = () => {
    setFiltrosForm(filtrosIniciais);
    setFiltrosAplicados(filtrosIniciais);
    setPesquisaAtiva(false);
  };

  const contasFiltradasBase = contasReceberFormatadas(db.ordens)
    .filter((o) => {
      const cliente = filtrosAplicados.cliente.toLowerCase();
      const statusEfetivo = o.statusPagamento !== "pago" && o.dataVencimento && o.dataVencimento < todayISO()
        ? "vencida"
        : o.statusPagamento;
      const dataPagamentoEfetiva = o.dataBaixa || (o.statusPagamento === "pago" && o.formaPagamento !== "Carteira" ? o.data : "");
      return (!cliente || (o.clienteNome || "").toLowerCase().includes(cliente))
        && (!filtrosAplicados.dataConta || o.data === filtrosAplicados.dataConta)
        && (!filtrosAplicados.dataVencimento || o.dataVencimento === filtrosAplicados.dataVencimento)
        && (!filtrosAplicados.dataPagamento || (Number(o.valorPago || 0) > 0 && dataPagamentoEfetiva === filtrosAplicados.dataPagamento))
        && (filtrosAplicados.status === "todos" || statusEfetivo === filtrosAplicados.status);
    });
  const pendentes = contasFiltradasBase
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

  const estornarBaixa = (conta) => {
    if (Number(conta.valorPago || 0) <= 0) return;
    if (!window.confirm(`Deseja estornar a baixa da conta #${conta.numero}? O valor recebido voltará a ficar pendente.`)) return;
    update("ordens", (prev) => prev.map((ordem) => {
      if (ordem.id !== conta.originalId) return ordem;
      if (!Array.isArray(ordem.parcelas) || !ordem.parcelas.length) {
        return { ...ordem, valorPago: 0, dataBaixa: null, formaPagamentoBaixa: null, statusPagamento: "pendente" };
      }
      return { ...ordem, parcelas: ordem.parcelas.map((parcela) => parcela.id === conta.id ? { ...parcela, valorPago: 0, dataBaixa: null, formaPagamentoBaixa: null, status: "pendente" } : parcela) };
    }));
  };

  const totalPendente = contasFiltradasBase.reduce((s, o) => s + Math.max(0, Number(o.valorParcela || 0) - Number(o.valorPago || 0)), 0);
  const totalPago = contasFiltradasBase.reduce((s, o) => s + Number(o.valorPago || 0), 0);
  const totalGeral = contasFiltradasBase.reduce((s, o) => s + Number(o.valorParcela || 0), 0);

  return (
    <div className="space-y-6">
      {reciboFinanceiro && <ReciboFinanceiroModal tipo="receber" conta={reciboFinanceiro} empresa={empresa} onClose={() => setReciboFinanceiro(null)} />}
      <BaixaFinanceiraModal titulo="Baixar conta a receber" referencia={baixa.id ? `Conta #${contasReceberFormatadas(db.ordens).find((conta) => conta.id === baixa.id)?.numero || ""}` : ""} baixa={baixa} setBaixa={setBaixa} onConfirmar={confirmarBaixa} onClose={() => setBaixa({ id: null, originalId: null, valor: "", data: todayISO(), formaPagamento: "Dinheiro" })} />
      <header>
        <h1 className="headline text-2xl font-bold text-slate-900">Contas a receber</h1>
        <p className="text-slate-500 text-sm mt-1">Gerado automaticamente a partir das ordens de serviço pendentes ou parciais.</p>
      </header>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
          <h2 className="font-semibold text-slate-800">Pesquisar contas</h2>
          <p className="mt-0.5 text-xs text-slate-500">Preencha um ou mais filtros e clique em Pesquisar.</p>
        </div>
        <form onSubmit={pesquisarContas} className="p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Field label="Cliente/Pagador">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input className={inputCls + " pl-9"} placeholder="Digite o nome do cliente" value={filtrosForm.cliente} onChange={(e) => setFiltrosForm((prev) => ({ ...prev, cliente: e.target.value }))} />
              </div>
            </Field>
            <Field label="Data da conta"><input type="date" className={inputCls} value={filtrosForm.dataConta} onChange={(e) => setFiltrosForm((prev) => ({ ...prev, dataConta: e.target.value }))} /></Field>
            <Field label="Data do vencimento"><input type="date" className={inputCls} value={filtrosForm.dataVencimento} onChange={(e) => setFiltrosForm((prev) => ({ ...prev, dataVencimento: e.target.value }))} /></Field>
            <Field label="Data do pagamento"><input type="date" className={inputCls} value={filtrosForm.dataPagamento} onChange={(e) => setFiltrosForm((prev) => ({ ...prev, dataPagamento: e.target.value }))} /></Field>
            <Field label="Status">
              <select className={inputCls} value={filtrosForm.status} onChange={(e) => setFiltrosForm((prev) => ({ ...prev, status: e.target.value }))}>
                <option value="todos">Todos os status</option><option value="pendente">Pendente</option><option value="parcial">Parcial</option><option value="pago">Pago</option><option value="vencida">Vencida</option>
              </select>
            </Field>
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-4">
            <button type="button" onClick={limparPesquisa} className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Limpar filtros</button>
            <button type="submit" className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"><Search size={17} /> Pesquisar</button>
          </div>
        </form>
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
          <button onClick={salvarReceber} className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800">{editandoReceber ? <Pencil size={16} /> : <Plus size={16} />} {editandoReceber ? "Salvar alterações" : "Adicionar recebimento"}</button>
          {editandoReceber && <button onClick={() => { setEditandoReceber(null); setFormReceber(receberInicial); }} className="text-sm text-slate-500">Cancelar</button>}
        </div>
      </Card>

      {false && baixa.id && (
        <Card className="p-4 bg-slate-50">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="Valor da baixa">
              <input type="number" min="0" className={inputCls} value={baixa.valor} onChange={(e) => setBaixa((prev) => ({ ...prev, valor: e.target.value }))} />
            </Field>
            <Field label="Data do pagamento">
              <input type="date" className={inputCls} value={baixa.data} onChange={(e) => setBaixa((prev) => ({ ...prev, data: e.target.value }))} />
            </Field>
            <Field label="Forma de pagamento">
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

      {!pesquisaAtiva ? <Card className="p-8"><EmptyState text="Use a pesquisa ou os filtros para localizar contas a receber." /></Card> : <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold text-slate-800">Resultados</h2>
          <span className="text-sm text-slate-500">{pendentes.length} {pendentes.length === 1 ? "conta encontrada" : "contas encontradas"}</span>
        </div>
        {pendentes.length === 0 ? <EmptyState text="Nenhuma conta a receber no momento." /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr><th className="text-left px-4 py-3">OS</th><th className="text-left px-4 py-3">Cliente</th><th className="text-left px-4 py-3">Data da conta</th><th className="text-left px-4 py-3">Vencimento</th><th className="text-right px-4 py-3">Valor da conta</th><th className="text-right px-4 py-3">Valor pendente</th><th className="text-left px-4 py-3">Pagamento</th><th className="text-left px-4 py-3">Status</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pendentes.map((o) => {
                const vencida = o.statusPagamento !== "pago"
                  && Math.max(0, Number(o.valorParcela || 0) - Number(o.valorPago || 0)) > 0
                  && o.dataVencimento
                  && o.dataVencimento < todayISO();
                return (
                  <tr key={o.id}>
                    <td className="px-4 py-3 font-medium">
                      #{o.numero}
                      {o.totalParcelas > 1 ? ` · ${o.numeroParcela}/${o.totalParcelas}` : ""}
                    </td>
                    <td className="px-4 py-3">{o.clienteNome}</td>
                    <td className="px-4 py-3 text-slate-500">{fmtDate(o.data)}</td>
                    <td className="px-4 py-3 text-slate-500">
                      <input
                        type="date"
                        className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                        value={o.dataVencimento || ""}
                        onChange={(e) => atualizarVencimento(o.id, e.target.value)}
                      />
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-700">{brl(Number(o.valorParcela ?? o.total ?? 0))}</td>
                    <td className="px-4 py-3 text-right font-semibold">{brl(Math.max(0, Number(o.valorParcela || 0) - Number(o.valorPago || 0)))}</td>
                    <td className="px-4 py-3 text-slate-500">{fmtDate(o.dataBaixa || (o.statusPagamento === "pago" && o.formaPagamento !== "Carteira" ? o.data : ""))}</td>
                    <td className="px-4 py-3">{vencida ? <Badge tone="red">Vencida</Badge> : <StatusBadge status={o.statusPagamento} />}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-3">
                        <button onClick={() => setReciboFinanceiro(o)} className="text-slate-400 hover:text-orange-700" title="Gerar recibo"><Printer size={17} /></button>
                        <button onClick={() => editarReceber(o)} className="text-slate-400 hover:text-emerald-700" title="Editar"><Pencil size={16} /></button>
                        {o.statusPagamento !== "pago" && <button onClick={() => abrirBaixa(o)} className="text-emerald-600 hover:text-emerald-700" title="Registrar baixa"><CheckCircle2 size={17} /></button>}
                        {Number(o.valorPago || 0) > 0 && <button onClick={() => estornarBaixa(o)} className="text-amber-600 hover:text-red-600" title="Estornar baixa"><RotateCcw size={17} /></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </Card>}

      {pesquisaAtiva && <div className="flex justify-end">
        <div className="flex w-full flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm sm:w-auto sm:justify-end">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Saldo do filtro</span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="text-slate-500">Total <strong className="ml-1 text-slate-700">{brl(totalGeral)}</strong></span>
            <span className="text-slate-500">Recebido <strong className="ml-1 text-emerald-600">{brl(totalPago)}</strong></span>
            <span className="text-slate-500">A receber <strong className="ml-1 text-amber-600">{brl(totalPendente)}</strong></span>
          </div>
        </div>
      </div>}
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

  const estornarBaixa = (conta) => {
    if (Number(conta.valorPago || 0) <= 0) return;
    if (!window.confirm(`Deseja estornar a baixa de "${conta.descricao}"? O valor pago voltará a ficar pendente.`)) return;
    update("contasPagar", (prev) => prev.map((item) => item.id === conta.id ? { ...item, valorPago: 0, dataPagamento: null, dataBaixa: null, formaPagamentoBaixa: null, status: "pendente" } : item));
  };

  const remove = (id) => {
    if (!confirmarExclusao("esta conta a pagar")) return;
    update("contasPagar", (prev) => prev.filter((c) => c.id !== id));
  };

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
  const pesquisaAtiva = Boolean(filtros.busca.trim() || filtros.status !== "todos" || filtros.dataInicial || filtros.dataFinal);

  return (
    <div className="space-y-6">
      {reciboFinanceiro && <ReciboFinanceiroModal tipo="pagar" conta={reciboFinanceiro} empresa={empresa} onClose={() => setReciboFinanceiro(null)} />}
      <BaixaFinanceiraModal titulo="Baixar conta a pagar" referencia={baixa.id ? db.contasPagar.find((conta) => conta.id === baixa.id)?.descricao : ""} baixa={baixa} setBaixa={setBaixa} onConfirmar={confirmarBaixa} onClose={() => setBaixa({ id: null, valor: "", data: todayISO(), formaPagamento: "Dinheiro" })} />
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

      {false && baixa.id && (
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
          <button onClick={add} className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800">{editandoId ? <Pencil size={16} /> : <Plus size={16} />} {editandoId ? "Salvar alterações" : "Adicionar conta"}</button>
          {editandoId && <button onClick={() => { setEditandoId(null); setForm({ descricao: "", categoria: "Fornecedor", valor: "", vencimento: todayISO() }); }} className="text-sm text-slate-500">Cancelar</button>}
        </div>
      </Card>

      {!pesquisaAtiva ? <Card className="p-8"><EmptyState text="Use a pesquisa ou os filtros para localizar contas a pagar." /></Card> : <Card className="p-0 overflow-hidden">
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
                        <button onClick={() => setReciboFinanceiro(c)} className="text-slate-400 hover:text-orange-700" title="Gerar recibo"><Printer size={17} /></button>
                        {c.status !== "pago" && (
                          <button onClick={() => abrirBaixa(c)} className="text-emerald-600 hover:text-emerald-700" title="Registrar baixa"><CheckCircle2 size={17} /></button>
                        )}
                        {Number(c.valorPago || 0) > 0 && <button onClick={() => estornarBaixa(c)} className="text-amber-600 hover:text-red-600" title="Estornar baixa"><RotateCcw size={17} /></button>}
                        <button onClick={() => editarConta(c)} className="text-slate-400 hover:text-emerald-700" title="Editar"><Pencil size={16} /></button>
                        <button onClick={() => remove(c.id)} className="text-slate-400 hover:text-red-500" title="Excluir"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>}

      {pesquisaAtiva && <div className="flex justify-end">
        <div className="flex w-full flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm sm:w-auto sm:justify-end">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Saldo do filtro</span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="text-slate-500">Total <strong className="ml-1 text-slate-700">{brl(totalGeral)}</strong></span>
            <span className="text-slate-500">Pago <strong className="ml-1 text-emerald-600">{brl(totalPago)}</strong></span>
            <span className="text-slate-500">A pagar <strong className="ml-1 text-red-600">{brl(totalPendente)}</strong></span>
          </div>
        </div>
      </div>}
    </div>
  );
}
