import { useState } from "react";
import { Clock3, Plus } from "lucide-react";
import { ETAPAS_PATIO, etapaPatio, linkWhatsappPatio, ordensAtivasPatio, resumoPatio } from "../lib/patio";

const brl = (valor) => Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const clsEtapa = {
  aguardando: "bg-slate-200 text-slate-700",
  lavagem: "bg-cyan-100 text-cyan-800",
  acabamento: "bg-orange-100 text-orange-800",
  pronto: "bg-green-100 text-green-800",
};

function formatarDuracao(minutos) {
  if (minutos === null) return "—";
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const restante = minutos % 60;
  return restante ? `${horas} h ${restante} min` : `${horas} h`;
}

function formatarEntrada(ordem) {
  if (!ordem.patioEntradaEm) return ordem.data ? `Entrada ${ordem.data.split("-").reverse().join("/")}` : "Entrada sem horário";
  const data = new Date(ordem.patioEntradaEm);
  return Number.isNaN(data.getTime())
    ? "Entrada sem horário"
    : `Entrada ${data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

function veiculoDaOrdem(ordem, cliente) {
  const veiculos = Array.isArray(cliente?.veiculos) ? cliente.veiculos : [];
  const veiculo = ordem.veiculoSnapshot
    || veiculos.find((item) => String(item.id) === String(ordem.veiculoId))
    || (veiculos.length === 1 ? veiculos[0] : cliente);
  return {
    placa: veiculo?.placa || "",
    descricao: veiculos.length > 1 && !ordem.veiculoSnapshot && !ordem.veiculoId
      ? `${veiculos.length} veículos cadastrados`
      : [veiculo?.marca, veiculo?.veiculo || veiculo?.tipoVeiculo, veiculo?.cor].filter(Boolean).join(" · "),
  };
}

function Indicador({ titulo, valor, detalhe }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="text-sm text-slate-600">{titulo}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{valor}</p>
      <p className="mt-1 text-xs text-slate-500">{detalhe}</p>
    </div>
  );
}

export default function PainelPatio({ db, hoje, onNovaOS, onAbrirOS, update }) {
  const [arrastandoId, setArrastandoId] = useState("");
  const [etapaSobre, setEtapaSobre] = useState("");
  const ordens = ordensAtivasPatio(db.ordens || []);
  const resumo = resumoPatio(db.ordens || [], hoje);

  const moverOrdem = async (id, etapa) => {
    const ordem = ordens.find((item) => String(item.id) === String(id));
    if (!ordem || etapaPatio(ordem) === etapa) return;
    const agora = new Date().toISOString();
    const cliente = (db.clientes || []).find((item) => String(item.id) === String(ordem.clienteId)) || ordem.clienteSnapshot || {};
    if (etapa === "pronto" && ordem.notificarWhatsapp) {
      const url = linkWhatsappPatio(ordem, cliente);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else window.alert("Não foi possível abrir o WhatsApp: cadastre um telefone para este cliente.");
    }
    try {
      await update("ordens", (anteriores) => anteriores.map((item) => {
        if (String(item.id) !== String(id)) return item;
        return {
          ...item,
          statusPatio: etapa,
          patioInicioEm: etapa === "aguardando"
            ? null
            : etapa === "lavagem"
              ? item.patioInicioEm || agora
              : item.patioInicioEm || null,
          patioProntoEm: etapa === "pronto" ? agora : null,
        };
      }));
    } catch (error) {
      window.alert(`Não foi possível atualizar a etapa da OS: ${error.message}`);
    }
  };

  const soltarNaEtapa = (event, etapa) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain");
    setArrastandoId("");
    setEtapaSobre("");
    if (id) moverOrdem(id, etapa);
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="headline text-2xl font-bold text-slate-900">Painel do pátio</h1>
          <p className="mt-1 text-sm text-slate-500">Acompanhe os veículos em cada etapa do serviço.</p>
        </div>
        <button type="button" onClick={onNovaOS} className="inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-cyan-800">
          <Plus size={17} /> Nova OS
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador titulo="Carros hoje" valor={resumo.carrosHoje} detalhe="OS em andamento abertas hoje" />
        <Indicador titulo="Em lavagem agora" valor={resumo.emLavagem} detalhe="Veículos nesta etapa" />
        <Indicador titulo="Faturamento do dia" valor={brl(resumo.faturamentoHoje)} detalhe="OS concluídas hoje" />
        <Indicador titulo="Tempo médio" valor={formatarDuracao(resumo.tempoMedioMinutos)} detalhe="Média dos veículos prontos hoje" />
      </div>

      <div className="grid items-stretch gap-3 md:grid-cols-2 xl:grid-cols-4">
        {ETAPAS_PATIO.map((etapa) => {
          const lista = ordens.filter((ordem) => etapaPatio(ordem) === etapa.id);
          const isSobre = etapaSobre === etapa.id;
          return (
            <section
              key={etapa.id}
              onDragOver={(event) => event.preventDefault()}
              onDragEnter={() => setEtapaSobre(etapa.id)}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setEtapaSobre("");
              }}
              onDrop={(event) => soltarNaEtapa(event, etapa.id)}
              aria-label={`${etapa.nome}: ${lista.length} veículos`}
              className={`min-h-64 rounded-2xl p-3 transition-colors ${isSobre ? "bg-cyan-100 ring-2 ring-cyan-500" : "bg-slate-100"}`}
            >
              <header className="mb-2 flex items-center justify-between gap-2 px-1">
                <h2 className="text-sm font-bold text-slate-900">{etapa.nome}</h2>
                <span className="text-sm font-semibold text-slate-700">{lista.length}</span>
              </header>
              <div className="space-y-2">
                {lista.map((ordem) => {
                  const cliente = (db.clientes || []).find((item) => String(item.id) === String(ordem.clienteId)) || ordem.clienteSnapshot || {};
                  const veiculo = veiculoDaOrdem(ordem, cliente);
                  const servicos = (ordem.itens || []).map((item) => item.descricao || item.nome).filter(Boolean);
                  return (
                    <article
                      key={ordem.id}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", String(ordem.id));
                        event.dataTransfer.effectAllowed = "move";
                        setArrastandoId(String(ordem.id));
                      }}
                      onDragEnd={() => {
                        setArrastandoId("");
                        setEtapaSobre("");
                      }}
                      className={`rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-opacity ${arrastandoId === String(ordem.id) ? "opacity-50" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button type="button" onClick={() => onAbrirOS(ordem)} className="text-left font-bold text-slate-900 hover:text-cyan-800">
                          {veiculo.placa || `OS #${ordem.numero || "—"}`}
                        </button>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${clsEtapa[etapa.id]}`}>{etapa.nome}</span>
                      </div>
                      <p className="mt-1 truncate text-sm text-slate-600">{veiculo.descricao || cliente.nome || ordem.clienteNome || "Cliente"}</p>
                      <p className="mt-1 truncate text-xs text-slate-500" title={servicos.join(", ")}>
                        {servicos.length ? servicos.join(", ") : `OS #${ordem.numero || "—"}`}
                      </p>
                      {ordem.lavadorNome && <p className="mt-1 text-xs font-medium text-cyan-800">Lavador: {ordem.lavadorNome}</p>}
                      {ordem.porteVeiculo && <p className="mt-1 text-xs text-slate-500">Porte: {ordem.porteVeiculo}</p>}
                      <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                        <Clock3 size={13} aria-hidden="true" /> {formatarEntrada(ordem)}
                      </div>
                      <label className="mt-2 flex items-center gap-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
                        <span className="shrink-0">Etapa</span>
                        <select
                          aria-label={`Etapa da OS ${ordem.numero || ordem.id}`}
                          value={etapaPatio(ordem)}
                          onChange={(event) => moverOrdem(ordem.id, event.target.value)}
                          className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                        >
                          {ETAPAS_PATIO.map((opcao) => <option key={opcao.id} value={opcao.id}>{opcao.nome}</option>)}
                        </select>
                      </label>
                      {etapa.id === "pronto" && ordem.notificarWhatsapp && linkWhatsappPatio(ordem, cliente) && <a href={linkWhatsappPatio(ordem, cliente)} target="_blank" rel="noreferrer" className="mt-2 block rounded-lg bg-green-700 px-3 py-2 text-center text-xs font-semibold text-white hover:bg-green-800">Avisar cliente no WhatsApp</a>}
                    </article>
                  );
                })}
                {!lista.length && <p className="rounded-xl border border-dashed border-slate-300/80 px-3 py-6 text-center text-xs text-slate-500">Arraste uma OS para esta etapa.</p>}
              </div>
            </section>
          );
        })}
      </div>
      <p className="text-xs text-slate-500">Arraste os cartões para avançar ou use o seletor de etapa. “Pronto” mantém a OS aberta até a retirada.</p>
    </div>
  );
}
