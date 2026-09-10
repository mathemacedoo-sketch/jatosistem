export const dinheiro = (valor) => Math.round((Number(valor) || 0) * 100) / 100;

export function normalizarBuscaTexto(valor = "") {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\d\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function filtrarItensValidos(itens = []) {
  return (itens || []).filter((item) => {
    const descricao = String(item?.descricao ?? item?.nome ?? "").trim();
    const qtd = Number(item?.qtd ?? 0);
    const precoUnit = Number(item?.precoUnit ?? 0);
    const itemSelecionado = item && item.itemId !== null && item.itemId !== undefined && item.itemId !== "" && String(item.itemId).trim() !== "";
    const temDescricao = Boolean(descricao);
    const temPreco = Number.isFinite(precoUnit) && precoUnit >= 0;
    const temQtd = Number.isFinite(qtd) && qtd > 0;
    return temQtd && temPreco && (itemSelecionado || temDescricao);
  });
}

export function calcularItem(item) {
  const qtd = Math.max(0, Number(item.qtd) || 0);
  const precoUnit = dinheiro(Math.max(0, Number(item.precoUnit) || 0));
  const bruto = dinheiro(qtd * precoUnit);
  const desconto = dinheiro(Math.min(bruto, Math.max(0, Number(item.desconto) || 0)));
  return { ...item, qtd, precoUnit, desconto, subtotal: dinheiro(bruto - desconto) };
}

export function somarItens(itens, descontoPedido = 0) {
  const itensValidos = filtrarItensValidos(itens);
  const subtotal = dinheiro(itensValidos.reduce((soma, item) => soma + calcularItem(item).subtotal, 0));
  const desconto = dinheiro(Math.min(subtotal, Math.max(0, Number(descontoPedido) || 0)));
  return { subtotal, desconto, total: dinheiro(subtotal - desconto) };
}

export function vencimentoMensal(data, meses) {
  const [ano, mes, dia] = data.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(ano, mes + meses, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes - 1 + meses, Math.min(dia, ultimoDia))).toISOString().slice(0, 10);
}

export function gerarParcelasPagamento(pagamento, dataBase, anteriores = []) {
  const quantidade = pagamento.tipoPagamento === "avista" ? 1 : Math.max(1, Math.min(36, Math.trunc(Number(pagamento.qtdParcelas) || 1)));
  const centavos = Math.max(0, Math.round(Number(pagamento.valor || 0) * 100));
  const valorBase = Math.floor(centavos / quantidade);
  return Array.from({ length: quantidade }, (_, index) => ({
    id: `${pagamento.id}-p${index + 1}`,
    numeroParcela: index + 1,
    totalParcelas: quantidade,
    valor: (valorBase + (index < centavos % quantidade ? 1 : 0)) / 100,
    dataVencimento: anteriores[index]?.dataVencimento || vencimentoMensal(dataBase, index),
    status: "pendente",
    valorPago: 0,
    dataBaixa: null,
  }));
}

export function carregarPagamentos(ordem, hoje) {
  if (!ordem) return [];
  if (Array.isArray(ordem.pagamentos)) {
    return ordem.pagamentos.map((pagamento) => ({
      ...pagamento,
      parcelas: (pagamento.parcelas || []).map((parcela) => ({
        ...parcela,
        ...(ordem.parcelas || []).find((atual) => atual.id === parcela.id),
      })),
    }));
  }
  const pagamento = {
    id: `${ordem.id}-pagamento`,
    tipoPagamento: ordem.formaPagamento === "Carteira" || ordem.parcelas?.length ? "prazo" : "avista",
    qtdParcelas: ordem.parcelas?.length || 1,
    formaPagamento: ordem.formaPagamento || "Dinheiro",
    valor: dinheiro(ordem.total),
  };
  return [{
    ...pagamento,
    parcelas: ordem.parcelas?.length
      ? ordem.parcelas.map((parcela) => ({ ...parcela }))
      : gerarParcelasPagamento(pagamento, ordem.dataVencimento || hoje),
  }];
}

