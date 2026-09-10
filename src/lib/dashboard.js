import { dinheiro } from "./pedido.js";

export function resumoDashboard(db, mes, hoje, recebiveis = []) {
  const soma = (lista, campo) => dinheiro(lista.reduce((total, item) => total + Number(item[campo] || 0), 0));
  const pedidos = (db.ordens || []).filter((item) => !item.lancamentoManual);
  const concluidos = pedidos.filter((item) => item.statusOS && !["rascunho", "pendente", "estornado"].includes(item.statusOS));
  const vendas = concluidos.filter((item) => String(item.data || "").startsWith(mes));
  const totalVendas = soma(vendas, "total");
  const abertos = pedidos.filter((item) => !item.statusOS || ["rascunho", "pendente"].includes(item.statusOS));
  const orcamentos = (db.orcamentos || []).filter((item) => String(item.data || "").startsWith(mes));
  const convertidos = orcamentos.filter((item) => item.pedidoId).length;
  const receber = recebiveis.map((item) => ({ ...item, saldo: item.statusPagamento === "pago" ? 0 : dinheiro(Math.max(0, Number(item.valorParcela || 0) - Number(item.valorPago || 0))) })).filter((item) => item.saldo > 0);
  const pagar = (db.contasPagar || []).map((item) => ({ ...item, saldo: item.status === "pago" ? 0 : dinheiro(Math.max(0, Number(item.valor || 0) - Number(item.valorPago || 0))) })).filter((item) => item.saldo > 0);
  const clientes = new Map();
  vendas.forEach((item) => {
    const chave = item.clienteId || item.clienteNome || "Cliente";
    const atual = clientes.get(chave) || { nome: item.clienteNome || "Cliente", total: 0, pedidos: 0 };
    clientes.set(chave, { ...atual, total: dinheiro(atual.total + Number(item.total || 0)), pedidos: atual.pedidos + 1 });
  });
  const [ano, numeroMes] = mes.split("-").map(Number);
  const evolucao = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(ano, numeroMes - 6 + index, 1);
    const chave = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return { mes: chave, total: soma(concluidos.filter((item) => String(item.data || "").startsWith(chave)), "total") };
  });
  return {
    totalVendas, quantidade: vendas.length, ticketMedio: vendas.length ? dinheiro(totalVendas / vendas.length) : 0,
    clientesAtendidos: clientes.size, abertos: abertos.length, valorAberto: soma(abertos, "total"),
    orcamentos: orcamentos.length, convertidos, conversao: orcamentos.length ? Math.round(convertidos / orcamentos.length * 100) : 0,
    aReceber: soma(receber, "saldo"), receberVencido: soma(receber.filter((item) => item.dataVencimento && item.dataVencimento < hoje), "saldo"),
    aPagar: soma(pagar, "saldo"), pagarVencido: soma(pagar.filter((item) => item.vencimento && item.vencimento < hoje), "saldo"),
    receberHoje: soma(receber.filter((item) => item.dataVencimento === hoje), "saldo"), pagarHoje: soma(pagar.filter((item) => item.vencimento === hoje), "saldo"),
    estoqueBaixo: (db.produtos || []).filter((item) => Number(item.quantidade || 0) <= Number(item.estoqueMinimo || 0)).sort((a, b) => Number(a.quantidade || 0) - Number(b.quantidade || 0)),
    principaisClientes: [...clientes.values()].sort((a, b) => b.total - a.total).slice(0, 5), evolucao,
  };
}
