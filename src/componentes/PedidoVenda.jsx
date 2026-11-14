import { ClienteDocumento, ItensDocumento, ResumoDocumento, veiculosDoCliente } from "./DocumentoVenda";
import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Banknote, CreditCard, FileText, Plus, Printer, QrCode, RotateCcw, Search, Trash2, Wallet, X } from "lucide-react";
import { calcularItem, carregarPagamentos, dinheiro, filtrarItensValidos, financeiroPedido, gerarParcelasPagamento, normalizarBuscaTexto, somarItens, validarPagamentos, vencimentoMensal } from "../lib/pedido";

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const hojeISO = () => {
  const data = new Date();
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
};
const brl = (valor) => Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const inputCls = "app-input w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:bg-slate-100 disabled:text-slate-500";
const formasPagamento = ["Dinheiro", "Pix", "Cartão de Débito", "Cartão de Crédito", "Boleto", "Transferência", "Carteira"];
const detalhesFormaPagamento = {
  Dinheiro: { detalhe: "Pagamento em espécie", Icone: Banknote },
  Pix: { detalhe: "Transferência instantânea", Icone: QrCode },
  "Cartão de Débito": { detalhe: "Débito", Icone: CreditCard },
  "Cartão de Crédito": { detalhe: "Crédito", Icone: CreditCard },
  Boleto: { detalhe: "Pagamento por boleto", Icone: FileText },
  Transferência: { detalhe: "Transferência bancária", Icone: ArrowLeftRight },
  Carteira: { detalhe: "Pagar depois", Icone: Wallet },
};
const pendente = (ordem) => !ordem || ["rascunho", "pendente", "estornado"].includes(ordem.statusOS);
const estadoAutoSave = (clienteId, itens, desconto, observacao, pagamentos, veiculoId, porteVeiculo, lavadorId, notificarWhatsapp) => JSON.stringify({
  clienteId, itens: filtrarItensValidos(itens).map(calcularItem), desconto, observacao, pagamentos,
  veiculoId, porteVeiculo, lavadorId, notificarWhatsapp,
});
const Field = ({ label, children }) => <label className="block space-y-1 text-sm"><span className="font-medium text-slate-600">{label}</span>{children}</label>;

