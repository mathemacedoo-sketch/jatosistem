import { useEffect, useId, useState } from "react";
import { Plus, Search, Trash2, X } from "lucide-react";
import { calcularItem, dinheiro, filtrarItensValidos, somarItens } from "../lib/pedido";

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const brl = (valor) => Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const inputCls = "app-input w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:bg-slate-100 disabled:text-slate-500";
const Field = ({ label, children }) => <label className="block space-y-1 text-sm"><span className="font-medium text-slate-600">{label}</span>{children}</label>;

export function veiculosDoCliente(cliente = {}) {
  if (Array.isArray(cliente.veiculos) && cliente.veiculos.length) {
    return cliente.veiculos.map((veiculo, index) => ({ ...veiculo, id: String(veiculo.id || `veiculo-${index + 1}`) }));
  }
  return cliente.tipoVeiculo || cliente.marca || cliente.veiculo || cliente.cor || cliente.ano || cliente.placa
    ? [{
        id: `legado-${cliente.id || "cliente"}`,
        tipoVeiculo: cliente.tipoVeiculo || "",
        marca: cliente.marca || "",
        veiculo: cliente.veiculo || "",
        cor: cliente.cor || "",
        ano: cliente.ano || "",
        placa: cliente.placa || "",
      }]
    : [];
}

