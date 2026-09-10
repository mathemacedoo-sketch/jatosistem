import { ClienteDocumento, ItensDocumento, ObservacoesDocumento } from "./DocumentoVenda";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import { calcularItem, carregarPagamentos, dinheiro, filtrarItensValidos, financeiroPedido, gerarParcelasPagamento, normalizarBuscaTexto, somarItens, validarPagamentos, vencimentoMensal } from "../lib/pedido";

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const hojeISO = () => {
  const data = new Date();
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
};
const brl = (valor) => Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const inputCls = "app-input w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:bg-slate-100 disabled:text-slate-500";
const formasPagamento = ["Dinheiro", "Pix", "Cartão de Débito", "Cartão de Crédito", "Boleto", "Transferência", "Carteira"];
const pendente = (ordem) => !ordem || ["rascunho", "pendente", "estornado"].includes(ordem.statusOS);
const Field = ({ label, children }) => <label className="block space-y-1 text-sm"><span className="font-medium text-slate-600">{label}</span>{children}</label>;

export default function PedidoVenda({ db, update, empresa, ordemEmEdicao, onFinalizarEdicao, onConcluirFechado, podeEditarValor, ReciboModal, onSelecionarPedido }) {
  const [clienteId, setClienteId] = useState("");
  const [itens, setItens] = useState([]);
  const [desconto, setDesconto] = useState("");
  const [observacao, setObservacao] = useState("");
  const [pagamentos, setPagamentos] = useState([]);
  const [recibo, setRecibo] = useState(null);
  const [pesquisaPedidoAberta, setPesquisaPedidoAberta] = useState(false);
  const [buscaPedido, setBuscaPedido] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const salvandoRef = useRef(false);
  const novoPedidoId = useRef(uid());
  const ultimoAutoSaveRef = useRef("");

  useEffect(() => {
    setClienteId(ordemEmEdicao?.clienteId || "");
    setItens((ordemEmEdicao?.itens || []).map((item) => ({ ...item, uidLine: item.uidLine || uid(), descricao: item.descricao || item.nome || "", desconto: item.desconto || 0 })));
    setDesconto(ordemEmEdicao?.desconto || "");
    setObservacao(ordemEmEdicao?.observacao || "");
    setPagamentos(carregarPagamentos(ordemEmEdicao, hojeISO()));
    setErro("");
  }, [ordemEmEdicao]);

  const cliente = (db.clientes || []).find((item) => String(item.id) === String(clienteId));
  const resumo = somarItens(itens, desconto);
  const totalPagamentos = dinheiro(pagamentos.reduce((soma, pagamento) => soma + Number(pagamento.valor || 0), 0));
  const saldo = dinheiro(resumo.total - totalPagamentos);
  const somenteLeitura = !pendente(ordemEmEdicao);
  const pedidosPesquisaveis = (db.ordens || [])
    .filter((ordem) => !ordem.lancamentoManual)
    .sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")));

  const adicionarPagamento = () => {
    const pagamento = { id: uid(), tipoPagamento: "avista", qtdParcelas: 1, formaPagamento: "Dinheiro", valor: Math.max(0, saldo) };
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
      clienteId: cliente.id, clienteNome: cliente.nome,
      clienteSnapshot: Object.fromEntries(["nome", "tipoPessoa", "cpfCnpj", "dataNascimento", "telefone", "email", "cep", "endereco", "numero", "bairro", "cidade", "estado"].map((campo) => [campo, cliente[campo] || ""])),
      itens: itensSalvos, ...resumo, observacao: observacao.trim(), statusOS: concluir ? "concluido" : "pendente",
      ...financeiroPedido(pagamentos, concluir, hoje),
    };
    for (const campo of ["dataProgramada", "horaInicio", "horaFim", "veiculoId", "tipoVeiculo", "veiculo", "marca", "cor", "ano", "placa", "frota", "motorista", "funcionarioId", "funcionarioNome"]) delete ordem[campo];
    salvandoRef.current = true;
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
        setClienteId(""); setItens([]); setPagamentos([]); setDesconto(""); setObservacao("");
        onFinalizarEdicao?.(concluir);
      } else {
        ultimoAutoSaveRef.current = JSON.stringify({ clienteId: cliente.id, itens: itensSalvos, desconto, observacao });
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
    const payload = JSON.stringify({ clienteId, itens: itensValidos.map((item) => ({ ...item, descricao: item.descricao?.trim?.() || item.descricao || "" })), desconto, observacao });
    if (ultimoAutoSaveRef.current === payload) return;
    const timer = setTimeout(() => {
      salvar(false, { silencioso: true });
    }, 350);
    return () => clearTimeout(timer);
  }, [clienteId, itens, desconto, observacao, somenteLeitura]);

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

  return <div className="space-y-5">
    {recibo && <ReciboModal ordem={recibo.ordem} empresa={empresa} cliente={recibo.cliente} onClose={() => { setRecibo(null); onConcluirFechado?.(); }} />}
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
    {somenteLeitura && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Pedido concluído. Para alterá-lo, estorne o pedido na lista de pedidos.</div>}
    {ordemEmEdicao && (
      <div className="flex flex-wrap justify-end gap-3">
        {!['rascunho', 'pendente', 'estornado'].includes(ordemEmEdicao.statusOS || 'pendente') && (
          <button type="button" onClick={estornarPedido} className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-100">
            <RotateCcw size={16} /> Estornar pedido
          </button>
        )}
        {['rascunho', 'pendente', 'estornado'].includes(ordemEmEdicao.statusOS || 'pendente') && (
          <button type="button" onClick={excluirPedido} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100">
            <Trash2 size={16} /> Excluir pedido
          </button>
        )}
      </div>
    )}
    <ClienteDocumento db={db} clienteId={clienteId} setClienteId={setClienteId} acao={<button type="button" onClick={() => setPesquisaPedidoAberta(true)} className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"><Search size={15} /> Pesquisar pedido</button>} />

    <fieldset disabled={salvando || somenteLeitura} className="min-w-0 space-y-5">
      <ItensDocumento db={db} itens={itens} setItens={setItens} desconto={desconto} setDesconto={setDesconto} podeEditarValor={podeEditarValor} />

      <ObservacoesDocumento observacao={observacao} setObservacao={setObservacao} />

      <section className="app-card overflow-hidden rounded-2xl border bg-white">
        <div className="flex flex-col items-start justify-between gap-3 p-5 sm:flex-row sm:items-center"><div><h2 className="font-semibold text-slate-800">Pagamento</h2><p className="mt-1 text-xs text-slate-500">Distribua o total entre as formas de pagamento e ajuste os vencimentos das parcelas.</p></div><button type="button" onClick={adicionarPagamento} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white"><Plus size={16} /> Adicionar pagamento</button></div>
        <div className="pedido-tabela"><table className="w-full min-w-[800px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-3">À vista / A prazo</th><th className="p-3">Condição de pagamento</th><th className="p-3">Forma de pagamento</th><th className="w-40 p-3">Valor (R$)</th><th className="w-12 p-3"><span className="sr-only">Ações</span></th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {!pagamentos.length && <tr><td colSpan={5} className="p-8 text-center text-slate-400">Adicione o pagamento para definir as parcelas.</td></tr>}
            {pagamentos.map((pagamento, index) => <LinhaPagamento key={pagamento.id} pagamento={pagamento} index={index} atualizar={atualizarPagamento} atualizarVencimento={atualizarVencimento} remover={() => setPagamentos((anteriores) => anteriores.filter((item) => item.id !== pagamento.id))} />)}
          </tbody>
        </table></div>
        <div className="flex flex-wrap justify-end gap-5 border-t border-slate-100 p-5 text-sm"><span>Pagamentos: <strong>{brl(totalPagamentos)}</strong></span><span className={saldo === 0 ? "text-slate-700" : "font-semibold text-amber-700"}>{saldo < 0 ? "Valor excedente" : "Falta distribuir"}: {brl(Math.abs(saldo))}</span></div>
      </section>
      {erro && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div>}
      <div className="flex flex-wrap justify-end gap-3"><button type="button" onClick={() => salvar(true)} disabled={salvando || !filtrarItensValidos(itens).length || !clienteId} className="rounded-xl bg-red-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">Concluir pedido</button></div>
    </fieldset>
  </div>;
}