export default function PedidoVenda({ db, update, empresa, ordemEmEdicao, onFinalizarEdicao, onConcluirFechado, podeEditarValor, ReciboModal, onSelecionarPedido }) {
  const [clienteId, setClienteId] = useState("");
  const [veiculoId, setVeiculoId] = useState("");
  const [porteVeiculo, setPorteVeiculo] = useState("");
  const [lavadorId, setLavadorId] = useState("");
  const [notificarWhatsapp, setNotificarWhatsapp] = useState(false);
  const [itens, setItens] = useState([]);
  const [etapaOS, setEtapaOS] = useState(1);
  const [desconto, setDesconto] = useState("");
  const [observacao, setObservacao] = useState("");
  const [pagamentos, setPagamentos] = useState([]);
  const [recibo, setRecibo] = useState(null);
  const [pesquisaPedidoAberta, setPesquisaPedidoAberta] = useState(false);
  const [buscaPedido, setBuscaPedido] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [salvamentoAutomatico, setSalvamentoAutomatico] = useState(false);
  const [revisaoAutoSave, setRevisaoAutoSave] = useState(0);
  const [erro, setErro] = useState("");
  const salvandoRef = useRef(false);
  const novoPedidoId = useRef(uid());
  const ultimoAutoSaveRef = useRef("");

  useEffect(() => {
    setClienteId(ordemEmEdicao?.clienteId || "");
    setVeiculoId(ordemEmEdicao?.veiculoId || "");
    setPorteVeiculo(ordemEmEdicao?.porteVeiculo || "");
    setLavadorId(ordemEmEdicao?.lavadorId || "");
    setNotificarWhatsapp(Boolean(ordemEmEdicao?.notificarWhatsapp));
    setItens((ordemEmEdicao?.itens || []).map((item) => ({ ...item, uidLine: item.uidLine || uid(), descricao: item.descricao || item.nome || "", desconto: item.desconto || 0 })));
    setDesconto(ordemEmEdicao?.desconto || "");
    setObservacao(ordemEmEdicao?.observacao || "");
    setPagamentos(carregarPagamentos(ordemEmEdicao, hojeISO()));
    setEtapaOS(1);
    setErro("");
  }, [ordemEmEdicao]);

  const cliente = (db.clientes || []).find((item) => String(item.id) === String(clienteId));
  const veiculoSelecionado = veiculosDoCliente(cliente).find((item) => String(item.id) === String(veiculoId));
  const resumo = somarItens(itens, desconto);
  const totalPagamentos = dinheiro(pagamentos.reduce((soma, pagamento) => soma + Number(pagamento.valor || 0), 0));
  const saldo = dinheiro(resumo.total - totalPagamentos);
  const somenteLeitura = !pendente(ordemEmEdicao);
  const imprimirPedido = () => {
    const itensValidos = filtrarItensValidos(itens).map(calcularItem);
    if (!clienteId || !itensValidos.length) return;
    const registro = ordemEmEdicao || (db.ordens || []).find((item) => item.id === novoPedidoId.current);
    const pessoa = somenteLeitura ? { ...cliente, ...registro?.clienteSnapshot } : cliente || registro?.clienteSnapshot || {};
    const ordem = somenteLeitura ? registro : {
      ...registro,
      numero: registro?.numero || "Rascunho",
      data: registro?.data || hojeISO(),
      clienteId, clienteNome: pessoa.nome, clienteSnapshot: pessoa,
      itens: itensValidos, ...resumo, observacao: observacao.trim(),
      ...financeiroPedido(pagamentos, false, hojeISO()),
    };
    setRecibo({ ordem, cliente: pessoa, previa: true });
  };
  const pedidosPesquisaveis = (db.ordens || [])
    .filter((ordem) => !ordem.lancamentoManual)
    .sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")));

  const adicionarPagamento = (formaPagamento = "Dinheiro") => {
    const pagamento = { id: uid(), tipoPagamento: "avista", qtdParcelas: 1, formaPagamento, valor: Math.max(0, saldo) };
    setPagamentos((anteriores) => [...anteriores, { ...pagamento, parcelas: gerarParcelasPagamento(pagamento, hojeISO()) }]);
  };
  const atualizarPagamento = (id, campo, valor) => {
    setPagamentos((anteriores) => anteriores.map((pagamento) => {
      if (pagamento.id !== id) return pagamento;
      const atualizado = { ...pagamento, [campo]: valor };
      if (atualizado.tipoPagamento === "avista") atualizado.qtdParcelas = 1;
      const mudouTipo = campo === "tipoPagamento" && valor !== pagamento.tipoPagamento;
      const base = mudouTipo ? vencimentoMensal(hojeISO(), valor === "prazo" ? 1 : 0) : pagamento.parcelas[0]?.dataVencimento || hojeISO();
      return { ...atualizado, parcelas: gerarParcelasPagamento(atualizado, base, mudouTipo ? [] : pagamento.parcelas) };
    }));
  };
  const atualizarVencimento = (id, parcelaId, dataVencimento) => setPagamentos((anteriores) => anteriores.map((pagamento) => pagamento.id === id
    ? { ...pagamento, parcelas: pagamento.parcelas.map((parcela) => parcela.id === parcelaId ? { ...parcela, dataVencimento } : parcela) }
    : pagamento));

  const salvar = async (concluir, opcoes = {}) => {
    const { silencioso = false } = opcoes;
    if (salvandoRef.current || somenteLeitura) return;
    setErro("");
    if (!cliente) { setErro("Selecione o cliente do pedido."); return; }
    const itensValidos = filtrarItensValidos(itens).map((item) => calcularItem({ ...item, descricao: String(item.descricao || item.nome || "").trim(), nome: item.nome || String(item.descricao || item.nome || "").trim() }));
    if (!itensValidos.length || itensValidos.some((item) => Number(item.desconto) < 0 || Number(item.desconto || 0) > dinheiro(Number(item.qtd) * Number(item.precoUnit)))) {
      if (!silencioso) setErro("Preencha os itens com descrição, quantidade maior que zero, valor unitário e desconto até o valor da linha.");
      return;
    }
    const erroPagamento = validarPagamentos(pagamentos, resumo.total, concluir);
    if (erroPagamento) { setErro(erroPagamento); return; }
    const hoje = hojeISO();
    const itensSalvos = itensValidos.map(calcularItem);
    const numero = ordemEmEdicao?.numero || String(Math.max(0, ...(db.ordens || []).filter((item) => !item.lancamentoManual).map((item) => Number(String(item.numero || "").replace(/\D/g, "")) || 0)) + 1).padStart(4, "0");
    const ordem = {
      ...ordemEmEdicao,
      id: ordemEmEdicao?.id || novoPedidoId.current, numero, data: ordemEmEdicao?.data || hoje,
      veiculoId: veiculoSelecionado?.id || null,
      veiculoSnapshot: veiculoSelecionado || null,
      porteVeiculo: porteVeiculo || "",
      lavadorId: lavadorId || null,
      lavadorNome: lavadorId ? db.funcionarios?.find((item) => String(item.id) === String(lavadorId))?.nome || ordemEmEdicao?.lavadorNome || "" : "",
      notificarWhatsapp,
      statusPatio: ordemEmEdicao?.statusPatio || "aguardando",
      patioEntradaEm: ordemEmEdicao?.patioEntradaEm || new Date().toISOString(),
      patioInicioEm: ordemEmEdicao?.patioInicioEm || null,
      patioProntoEm: ordemEmEdicao?.patioProntoEm || null,
      clienteId: cliente.id, clienteNome: cliente.nome,
      clienteSnapshot: Object.fromEntries(["nome", "tipoPessoa", "cpfCnpj", "dataNascimento", "telefone", "email", "cep", "endereco", "numero", "bairro", "cidade", "estado"].map((campo) => [campo, cliente[campo] || ""])),
      itens: itensSalvos, ...resumo, observacao: observacao.trim(), statusOS: concluir ? "concluido" : "pendente",
      ...financeiroPedido(pagamentos, concluir, hoje),
    };
    for (const campo of ["dataProgramada", "horaInicio", "horaFim"]) delete ordem[campo];
    salvandoRef.current = true;
    setSalvamentoAutomatico(silencioso);
    setSalvando(true);
    try {
      const quantidades = itensSalvos.filter((item) => item.tipo === "produto").reduce((soma, item) => ({ ...soma, [item.itemId]: (soma[item.itemId] || 0) + item.qtd }), {});
      const jaConcluido = (db.ordens || []).some((item) => String(item.id) === String(ordem.id) && !pendente(item));
      await update({
        ordens: (anteriores) => anteriores.some((item) => String(item.id) === String(ordem.id)) ? anteriores.map((item) => String(item.id) === String(ordem.id) ? ordem : item) : [...anteriores, ordem],
        ...(concluir && !jaConcluido && Object.keys(quantidades).length ? { produtos: (anteriores) => anteriores.map((produto) => quantidades[produto.id] ? { ...produto, quantidade: Math.max(0, Number(produto.quantidade) - quantidades[produto.id]) } : produto) } : {}),
      });
      if (concluir) setRecibo({ ordem, cliente: ordem.clienteSnapshot });
      if (!silencioso) {
        novoPedidoId.current = uid();
        setClienteId(""); setVeiculoId(""); setPorteVeiculo(""); setLavadorId(""); setNotificarWhatsapp(false);
        setItens([]); setPagamentos([]); setDesconto(""); setObservacao("");
        onFinalizarEdicao?.(concluir);
      } else {
        ultimoAutoSaveRef.current = estadoAutoSave(clienteId, itens, desconto, observacao, pagamentos, veiculoId, porteVeiculo, lavadorId, notificarWhatsapp);
        setRevisaoAutoSave((revisao) => revisao + 1);
      }
    } catch (error) {
      setErro(`Não foi possível salvar o pedido: ${error.message}`);
    } finally {
      salvandoRef.current = false;
      setSalvando(false);
    }
  };

  useEffect(() => {
    const itensValidos = filtrarItensValidos(itens);
    if (somenteLeitura || !clienteId || !itensValidos.length || salvandoRef.current) return;
    const payload = estadoAutoSave(clienteId, itens, desconto, observacao, pagamentos, veiculoId, porteVeiculo, lavadorId, notificarWhatsapp);
    if (ultimoAutoSaveRef.current === payload) return;
    const timer = setTimeout(() => {
      salvar(false, { silencioso: true });
    }, 350);
    return () => clearTimeout(timer);
  }, [clienteId, itens, desconto, observacao, pagamentos, veiculoId, porteVeiculo, lavadorId, notificarWhatsapp, somenteLeitura, revisaoAutoSave]);

  const abrirPedidoSelecionado = (pedido) => {
    setPesquisaPedidoAberta(false);
    setBuscaPedido("");
    onSelecionarPedido?.(pedido);
  };

  const excluirPedido = () => {
    if (!ordemEmEdicao) return;
    const statusAtual = ordemEmEdicao.statusOS || "pendente";
    if (!["rascunho", "pendente", "estornado"].includes(statusAtual)) {
      window.alert("Só é possível excluir pedidos com status pendente.");
      return;
    }
    if (!window.confirm(`Deseja excluir o pedido #${ordemEmEdicao.numero}?`)) return;

    const produtosVendidos = (ordemEmEdicao.itens || []).filter((item) => item.tipo === "produto");
    if (produtosVendidos.length) {
      update("produtos", (anteriores) => anteriores.map((produto) => {
        const item = produtosVendidos.find((registro) => registro.itemId === produto.id);
        if (!item) return produto;
        return { ...produto, quantidade: Number(produto.quantidade) + Number(item.qtd || 0) };
      }));
    }

    update("ordens", (anteriores) => anteriores.filter((ordem) => String(ordem.id) !== String(ordemEmEdicao.id)));
    onFinalizarEdicao?.();
    setPesquisaPedidoAberta(false);
    setBuscaPedido("");
  };

  const estornarPedido = () => {
    if (!ordemEmEdicao) return;
    const statusAtual = ordemEmEdicao.statusOS || "pendente";
    if (["rascunho", "pendente", "estornado"].includes(statusAtual)) {
      window.alert("Este pedido não precisa de estorno porque ainda está pendente.");
      return;
    }
    if (!window.confirm(`Deseja estornar o pedido #${ordemEmEdicao.numero}? O pedido voltará para pendente e o estoque será restituído.`)) return;

    const produtosDaOrdem = (ordemEmEdicao.itens || []).filter((item) => item.tipo === "produto").reduce((acumulador, item) => {
      acumulador[item.itemId] = (acumulador[item.itemId] || 0) + Number(item.qtd || 0);
      return acumulador;
    }, {});

    const pedidoReaberto = {
      ...ordemEmEdicao,
      statusOS: "pendente",
      statusPagamento: "pendente",
      valorPago: 0,
      parcelas: null,
      pagamentos: Array.isArray(ordemEmEdicao.pagamentos) ? ordemEmEdicao.pagamentos.map((pagamento) => ({ ...pagamento, parcelas: (pagamento.parcelas || []).map((parcela) => ({ ...parcela, status: "pendente", valorPago: 0, dataBaixa: null, formaPagamentoBaixa: null })) })) : undefined,
      dataEstorno: hojeISO(),
    };

    update("produtos", (anteriores) => anteriores.map((produto) =>
      produtosDaOrdem[produto.id]
        ? { ...produto, quantidade: Number(produto.quantidade) + Number(produtosDaOrdem[produto.id]) }
        : produto
    ));

    update("ordens", (anteriores) => anteriores.map((ordem) =>
      String(ordem.id) === String(ordemEmEdicao.id) ? pedidoReaberto : ordem
    ));

    onSelecionarPedido?.(pedidoReaberto);
    setPesquisaPedidoAberta(false);
    setBuscaPedido("");
  };

  const filtrarPedidosPorBusca = (ordem) => {
    const termo = normalizarBuscaTexto(buscaPedido);
    if (!termo) return true;

    const clienteSalvo = ordem.clienteNome || ordem.clienteSnapshot?.nome || "";
    const clienteRelacionado = (db.clientes || []).find((cliente) => String(cliente.id) === String(ordem.clienteId));
    const numero = normalizarBuscaTexto(ordem.numero || "");
    const cliente = normalizarBuscaTexto(clienteSalvo || clienteRelacionado?.nome || "");
    const data = normalizarBuscaTexto(ordem.data ? new Date(`${ordem.data}T00:00:00`).toLocaleDateString("pt-BR") : "");
    const dataIso = normalizarBuscaTexto(ordem.data || "");
    const documento = normalizarBuscaTexto(ordem.clienteSnapshot?.cpfCnpj || clienteRelacionado?.cpfCnpj || "");

    return [numero, cliente, data, dataIso, documento].some((valor) => valor.includes(termo));
  };

  return <div className="os-form flex min-h-0 flex-1 flex-col gap-3">
    {recibo && <ReciboModal ordem={recibo.ordem} empresa={empresa} cliente={recibo.cliente} onClose={() => { setRecibo(null); if (!recibo.previa) onConcluirFechado?.(); }} />}
    {pesquisaPedidoAberta && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold text-slate-900">Pesquisar pedido</h2><button type="button" onClick={() => setPesquisaPedidoAberta(false)} className="p-2 text-slate-400 hover:text-slate-700" aria-label="Fechar pesquisa"><X size={18} /></button></div><input autoFocus className={inputCls} placeholder="Número, cliente ou data" value={buscaPedido} onChange={(event) => setBuscaPedido(event.target.value)} /><div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
      {pedidosPesquisaveis.filter(filtrarPedidosPorBusca).map((ordem) => {
        const statusPedido = ordem.statusOS || "pendente";
        const statusLabel = {
          rascunho: "Rascunho",
          pendente: "Pendente",
          concluido: "Concluído",
          estornado: "Estornado",
        }[statusPedido] || "Pendente";

        return (
          <button key={ordem.id} type="button" onClick={() => abrirPedidoSelecionado(ordem)} className="flex w-full items-center justify-between gap-4 rounded-xl border border-slate-200 px-3 py-3 text-left hover:bg-red-50">
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-slate-800">#{ordem.numero || "-"} · {ordem.clienteNome || "Cliente"}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-600">{statusLabel}</span>
                <span>{ordem.data ? new Date(ordem.data + "T00:00:00").toLocaleDateString("pt-BR") : "-"}</span>
                <span className="font-semibold text-slate-700">{brl(ordem.total || 0)}</span>
              </div>
            </div>
            <span className="text-sm font-semibold text-red-700">Abrir</span>
          </button>
        );
      })}
      {!pedidosPesquisaveis.filter(filtrarPedidosPorBusca).length && <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">Nenhum pedido encontrado.</div>}
    </div></div></div>}
      <div className="flex shrink-0 flex-wrap justify-end gap-3">
        <button type="button" onClick={imprimirPedido} disabled={salvando || !clienteId || !filtrarItensValidos(itens).length} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"><Printer size={16} /> Imprimir</button>
        {ordemEmEdicao && !['rascunho', 'pendente', 'estornado'].includes(ordemEmEdicao.statusOS || 'pendente') && (
          <button type="button" onClick={estornarPedido} className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-100">
            <RotateCcw size={16} /> Estornar pedido
          </button>
        )}
        {ordemEmEdicao && ['rascunho', 'pendente', 'estornado'].includes(ordemEmEdicao.statusOS || 'pendente') && (
          <button type="button" onClick={excluirPedido} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100">
            <Trash2 size={16} /> Excluir pedido
          </button>
        )}
      </div>
      <nav className="os-stepper grid shrink-0 grid-cols-2 gap-2" aria-label="Etapas da OS">
        {[["Dados e serviços", 1], ["Pagamento", 2]].map(([label, passo]) => <button
          key={passo}
          type="button"
          aria-current={etapaOS === passo ? "step" : undefined}
          onClick={() => setEtapaOS(passo)}
          className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${etapaOS === passo ? "border-cyan-700 bg-cyan-50 text-cyan-900 ring-1 ring-cyan-600" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
        ><span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-xs">{passo}</span>{label}</button>)}
      </nav>
    <fieldset disabled={(salvando && !salvamentoAutomatico) || somenteLeitura} className="os-fieldset min-h-0 flex-1">
      {etapaOS === 1 ? <div className="os-step-data grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(18rem,0.9fr)_minmax(24rem,1.3fr)_minmax(18rem,0.8fr)]">
          <ClienteDocumento
            db={db}
            clienteId={clienteId}
            setClienteId={setClienteId}
            veiculoId={veiculoId}
            setVeiculoId={setVeiculoId}
            porteVeiculo={porteVeiculo}
            setPorteVeiculo={setPorteVeiculo}
            acao={<button type="button" onClick={() => setPesquisaPedidoAberta(true)} className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"><Search size={15} /> Pesquisar</button>}
          />
          <ItensDocumento db={db} itens={itens} setItens={setItens} desconto={desconto} setDesconto={setDesconto} podeEditarValor={podeEditarValor} />
          <ResumoDocumento
            className="os-summary"
            db={db}
            itens={itens}
            desconto={desconto}
            lavadorId={lavadorId}
            setLavadorId={setLavadorId}
            notificarWhatsapp={notificarWhatsapp}
            setNotificarWhatsapp={setNotificarWhatsapp}
          >
            <button type="button" onClick={() => setEtapaOS(2)} disabled={!clienteId || !filtrarItensValidos(itens).length} className="w-full rounded-xl bg-cyan-700 px-4 py-3 text-sm font-semibold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-40">Avançar para pagamento</button>
          </ResumoDocumento>
        </div> : <div className="os-step-payment grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.8fr)]">
          <section className="app-card os-payment-panel h-full min-h-0 overflow-y-auto rounded-2xl border bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="font-semibold text-slate-900">Como o cliente vai pagar?</h2><p className="mt-1 text-xs text-slate-500">Escolha um cartão. Você pode dividir o valor entre formas diferentes.</p></div>
              {!!pagamentos.length && <button type="button" onClick={() => adicionarPagamento()} className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white"><Plus size={16} /> Dividir pagamento</button>}
            </div>
            {!pagamentos.length && <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {formasPagamento.map((forma) => <FormaPagamentoCard key={forma} forma={forma} onClick={() => adicionarPagamento(forma)} disabled={resumo.total <= 0} />)}
            </div>}
            <div className="mt-4 space-y-3">
              {pagamentos.map((pagamento, index) => <LinhaPagamento key={pagamento.id} pagamento={pagamento} index={index} atualizar={atualizarPagamento} atualizarVencimento={atualizarVencimento} remover={() => setPagamentos((anteriores) => anteriores.filter((item) => item.id !== pagamento.id))} />)}
            </div>
            {!!pagamentos.length && <div className="mt-4 flex flex-wrap justify-end gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-sm">
              <span>Pagamentos: <strong>{brl(totalPagamentos)}</strong></span>
              <span className={saldo === 0 ? "text-slate-700" : "font-semibold text-amber-700"}>{saldo < 0 ? "Valor excedente" : "Falta distribuir"}: {brl(Math.abs(saldo))}</span>
            </div>}
            <details className="mt-4 rounded-xl border border-slate-200">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-700">Observações (opcional)</summary>
              <div className="border-t border-slate-100 p-3"><textarea aria-label="Observações do pedido" rows={2} className={inputCls} placeholder="Informações adicionais do pedido" value={observacao} onChange={(event) => setObservacao(event.target.value)} /></div>
            </details>
          </section>
          <ResumoDocumento
            className="os-summary"
            compact
            db={db}
            itens={itens}
            desconto={desconto}
            lavadorId={lavadorId}
            setLavadorId={setLavadorId}
            notificarWhatsapp={notificarWhatsapp}
            setNotificarWhatsapp={setNotificarWhatsapp}
          >
            {erro && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}
            <button type="button" onClick={() => setEtapaOS(1)} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Voltar aos dados</button>
            <button type="button" onClick={() => salvar(false)} disabled={salvando || !filtrarItensValidos(itens).length || !clienteId} className="w-full rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-40">{salvando ? "Salvando..." : "Gerar OS e enviar para a fila"}</button>
            <button type="button" onClick={() => salvar(true)} disabled={salvando || !filtrarItensValidos(itens).length || !clienteId} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Concluir pedido</button>
          </ResumoDocumento>
        </div>}
    </fieldset>
  </div>;
}

function FormaPagamentoCard({ forma, selecionada = false, onClick, disabled = false }) {
  const { detalhe, Icone } = detalhesFormaPagamento[forma] || { detalhe: "Forma de pagamento", Icone: Wallet };
  return <button
    type="button"
    aria-pressed={selecionada}
    onClick={onClick}
    disabled={disabled}
    className={`flex min-h-16 items-center gap-2.5 rounded-xl border p-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${selecionada ? "border-cyan-700 bg-cyan-50 text-cyan-900 ring-1 ring-cyan-600" : "border-slate-200 bg-white text-slate-700 hover:border-cyan-500 hover:bg-cyan-50/40"}`}
  >
    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${selecionada ? "bg-cyan-700 text-white" : "bg-slate-100 text-slate-600"}`}><Icone size={18} /></span>
    <span className="min-w-0"><strong className="block text-sm">{forma}</strong><span className="mt-0.5 block text-xs text-slate-500">{detalhe}</span></span>
  </button>;
}

function LinhaPagamento({ pagamento, index, atualizar, atualizarVencimento, remover }) {
  const [alterarForma, setAlterarForma] = useState(false);
  const formas = formasPagamento.includes(pagamento.formaPagamento)
    ? formasPagamento
    : [...formasPagamento, pagamento.formaPagamento];
  const atualizarData = (parcela) => <input
    aria-label={`Vencimento do pagamento ${index + 1}, parcela ${parcela.numeroParcela}`}
    type="date"
    className={inputCls}
    value={parcela.dataVencimento}
    onChange={(event) => atualizarVencimento(pagamento.id, parcela.id, event.target.value)}
  />;
  return <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
    <div className="mb-4 flex items-center justify-between gap-3">
      <div><h3 className="font-semibold text-slate-800">Pagamento {index + 1}</h3><p className="text-xs text-slate-500">{brl(pagamento.valor)}</p></div>
      <button type="button" aria-label={`Remover pagamento ${index + 1}`} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={remover}><Trash2 size={17} /></button>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">Modalidade</p>
        <div className="grid grid-cols-2 gap-2">
          {[["avista", "À vista"], ["prazo", "A prazo"]].map(([valor, titulo]) => <button
            key={valor}
            type="button"
            aria-pressed={pagamento.tipoPagamento === valor}
            onClick={() => atualizar(pagamento.id, "tipoPagamento", valor)}
            className={`rounded-lg border px-3 py-2.5 text-sm transition ${pagamento.tipoPagamento === valor ? "border-cyan-700 bg-cyan-100 font-semibold text-cyan-900 ring-1 ring-cyan-600" : "border-slate-300 bg-white text-slate-700 hover:border-cyan-500"}`}
          >{titulo}</button>)}
        </div>
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor={`pagamento-valor-${pagamento.id}`}>Valor (R$)</label>
        <input id={`pagamento-valor-${pagamento.id}`} aria-label={`Valor do pagamento ${index + 1}`} type="number" min="0" step="0.01" className={inputCls} value={pagamento.valor} onChange={(event) => atualizar(pagamento.id, "valor", event.target.value)} />
      </div>
    </div>
    <div className="mt-4">
      <p className="mb-2 text-sm font-medium text-slate-700">Forma de pagamento</p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-52 flex-1"><FormaPagamentoCard forma={pagamento.formaPagamento} selecionada onClick={() => setAlterarForma((aberto) => !aberto)} /></div>
        <button type="button" aria-expanded={alterarForma} onClick={() => setAlterarForma((aberto) => !aberto)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{alterarForma ? "Cancelar" : "Trocar forma"}</button>
      </div>
      {alterarForma && <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {formas.map((forma) => <FormaPagamentoCard
          key={forma}
          forma={forma}
          selecionada={pagamento.formaPagamento === forma}
          onClick={() => { atualizar(pagamento.id, "formaPagamento", forma); setAlterarForma(false); }}
        />)}
      </div>}
    </div>
    {pagamento.tipoPagamento === "prazo" && <div className="mt-4">
      <Field label="Quantidade de parcelas">
        <select aria-label={`Quantidade de parcelas do pagamento ${index + 1}`} className={inputCls} value={pagamento.qtdParcelas} onChange={(event) => atualizar(pagamento.id, "qtdParcelas", Number(event.target.value))}>
          {Array.from({ length: 36 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} {i === 0 ? "vez" : "vezes"}</option>)}
        </select>
      </Field>
    </div>}
    {pagamento.tipoPagamento === "prazo" && (pagamento.parcelas.length === 1
      ? <div className="mt-4 max-w-xs"><label className="mb-1 block text-sm font-medium text-slate-700">Vencimento</label>{atualizarData(pagamento.parcelas[0])}</div>
      : <details className="mt-4 rounded-lg border border-slate-200 bg-white">
          <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium text-slate-700">Ver parcelas e vencimentos ({pagamento.parcelas.length})</summary>
          <div className="grid gap-3 border-t border-slate-100 p-3 sm:grid-cols-2">
            {pagamento.parcelas.map((parcela) => <label key={parcela.id} className="space-y-1 text-sm">
              <span className="block font-medium text-slate-600">Parcela {parcela.numeroParcela} · {brl(parcela.valor)}</span>
              {atualizarData(parcela)}
            </label>)}
          </div>
        </details>)}
  </section>;
}
