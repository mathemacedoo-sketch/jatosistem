import { useId, useState } from "react";
import { Plus, Search, Trash2, X } from "lucide-react";
import { calcularItem, dinheiro, filtrarItensValidos, somarItens } from "../lib/pedido";

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const brl = (valor) => Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const inputCls = "app-input w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:bg-slate-100 disabled:text-slate-500";
const Field = ({ label, children }) => <label className="block space-y-1 text-sm"><span className="font-medium text-slate-600">{label}</span>{children}</label>;

export function ClienteDocumento({ db, clienteId, setClienteId, acao = null }) {
  const [buscaCliente, setBuscaCliente] = useState("");
  const [seletorClienteAberto, setSeletorClienteAberto] = useState(false);
  const dialogId = useId();
  const clientes = (db.clientes || []).map((cliente, index) => ({ ...cliente, codigoExibicao: cliente.codigo || String(index + 1).padStart(4, "0") }));
  const cliente = clientes.find((item) => String(item.id) === String(clienteId));
  const termo = buscaCliente.trim().toLowerCase().replace(/^#/, "");
  const clientesFiltrados = clientes.filter((item) => {
    const texto = `${item.nome} ${item.codigoExibicao} ${item.cpfCnpj || ""} ${item.telefone || ""}`.toLowerCase();
    const numeros = termo.replace(/\D/g, "");
    return !termo || texto.includes(termo) || (numeros.length >= 3 && `${item.cpfCnpj || ""} ${item.telefone || ""}`.replace(/\D/g, "").includes(numeros));
  });

  return <>
      <section className="app-card rounded-2xl border bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold text-slate-800">Cliente e dados pessoais</h2>{acao}</div>
        <div className="flex items-end gap-2">
          <div className="flex-1"><Field label="Cliente"><button type="button" onClick={() => { setBuscaCliente(""); setSeletorClienteAberto(true); }} className={`${inputCls} flex items-center justify-between text-left`}><span className={cliente ? "" : "text-slate-400"}>{cliente ? `#${cliente.codigoExibicao} · ${cliente.nome}` : "Selecione o cliente"}</span><Search size={17} /></button></Field></div>
          {cliente && <button type="button" onClick={() => setClienteId("")} className="rounded-lg p-2 text-slate-400 hover:text-red-700" aria-label="Limpar cliente"><X size={19} /></button>}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Nome / Razão social"><input readOnly className={inputCls} value={cliente?.nome || ""} /></Field>
          <Field label="CPF / CNPJ"><input readOnly className={inputCls} value={cliente?.cpfCnpj || ""} /></Field>
          <Field label="Telefone"><input readOnly className={inputCls} value={cliente?.telefone || ""} /></Field>
          <Field label="E-mail"><input readOnly className={inputCls} value={cliente?.email || ""} /></Field>
          <Field label="CEP"><input readOnly className={inputCls} value={cliente?.cep || ""} /></Field>
          <div className="sm:col-span-2"><Field label="Endereço"><input readOnly className={inputCls} value={[cliente?.endereco, cliente?.numero, cliente?.bairro].filter(Boolean).join(", ")} /></Field></div>
          <Field label="Cidade / UF"><input readOnly className={inputCls} value={[cliente?.cidade, cliente?.estado].filter(Boolean).join(" / ")} /></Field>
        </div>
      </section>
    {seletorClienteAberto && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby={dialogId}><div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><div className="mb-4 flex items-center justify-between"><h2 id={dialogId} className="font-semibold text-slate-900">Selecionar cliente</h2><button type="button" onClick={() => setSeletorClienteAberto(false)} aria-label="Fechar seleção de cliente" className="p-2 text-slate-400"><X size={18} /></button></div><input autoFocus aria-label="Pesquisar cliente" className={inputCls} placeholder="Nome, código, CPF/CNPJ ou telefone" value={buscaCliente} onChange={(event) => setBuscaCliente(event.target.value)} /><div className="mt-3 max-h-72 overflow-y-auto divide-y divide-slate-100">{clientesFiltrados.map((item) => <button type="button" key={item.id} onClick={() => { setClienteId(item.id); setSeletorClienteAberto(false); }} className="block w-full px-3 py-3 text-left text-sm hover:bg-red-50"><div className="font-semibold">#{item.codigoExibicao} · {item.nome}</div><div className="mt-1 text-xs text-slate-500">{[item.cpfCnpj, item.telefone].filter(Boolean).join(" · ")}</div></button>)}{!clientesFiltrados.length && <div className="p-6 text-center text-sm text-slate-400">Nenhum cliente encontrado.</div>}</div></div></div>}
  </>;
}

export function ItensDocumento({ db, itens, setItens, titulo = "Itens do pedido", podeEditarValor = true, comDesconto = true, desconto = 0, setDesconto }) {
  const catalogo = [
    ...(db.servicos || []).map((item, index) => ({ ...item, tipo: "servico", codigo: item.codigo || `S${String(index + 1).padStart(4, "0")}` })),
    ...(db.produtos || []).map((item, index) => ({ ...item, tipo: "produto", codigo: item.codigo || `P${String(index + 1).padStart(4, "0")}` })),
  ].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const itemsValidos = filtrarItensValidos(itens);
  const resumo = somarItens(itens, desconto);
  const atualizarItem = (id, dados) => setItens((anteriores) => anteriores.map((item) => item.uidLine === id ? { ...item, ...dados } : item));
  const selecionarItem = (id, chave) => {
    const origem = catalogo.find((item) => `${item.tipo}:${item.id}` === chave);
    atualizarItem(id, origem ? {
      itemId: origem.id, tipo: origem.tipo, codigo: origem.codigo, nome: origem.nome, descricao: origem.nome,
      precoUnit: origem.tipo === "servico" ? origem.preco || 0 : origem.precoVenda || origem.precoCusto || 0, desconto: 0,
    } : { itemId: null, tipo: "manual", codigo: "", nome: "", descricao: "", precoUnit: "", desconto: 0 });
  };
  return (
      <section className="app-card overflow-hidden rounded-2xl border bg-white">
        <div className="flex items-center justify-between gap-3 p-5"><h2 className="font-semibold text-slate-800">{titulo}</h2><button type="button" onClick={() => setItens((anteriores) => [...anteriores, { uidLine: uid(), itemId: null, tipo: "manual", codigo: "", descricao: "", nome: "", qtd: 1, precoUnit: "", desconto: 0 }])} className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white"><Plus size={16} /> Adicionar item</button></div>
        <div className="pedido-tabela">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-3 w-44">Cód.</th><th className="p-3">Descrição</th><th className="p-3 w-28">Quantidade</th><th className="p-3 w-36">Valor unitário</th>{comDesconto && <th className="p-3 w-32">Desconto (R$)</th>}<th className="p-3 w-32 text-right">Valor total</th><th className="w-12 p-3"><span className="sr-only">Ações</span></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {!itens.length && <tr><td colSpan={comDesconto ? 7 : 6} className="p-8 text-center text-slate-400">Clique em Adicionar item para inserir a primeira linha.</td></tr>}
              {itens.length > 0 && !itemsValidos.length && <tr><td colSpan={comDesconto ? 7 : 6} className="p-8 text-center text-sm text-slate-400">Nenhum item válido. Selecione um serviço ou produto e informe quantidade/valor.</td></tr>}
              {itens.map((item, index) => <tr key={item.uidLine}>
                <td className="p-2"><select aria-label={`Código do item ${index + 1}`} className={inputCls} value={item.itemId ? `${item.tipo}:${item.itemId}` : ""} onChange={(event) => selecionarItem(item.uidLine, event.target.value)}><option value="">{podeEditarValor ? "Selecione / manual" : "Selecione"}</option>{item.itemId && !catalogo.some((registro) => registro.tipo === item.tipo && String(registro.id) === String(item.itemId)) && <option value={`${item.tipo}:${item.itemId}`}>{item.codigo || "Item original"}</option>}{catalogo.map((registro) => <option key={`${registro.tipo}:${registro.id}`} value={`${registro.tipo}:${registro.id}`}>{registro.codigo} · {registro.nome}</option>)}</select></td>
                <td className="p-2"><input aria-label={`Descrição do item ${index + 1}`} className={inputCls} placeholder="Descrição do item" disabled={!podeEditarValor && !item.itemId} value={item.descricao} onChange={(event) => atualizarItem(item.uidLine, { descricao: event.target.value })} /></td>
                <td className="p-2"><input aria-label={`Quantidade do item ${index + 1}`} type="number" min="0.001" step="0.001" className={inputCls} value={item.qtd} onChange={(event) => atualizarItem(item.uidLine, { qtd: event.target.value })} /></td>
                <td className="p-2"><input aria-label={`Valor unitário do item ${index + 1}`} type="number" min="0" step="0.01" disabled={!podeEditarValor} className={inputCls} value={item.precoUnit} onChange={(event) => atualizarItem(item.uidLine, { precoUnit: event.target.value })} /></td>
                {comDesconto && <td className="p-2"><input aria-label={`Desconto do item ${index + 1}`} type="number" min="0" max={dinheiro(Number(item.qtd) * Number(item.precoUnit))} step="0.01" className={inputCls} value={item.desconto} onChange={(event) => atualizarItem(item.uidLine, { desconto: event.target.value })} /></td>}
                <td className="p-3 text-right font-semibold whitespace-nowrap">{brl(calcularItem(item).subtotal)}</td>
                <td className="p-2"><button type="button" aria-label={`Remover item ${index + 1}`} className="p-2 text-slate-400 hover:text-red-600" onClick={() => setItens((anteriores) => anteriores.filter((registro) => registro.uidLine !== item.uidLine))}><Trash2 size={17} /></button></td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-end justify-end gap-6 border-t border-slate-100 p-5">
          {comDesconto && <div className="w-44"><Field label="Desconto geral (R$)"><input type="number" min="0" max={resumo.subtotal} step="0.01" className={inputCls} value={desconto} onChange={(event) => setDesconto(event.target.value)} placeholder="0,00" /></Field></div>}
          <div className="text-right"><div className="text-xs text-slate-500">Subtotal dos itens: {brl(resumo.subtotal)}</div><div className="mt-1 text-xl font-bold text-slate-900">Total: {brl(resumo.total)}</div></div>
        </div>
      </section>
  );
}

export function ObservacoesDocumento({ tipo = "pedido", observacao, setObservacao }) {
  return (<section className="app-card rounded-2xl border bg-white p-5"><Field label={"Observações do " + tipo}><textarea rows={3} className={inputCls} placeholder={"Informações adicionais do " + tipo} value={observacao} onChange={(event) => setObservacao(event.target.value)} /></Field></section>);
}
