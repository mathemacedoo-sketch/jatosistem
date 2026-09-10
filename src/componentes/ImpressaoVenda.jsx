import { createPortal } from "react-dom";
import { Printer } from "lucide-react";
import { calcularItem, dinheiro } from "../lib/pedido";
import "./ImpressaoVenda.css";

const brl = (valor) => Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const data = (valor) => valor ? String(valor).slice(0, 10).split("-").reverse().join("/") : "—";
const juntar = (...valores) => valores.filter(Boolean).join(", ");

export default function ImpressaoVenda({ documento, tipo, empresa = {}, cliente = {}, onClose }) {
  if (!documento) return null;
  const pedido = tipo === "pedido";
  const pessoa = { ...cliente, ...documento.clienteSnapshot };
  const itens = (documento.itens || []).map(calcularItem);
  const bruto = dinheiro(itens.reduce((soma, item) => soma + dinheiro(item.qtd * item.precoUnit), 0));
  const total = documento.total ?? dinheiro(itens.reduce((soma, item) => soma + item.subtotal, 0) - Number(documento.desconto || 0));
  const desconto = dinheiro(Math.max(0, bruto - total));
  const pagamentos = pedido ? documento.pagamentos || [] : [];
  const parcelasDosPagamentos = pagamentos.flatMap((pagamento) => (pagamento.parcelas || []).map((parcela) => ({ ...parcela, tipoPagamento: pagamento.tipoPagamento, formaPagamento: pagamento.formaPagamento })));
  const parcelas = pedido ? (documento.parcelas?.length ? documento.parcelas.map((parcela) => ({ ...parcelasDosPagamentos.find((item) => item.id === parcela.id), ...parcela })) : parcelasDosPagamentos) : [];
  const formas = [...new Set(pagamentos.map((pagamento) => pagamento.formaPagamento).filter(Boolean))].join(" / ") || documento.formaPagamento || "Não informada";
  const parcelasPrazo = parcelas.filter((parcela) => (parcela.tipoPagamento || documento.tipoPagamento || "prazo") === "prazo");
  const pendentes = parcelas.map((parcela) => ({ ...parcela, restante: parcela.status === "pago" ? 0 : dinheiro(Math.max(0, Number(parcela.valor || 0) - Number(parcela.valorPago || 0))) })).filter((parcela) => parcela.restante > 0);
  const saldo = parcelas.length ? dinheiro(pendentes.reduce((soma, parcela) => soma + parcela.restante, 0)) : documento.statusPagamento === "pago" ? 0 : dinheiro(Math.max(0, total - Number(documento.valorPago || 0)));

  return createPortal(<div className="venda-print-modal" role="dialog" aria-modal="true" aria-label={`Impressão de ${pedido ? "pedido" : "orçamento"}`}>
    <div className="venda-print-container">
      <div className="venda-print-actions">
        <button onClick={onClose}>Fechar</button>
        <button onClick={() => window.print()}><Printer size={17} /> Imprimir / Salvar PDF</button>
      </div>
      <article className={`venda-documento ${pedido ? "os-print-area" : "orcamento-print-area"}`}>
        <header className="venda-cabecalho">
          <div className="venda-empresa">
            <h1>{empresa.razaoSocial || empresa.nome || "Empresa"}</h1>
            {empresa.razaoSocial && empresa.nome && <div>{empresa.nome}</div>}
            {empresa.cnpj && <div>CNPJ: {empresa.cnpj}</div>}
            <div>{juntar(empresa.endereco, empresa.numero, empresa.bairro)}</div>
            <div>{juntar([empresa.cidade, empresa.estado].filter(Boolean).join(" / "), empresa.cep)}</div>
            {empresa.email && <div>{empresa.email}</div>}
            {empresa.telefone && <strong>{empresa.telefone}</strong>}
          </div>
          <div className="venda-titulo"><h2>{pedido ? "PEDIDO" : "ORÇAMENTO"}</h2>{pedido && documento.formaPagamento && <div>Pagamento: {documento.formaPagamento}</div>}</div>
          <div className="venda-numero"><strong>Nº {documento.numero || "Rascunho"}</strong><div>Emissão:<br /><strong>{data(documento.data)}</strong></div></div>
        </header>
        <section className="venda-cliente" aria-label="Dados do cliente">
          <div className="venda-cliente-nome"><b>Nome</b><span>{documento.clienteNome || pessoa.nome || "—"}</span></div>
          <div><b>CPF/CNPJ</b><span>{pessoa.cpfCnpj || "—"}</span></div>
          <div className="venda-cliente-nome"><b>Endereço</b><span>{juntar(pessoa.endereco, pessoa.numero, pessoa.complemento) || "—"}</span></div>
          <div><b>Telefone</b><span>{pessoa.telefone || "—"}</span></div>
          <div><b>Bairro</b><span>{pessoa.bairro || "—"}</span></div>
          <div><b>Cidade/UF</b><span>{[pessoa.cidade, pessoa.estado].filter(Boolean).join(" / ") || "—"}</span></div>
          <div><b>CEP</b><span>{pessoa.cep || "—"}</span></div>
        </section>
        <table className="venda-itens">
          <colgroup><col style={{ width: "11%" }} /><col /><col style={{ width: "9%" }} /><col style={{ width: "17%" }} /><col style={{ width: "17%" }} /></colgroup>
          <thead><tr><th>Código</th><th>Descrição do produto / serviço</th><th>Qtde.</th><th>Preço unit.</th><th>Total</th></tr></thead>
          <tbody>{itens.map((item, index) => <tr key={item.uidLine || item.id || index}><td>{item.codigo || "—"}</td><td>{item.descricao || item.nome}</td><td className="numero">{item.qtd.toLocaleString("pt-BR")}</td><td className="numero">{brl(item.precoUnit)}</td><td className="numero">{brl(item.subtotal)}</td></tr>)}</tbody>
        </table>
        <section className="venda-resumo">
          <div className="venda-observacao"><b>Observações</b><p>{documento.observacao || "—"}</p></div>
          <dl><div><dt>Desconto</dt><dd>{brl(desconto)}</dd></div><div className="venda-total"><dt>Total</dt><dd>{brl(total)}</dd></div></dl>
        </section>
        {pedido && <section className="venda-pagamento">
          <div className="venda-pagamento-titulo"><b>Pagamento</b><strong>Valor total: {brl(total)}</strong></div>
          <div className="venda-pagamento-titulo"><span><b>Forma de pagamento:</b> {formas}</span><strong>{saldo > 0 ? `A pagar: ${brl(saldo)}` : "Pago"}</strong></div>
          {parcelasPrazo.length > 0 && <table><thead><tr><th>Parcela</th><th>Forma de pagamento</th><th>Vencimento</th><th className="numero">Valor da parcela</th></tr></thead><tbody>{parcelasPrazo.map((parcela, index) => <tr key={parcela.id || index}><td>{parcela.numeroParcela || index + 1}/{parcela.totalParcelas || parcelasPrazo.length}</td><td>{parcela.formaPagamento || formas}</td><td>{data(parcela.dataVencimento)}</td><td className="numero">{brl(parcela.valor)}</td></tr>)}</tbody></table>}
          {!parcelas.length && documento.tipoPagamento !== "avista" && documento.dataVencimento && <p>Vencimento: {data(documento.dataVencimento)}</p>}
        </section>}
      </article>
    </div>
  </div>, document.body);
}