function LinhaPagamento({ pagamento, index, atualizar, atualizarVencimento, remover }) {
  return <>
    <tr>
      <td className="p-3"><select aria-label={`Modalidade do pagamento ${index + 1}`} className={inputCls} value={pagamento.tipoPagamento} onChange={(event) => atualizar(pagamento.id, "tipoPagamento", event.target.value)}><option value="avista">À vista</option><option value="prazo">A prazo</option></select></td>
      <td className="p-3"><select aria-label={`Condição do pagamento ${index + 1}`} className={inputCls} disabled={pagamento.tipoPagamento === "avista"} value={pagamento.qtdParcelas} onChange={(event) => atualizar(pagamento.id, "qtdParcelas", Number(event.target.value))}>{Array.from({ length: 36 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} {i === 0 ? "vez" : "vezes"}</option>)}</select></td>
      <td className="p-3"><select aria-label={`Forma do pagamento ${index + 1}`} className={inputCls} value={pagamento.formaPagamento} onChange={(event) => atualizar(pagamento.id, "formaPagamento", event.target.value)}>{formasPagamento.map((forma) => <option key={forma}>{forma}</option>)}{!formasPagamento.includes(pagamento.formaPagamento) && <option>{pagamento.formaPagamento}</option>}</select></td>
      <td className="p-3"><input aria-label={`Valor do pagamento ${index + 1}`} type="number" min="0" step="0.01" className={inputCls} value={pagamento.valor} onChange={(event) => atualizar(pagamento.id, "valor", event.target.value)} /></td>
      <td className="p-3"><button type="button" aria-label={`Remover pagamento ${index + 1}`} className="p-2 text-slate-400 hover:text-red-600" onClick={remover}><Trash2 size={17} /></button></td>
    </tr>
    <tr><td colSpan={5} className="bg-slate-50/60 px-5 pb-4"><table className="w-full text-sm"><thead className="text-left text-xs text-slate-500"><tr><th className="px-2 py-2">Modalidade</th><th className="px-2 py-2">Parcela</th><th className="px-2 py-2">Forma</th><th className="px-2 py-2">Valor</th><th className="w-44 px-2 py-2">Vencimento</th></tr></thead><tbody>{pagamento.parcelas.map((parcela) => <tr key={parcela.id}><td className="p-2 text-slate-500">{pagamento.tipoPagamento === "avista" ? "À vista" : "A prazo"}</td><td className="p-2">{parcela.numeroParcela}/{parcela.totalParcelas}</td><td className="p-2">{pagamento.formaPagamento}</td><td className="p-2 font-semibold">{brl(parcela.valor)}</td><td className="p-2"><input aria-label={`Vencimento do pagamento ${index + 1}, parcela ${parcela.numeroParcela}`} type="date" className={inputCls} value={parcela.dataVencimento} onChange={(event) => atualizarVencimento(pagamento.id, parcela.id, event.target.value)} /></td></tr>)}</tbody></table></td></tr>
  </>;
}