export function ClienteDocumento({
  db, clienteId, setClienteId, acao = null, veiculoId = "", setVeiculoId = () => {},
  porteVeiculo = "", setPorteVeiculo = () => {},
}) {
  const [buscaCliente, setBuscaCliente] = useState("");
  const [seletorClienteAberto, setSeletorClienteAberto] = useState(false);
  const dialogId = useId();
  const clientes = (db.clientes || []).map((cliente, index) => ({ ...cliente, codigoExibicao: cliente.codigo || String(index + 1).padStart(4, "0") }));
  const cliente = clientes.find((item) => String(item.id) === String(clienteId));
  const veiculos = veiculosDoCliente(cliente);
  const veiculoSelecionado = veiculos.find((item) => String(item.id) === String(veiculoId)) || (veiculos.length === 1 ? veiculos[0] : null);
  const visitas = (db.ordens || []).filter((ordem) =>
    String(ordem.clienteId) === String(clienteId)
    && ordem.statusOS === "concluido"
    && !ordem.lancamentoManual
  ).length;
  const portes = ["Moto", "Pequeno", "Médio", "SUV", "Grande"];
  const termo = buscaCliente.trim().toLowerCase().replace(/^#/, "");
  const clientesFiltrados = clientes.filter((item) => {
    const veiculos = veiculosDoCliente(item);
    const texto = `${item.nome} ${item.codigoExibicao} ${item.cpfCnpj || ""} ${item.telefone || ""} ${veiculos.map((veiculo) => veiculo.placa || "").join(" ")}`.toLowerCase();
    const placaTermo = termo.replace(/[^a-z0-9]/g, "");
    const placaEncontrada = placaTermo.length >= 3 && veiculos.some((veiculo) =>
      String(veiculo.placa || "").toLowerCase().replace(/[^a-z0-9]/g, "").includes(placaTermo)
    );
    const numeros = termo.replace(/\D/g, "");
    return !termo || texto.includes(termo) || placaEncontrada || (numeros.length >= 3 && `${item.cpfCnpj || ""} ${item.telefone || ""}`.replace(/\D/g, "").includes(numeros));
  });
  useEffect(() => {
    if (veiculos.length === 1 && !veiculoId) setVeiculoId(veiculos[0].id);
  }, [clienteId, veiculos.length, veiculoId, setVeiculoId]);

  return <>
    <section className="app-card rounded-2xl border bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-cyan-700 text-sm font-bold text-white">1</span><h2 className="font-semibold text-slate-900">Veículo e cliente</h2></div>{acao}</div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field label="Cliente ou placa">
          <button type="button" onClick={() => { setBuscaCliente(""); setSeletorClienteAberto(true); }} className={`${inputCls} flex min-h-12 items-center justify-between text-left`}>
            <span className={cliente ? "truncate font-medium text-slate-900" : "text-slate-400"}>{cliente ? cliente.nome : "Buscar por nome, telefone ou placa"}</span><Search size={18} />
          </button>
        </Field>
        {cliente && <button type="button" onClick={() => { setClienteId(""); setVeiculoId(""); setPorteVeiculo(""); }} className="rounded-lg border border-slate-200 px-3 py-3 text-sm text-slate-600 hover:bg-slate-50">Trocar cliente</button>}
      </div>
      {cliente && <div className="mt-3 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong>{cliente.nome}</strong><span className="text-xs">{visitas + 1}ª visita</span></div>
        <p className="mt-1 text-xs text-green-800">{[cliente.telefone, cliente.cpfCnpj].filter(Boolean).join(" · ") || "Dados de contato não informados"}</p>
      </div>}
      {veiculos.length > 0 && <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {veiculos.length > 1 && <Field label="Veículo cadastrado"><select className={inputCls} value={veiculoSelecionado?.id || ""} onChange={(event) => { setVeiculoId(event.target.value); setPorteVeiculo(""); }}><option value="">Selecione o veículo</option>{veiculos.map((veiculo, index) => <option key={veiculo.id} value={veiculo.id}>{[veiculo.placa, veiculo.marca, veiculo.veiculo || veiculo.tipoVeiculo].filter(Boolean).join(" · ") || `Veículo ${index + 1}`}</option>)}</select></Field>}
        <div className={veiculos.length > 1 ? "" : "sm:col-span-2"}>
          <p className="mb-1 text-sm font-medium text-slate-600">Veículo selecionado</p>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800">
            <strong>{veiculoSelecionado?.placa || "Placa não informada"}</strong>
            <span className="ml-2 text-slate-600">{[veiculoSelecionado?.marca, veiculoSelecionado?.veiculo || veiculoSelecionado?.tipoVeiculo, veiculoSelecionado?.cor].filter(Boolean).join(" · ")}</span>
          </div>
        </div>
      </div>}
      {cliente && <div className="mt-4">
        <p className="mb-2 text-sm font-medium text-slate-700">Porte do veículo</p>
        <div className="flex flex-wrap gap-2">{portes.map((porte) => <button key={porte} type="button" aria-pressed={porteVeiculo === porte} onClick={() => setPorteVeiculo(porte)} className={`rounded-lg border px-3 py-2 text-sm transition ${porteVeiculo === porte ? "border-cyan-700 bg-cyan-100 font-semibold text-cyan-900 ring-1 ring-cyan-600" : "border-slate-300 bg-white text-slate-700 hover:border-cyan-500"}`}>{porte}</button>)}</div>
        <p className="mt-1 text-xs text-slate-500">O porte fica registrado na OS e não altera os valores automaticamente.</p>
      </div>}
      {cliente && <details className="mt-4 border-t border-slate-100 pt-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-600">Ver dados completos do cliente</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="CPF / CNPJ"><input readOnly className={inputCls} value={cliente.cpfCnpj || ""} /></Field>
          <Field label="E-mail"><input readOnly className={inputCls} value={cliente.email || ""} /></Field>
          <Field label="CEP"><input readOnly className={inputCls} value={cliente.cep || ""} /></Field>
          <Field label="Endereço"><input readOnly className={inputCls} value={[cliente.endereco, cliente.numero, cliente.bairro].filter(Boolean).join(", ")} /></Field>
        </div>
      </details>}
    </section>
    {seletorClienteAberto && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby={dialogId}><div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><div className="mb-4 flex items-center justify-between"><h2 id={dialogId} className="font-semibold text-slate-900">Buscar cliente ou placa</h2><button type="button" onClick={() => setSeletorClienteAberto(false)} aria-label="Fechar seleção de cliente" className="p-2 text-slate-400"><X size={18} /></button></div><input autoFocus aria-label="Pesquisar cliente ou placa" className={inputCls} placeholder="Nome, placa, código, CPF/CNPJ ou telefone" value={buscaCliente} onChange={(event) => setBuscaCliente(event.target.value)} /><div className="mt-3 max-h-72 overflow-y-auto divide-y divide-slate-100">{clientesFiltrados.map((item) => <button type="button" key={item.id} onClick={() => { const primeiroVeiculo = veiculosDoCliente(item)[0]; setClienteId(item.id); setVeiculoId(primeiroVeiculo?.id || ""); setPorteVeiculo(""); setSeletorClienteAberto(false); }} className="block w-full px-3 py-3 text-left text-sm hover:bg-cyan-50"><div className="font-semibold">#{item.codigoExibicao} · {item.nome}</div><div className="mt-1 text-xs text-slate-500">{[item.telefone, ...veiculosDoCliente(item).map((veiculo) => veiculo.placa)].filter(Boolean).join(" · ")}</div></button>)}{!clientesFiltrados.length && <div className="p-6 text-center text-sm text-slate-400">Nenhum cliente encontrado.</div>}</div></div></div>}
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
  const alternarServico = (servico) => {
    const existente = itens.find((item) => item.tipo === "servico" && String(item.itemId) === String(servico.id));
    if (existente) {
      setItens((anteriores) => anteriores.filter((item) => !(item.tipo === "servico" && String(item.itemId) === String(servico.id))));
      return;
    }
    setItens((anteriores) => [...anteriores, {
      uidLine: uid(), itemId: servico.id, tipo: "servico",
      codigo: servico.codigo, nome: servico.nome, descricao: servico.nome,
      qtd: 1, precoUnit: servico.preco || 0, desconto: 0,
    }]);
  };
  return (
      <section className="app-card overflow-hidden rounded-2xl border bg-white">
        <div className="flex items-center gap-3 p-5 pb-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-slate-900 text-sm font-bold text-white">2</span><div><h2 className="font-semibold text-slate-900">O que vai ser feito?</h2><p className="mt-0.5 text-xs text-slate-500">{titulo}</p></div></div>
        <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-3">
          {catalogo.filter((item) => item.tipo === "servico").map((servico) => {
            const selecionado = itens.some((item) => item.tipo === "servico" && String(item.itemId) === String(servico.id));
            return <button key={servico.id} type="button" aria-pressed={selecionado} onClick={() => alternarServico(servico)} className={`min-h-28 rounded-xl border p-3 text-left transition ${selecionado ? "border-cyan-700 bg-cyan-50 ring-1 ring-cyan-600" : "border-slate-200 bg-white hover:border-cyan-500 hover:bg-cyan-50/40"}`}>
              <div className="flex items-start justify-between gap-2"><strong className="text-sm text-slate-900">{servico.nome}</strong><span aria-hidden="true" className={`grid h-5 w-5 shrink-0 place-items-center rounded border text-xs ${selecionado ? "border-cyan-700 bg-cyan-700 text-white" : "border-slate-300 text-transparent"}`}>✓</span></div>
              <p className="mt-3 text-lg font-bold text-slate-900">{brl(servico.preco || 0)}</p>
            </button>;
          })}
          {!catalogo.some((item) => item.tipo === "servico") && <p className="text-sm text-slate-500">Nenhum serviço cadastrado no catálogo.</p>}
        </div>
        <details className="border-t border-slate-100">
          <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-slate-700">Adicionar produto, item manual ou ajustar itens</summary>
          <div className="flex justify-end px-5 pb-3"><button type="button" onClick={() => setItens((anteriores) => [...anteriores, { uidLine: uid(), itemId: null, tipo: "manual", codigo: "", descricao: "", nome: "", qtd: 1, precoUnit: "", desconto: 0 }])} className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white"><Plus size={16} /> Adicionar item</button></div>
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
        </details>
      </section>
  );
}

export function ResumoDocumento({
  db, itens, desconto = 0, lavadorId = "", setLavadorId = () => {},
  notificarWhatsapp = false, setNotificarWhatsapp = () => {}, disabled = false, compact = false, className = "", children,
}) {
  const resumo = somarItens(itens, desconto);
  const lavadores = db.funcionarios || [];
  return <aside className={`app-card h-fit rounded-2xl border bg-white p-5 lg:sticky lg:top-4 ${className}`}>
    <h2 className="text-lg font-bold text-slate-900">Resumo</h2>
    <div className="mt-4 space-y-3">
      {filtrarItensValidos(itens).map((item) => <div key={item.uidLine} className="flex justify-between gap-4 text-sm">
        <span className="min-w-0 truncate text-slate-600">{item.descricao || item.nome}{Number(item.qtd) > 1 ? ` × ${item.qtd}` : ""}</span>
        <span className="shrink-0 font-medium text-slate-800">{brl(calcularItem(item).subtotal)}</span>
      </div>)}
      {!filtrarItensValidos(itens).length && <p className="text-sm text-slate-500">Selecione serviços para montar o resumo.</p>}
    </div>
    <div className={`${compact ? "mt-3 pt-3" : "mt-4 pt-4"} border-t border-slate-200`}>
      <Field label="Lavador responsável">
        <select disabled={disabled} className={inputCls} value={lavadorId} onChange={(event) => setLavadorId(event.target.value)}>
          <option value="">{lavadores.length ? "Selecione o lavador" : "Cadastre um funcionário primeiro"}</option>
          {lavadores.map((lavador) => <option key={lavador.id} value={lavador.id}>{lavador.nome}{lavador.cargo ? ` · ${lavador.cargo}` : ""}</option>)}
        </select>
      </Field>
      <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
        <input disabled={disabled} type="checkbox" className="mt-0.5 accent-cyan-700" checked={notificarWhatsapp} onChange={(event) => setNotificarWhatsapp(event.target.checked)} />
        <span>Abrir WhatsApp com mensagem pronta quando o veículo ficar pronto</span>
      </label>
      {!compact && <p className="mt-2 text-xs text-slate-500">O envio é confirmado pela equipe no WhatsApp. Não há disparo automático.</p>}
    </div>
    <div className={`${compact ? "mt-3 pt-3" : "mt-5 pt-4"} border-t border-slate-200`}>
      {resumo.desconto > 0 && <div className="mb-2 flex justify-between text-sm text-slate-500"><span>Desconto</span><span>- {brl(resumo.desconto)}</span></div>}
      <div className="flex items-center justify-between gap-3"><span className="text-lg font-bold text-slate-900">Total</span><strong className="text-2xl text-slate-900">{brl(resumo.total)}</strong></div>
    </div>
    {children && <div className={`${compact ? "mt-3 space-y-1" : "mt-4 space-y-2"}`}>{children}</div>}
  </aside>;
}

export function ObservacoesDocumento({ tipo = "pedido", observacao, setObservacao }) {
  return (<section className="app-card rounded-2xl border bg-white p-5"><Field label={"Observações do " + tipo}><textarea rows={3} className={inputCls} placeholder={"Informações adicionais do " + tipo} value={observacao} onChange={(event) => setObservacao(event.target.value)} /></Field></section>);
}
