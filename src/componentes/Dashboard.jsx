import { useState } from "react";
import { resumoDashboard } from "../lib/dashboard";

const brl = (valor) => Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const card = "app-card rounded-2xl border border-slate-200 bg-white p-5";
function Indicador({ titulo, valor, detalhe, alerta }) {
  return <div className={card}><p className="text-sm font-medium text-slate-500">{titulo}</p><p className={`mt-2 text-2xl font-bold ${alerta ? "text-red-700" : "text-slate-900"}`}>{valor}</p><p className="mt-2 text-xs text-slate-500">{detalhe}</p></div>;
}

export default function Dashboard({ db, recebiveis, hoje }) {
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const resumo = resumoDashboard(db, mes, hoje, recebiveis);
  const maiorVenda = Math.max(1, ...resumo.evolucao.map((item) => item.total));
  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-red-700">Relatórios</p><h1 className="headline mt-1 text-2xl font-bold text-slate-900">Dashboard</h1><p className="mt-1 text-sm text-slate-500">Acompanhe as vendas e os pontos que precisam de atenção na sua empresa.</p></div><label className="text-sm font-medium text-slate-600">Mês das vendas<input type="month" aria-label="Mês das vendas" value={mes} onChange={(event) => { if (/^\d{4}-\d{2}$/.test(event.target.value)) setMes(event.target.value); }} className="app-input mt-1 block rounded-lg border border-slate-200 px-3 py-2" /></label></header>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Indicador titulo="Vendas no mês" valor={brl(resumo.totalVendas)} detalhe="Total dos pedidos concluídos no mês selecionado" />
      <Indicador titulo="Pedidos concluídos" valor={resumo.quantidade} detalhe="No mês selecionado" />
      <Indicador titulo="Ticket médio" valor={brl(resumo.ticketMedio)} detalhe="Valor médio por pedido concluído no mês" />
      <Indicador titulo="Clientes atendidos" valor={resumo.clientesAtendidos} detalhe="Clientes com pedidos concluídos no mês" />
    </div>
    <div className="grid gap-5 lg:grid-cols-2">
      <section className={card}><h2 className="font-semibold text-slate-900">Evolução das vendas</h2><p className="mt-1 text-xs text-slate-500">Seis meses até o mês selecionado · pedidos concluídos</p><div className="mt-5 space-y-4">{resumo.evolucao.map((item) => <div key={item.mes}><div className="mb-1 flex justify-between gap-3 text-sm"><span>{item.mes.split("-").reverse().join("/")}</span><strong>{brl(item.total)}</strong></div><div className="h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><div className="h-full rounded-full bg-red-700" style={{ width: `${item.total / maiorVenda * 100}%` }} /></div></div>)}</div></section>
      <section className={card}><h2 className="font-semibold text-slate-900">Orçamentos do mês</h2><p className="mt-1 text-xs text-slate-500">Conversão dos orçamentos emitidos no mês selecionado</p><p className="mt-6 text-4xl font-bold text-red-700">{resumo.conversao}%</p><p className="mt-2 text-sm text-slate-600">{resumo.convertidos} de {resumo.orcamentos} orçamento(s) convertido(s) em pedido</p><div className="mt-6 border-t border-slate-100 pt-5"><h3 className="font-semibold text-slate-800">Pedidos em andamento</h3><p className="mt-2 text-2xl font-bold">{brl(resumo.valorAberto)}</p><p className="mt-1 text-xs text-slate-500">{resumo.abertos} pedido(s) pendente(s) ou rascunho(s), de todas as datas</p></div></section>
    </div>
    <section><h2 className="font-semibold text-slate-900">Financeiro atual</h2><p className="mb-4 mt-1 text-xs text-slate-500">Saldos em aberto de todas as datas. Vendas a prazo não representam dinheiro já recebido.</p><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Indicador titulo="Total a receber" valor={brl(resumo.aReceber)} detalhe={`Vencendo hoje: ${brl(resumo.receberHoje)}`} />
      <Indicador titulo="Recebimentos atrasados" valor={brl(resumo.receberVencido)} detalhe="Saldo com vencimento anterior a hoje" alerta={resumo.receberVencido > 0} />
      <Indicador titulo="Total a pagar" valor={brl(resumo.aPagar)} detalhe={`Vencendo hoje: ${brl(resumo.pagarHoje)}`} />
      <Indicador titulo="Pagamentos atrasados" valor={brl(resumo.pagarVencido)} detalhe="Saldo com vencimento anterior a hoje" alerta={resumo.pagarVencido > 0} />
    </div></section>
    <div className="grid gap-5 lg:grid-cols-2">
      <section className={card}><h2 className="font-semibold text-slate-900">Clientes com maior valor em compras</h2><p className="mt-1 text-xs text-slate-500">Pedidos concluídos no mês selecionado</p><div className="mt-4 divide-y divide-slate-100">{resumo.principaisClientes.map((item, index) => <div key={index} className="flex items-center justify-between gap-3 py-3 text-sm"><div><p className="font-medium">{item.nome}</p><p className="text-xs text-slate-500">{item.pedidos} pedido(s)</p></div><strong className="whitespace-nowrap">{brl(item.total)}</strong></div>)}{!resumo.principaisClientes.length && <p className="py-6 text-sm text-slate-500">Nenhuma venda concluída neste mês.</p>}</div></section>
      <section className={card}><h2 className="font-semibold text-slate-900">Estoque que precisa de reposição</h2><p className="mt-1 text-xs text-slate-500">{resumo.estoqueBaixo.length} produto(s) no mínimo ou abaixo · situação atual</p><div className="mt-4 max-h-80 overflow-auto">{resumo.estoqueBaixo.length ? <table className="w-full text-sm"><thead className="text-left text-xs text-slate-500"><tr><th className="py-2">Produto</th><th className="py-2 text-right">Atual</th><th className="py-2 text-right">Mínimo</th></tr></thead><tbody>{resumo.estoqueBaixo.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="py-3">{item.nome}</td><td className="py-3 text-right font-semibold text-red-700">{Number(item.quantidade || 0).toLocaleString("pt-BR")}</td><td className="py-3 text-right">{Number(item.estoqueMinimo || 0).toLocaleString("pt-BR")}</td></tr>)}</tbody></table> : <p className="py-6 text-sm text-slate-500">Nenhum produto precisa de reposição.</p>}</div></section>
    </div>
  </div>;
}