export function financeiroPedido(pagamentos, concluido, hoje) {
  const parcelas = pagamentos.flatMap((pagamento) => pagamento.parcelas.map((parcela) => {
    const pago = concluido && pagamento.tipoPagamento === "avista";
    return {
      ...parcela,
      pagamentoId: pagamento.id,
      tipoPagamento: pagamento.tipoPagamento,
      formaPagamento: pagamento.formaPagamento,
      valor: dinheiro(parcela.valor),
      status: pago ? "pago" : "pendente",
      valorPago: pago ? dinheiro(parcela.valor) : 0,
      dataBaixa: pago ? hoje : null,
      formaPagamentoBaixa: pago ? pagamento.formaPagamento : null,
    };
  }));
  const valorPago = dinheiro(parcelas.reduce((soma, parcela) => soma + parcela.valorPago, 0));
  const total = dinheiro(parcelas.reduce((soma, parcela) => soma + parcela.valor, 0));
  const pendentes = parcelas.filter((parcela) => parcela.status !== "pago");
  return {
    pagamentos: pagamentos.map((pagamento) => ({ ...pagamento, valor: dinheiro(pagamento.valor), parcelas: parcelas.filter((parcela) => parcela.pagamentoId === pagamento.id) })),
    parcelas,
    formaPagamento: [...new Set(pagamentos.map((pagamento) => pagamento.formaPagamento))].join(" / "),
    statusPagamento: !concluido ? "pendente" : valorPago >= total ? "pago" : valorPago > 0 ? "parcial" : "pendente",
    valorPago,
    dataVencimento: pendentes.map((parcela) => parcela.dataVencimento).sort()[0] || null,
  };
}

export function validarPagamentos(pagamentos, total, concluir) {
  if (!pagamentos.length) return concluir ? "Adicione o pagamento antes de concluir o pedido." : "";
  for (const pagamento of pagamentos) {
    if (!pagamento.formaPagamento || !["avista", "prazo"].includes(pagamento.tipoPagamento)) return "Preencha a modalidade e a forma de pagamento.";
    if (!Number.isFinite(Number(pagamento.valor)) || Number(pagamento.valor) < 0 || (Number(pagamento.valor) === 0 && total > 0)) return "Informe um valor maior que zero para cada pagamento.";
    if (!pagamento.parcelas?.length || pagamento.parcelas.some((parcela) => !/^\d{4}-\d{2}-\d{2}$/.test(parcela.dataVencimento || ""))) return "Informe o vencimento de todas as parcelas.";
    if (dinheiro(pagamento.parcelas.reduce((soma, parcela) => soma + Number(parcela.valor), 0)) !== dinheiro(pagamento.valor)) return "O total das parcelas deve corresponder ao valor do pagamento.";
  }
  const soma = dinheiro(pagamentos.reduce((valor, pagamento) => valor + Number(pagamento.valor), 0));
  return concluir && soma !== dinheiro(total) ? "A soma dos pagamentos deve ser igual ao total do pedido." : "";
}

export function sincronizarParcelas(ordem) {
  if (!ordem.parcelas?.length) return ordem;
  const valorPago = dinheiro(ordem.parcelas.reduce((soma, parcela) => soma + Number(parcela.valorPago || 0), 0));
  const pendentes = ordem.parcelas.filter((parcela) => parcela.status !== "pago");
  return {
    ...ordem,
    valorPago,
    statusPagamento: ["rascunho", "pendente", "estornado"].includes(ordem.statusOS) ? "pendente" : !pendentes.length ? "pago" : valorPago > 0 ? "parcial" : "pendente",
    dataVencimento: pendentes.map((parcela) => parcela.dataVencimento).filter(Boolean).sort()[0] || null,
    ...(Array.isArray(ordem.pagamentos) ? { pagamentos: carregarPagamentos(ordem).map((pagamento) => ({ ...pagamento, valor: dinheiro(pagamento.parcelas.reduce((soma, parcela) => soma + Number(parcela.valor), 0)) })) } : {}),
  };
}
